// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

//nolint:gosmopolitan // Bilingual tool contracts are intentional.
package apiv2

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"sort"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/models"
	"code.vikunja.io/api/pkg/modules/tcyai"
	"code.vikunja.io/api/pkg/web"
	"github.com/danielgtaylor/huma/v2"
	"xorm.io/xorm"
	"xorm.io/xorm/schemas"
)

// aiExecution never retains an Echo context. Business permission checks are repeated for every operation.
type aiExecution struct {
	api    huma.API
	caller *http.Request
	auth   web.Auth
	input  tcyai.RunInput
}

func newAIExecution(ctx context.Context, api huma.API, caller *http.Request, input tcyai.RunInput) (*aiExecution, error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	return &aiExecution{api: api, caller: caller, auth: a, input: input}, nil
}
func (e *aiExecution) scope(pid int64) error {
	if len(e.input.WriteProjectIDs) > 0 && !slices.Contains(e.input.WriteProjectIDs, pid) {
		return tcyai.ToolFailure("SCOPE_DENIED", "The target project is outside this run's explicit write scope.")
	}
	return nil
}
func (e *aiExecution) read(ctx context.Context, name string, args any) (string, error) {
	raw, err := json.Marshal(args)
	if err != nil {
		return "", err
	}
	return dispatchAI(ctx, e.api, e.caller, name, raw)
}

type aiChange struct {
	ID      int64                      `json:"id"`
	Changes map[string]json.RawMessage `json:"changes"`
}

func aiChanges(name string, raw json.RawMessage) ([]aiChange, error) {
	if name == "bulk_update_tasks" {
		var a struct {
			Updates []aiChange `json:"updates"`
		}
		err := json.Unmarshal(raw, &a)
		if err != nil {
			return nil, err
		}
		seen := map[int64]bool{}
		for _, u := range a.Updates {
			if seen[u.ID] {
				return nil, tcyai.ToolFailure("INVALID_ARGUMENTS", "Bulk targets must have distinct IDs.")
			}
			seen[u.ID] = true
		}
		sort.Slice(a.Updates, func(i, j int) bool { return a.Updates[i].ID < a.Updates[j].ID })
		return a.Updates, nil
	}
	var args map[string]json.RawMessage
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, err
	}
	var id int64
	_ = json.Unmarshal(args["id"], &id)
	delete(args, "id")
	return []aiChange{{ID: id, Changes: args}}, nil
}

// Use the same stable representation for HTTP previews and locked database reads.
func aiTaskSnapshot(raw []byte) (map[string]any, error) {
	var task map[string]any
	if err := json.Unmarshal(raw, &task); err != nil {
		return nil, err
	}
	out := map[string]any{}
	for _, k := range []string{"id", "project_id", "title", "description", "due_date", "start_date", "end_date", "priority", "done", "updated"} {
		out[k] = task[k]
	}
	// Reminder row IDs may change when a reminder list is replaced; compare its actual trigger times.
	reminders := []string{}
	if rs, ok := task["reminders"].([]any); ok {
		for _, r := range rs {
			if m, ok := r.(map[string]any); ok {
				reminders = append(reminders, fmt.Sprint(m["reminder"]))
			}
		}
	}
	sort.Strings(reminders)
	out["reminders"] = reminders
	return out, nil
}
func aiSnapshotVersion(before []map[string]any) (string, string, error) {
	raw, err := json.Marshal(before)
	return string(raw), fmt.Sprintf("%x", sha256.Sum256(raw)), err
}
func (e *aiExecution) prepare(ctx context.Context, name string, raw json.RawMessage) (tcyai.Operation, error) {
	op := tcyai.Operation{Units: 1, ProjectIDs: []int64{}, After: string(raw)}
	if !tcyai.IsWriteTool(name) {
		return op, nil
	}
	if name == "create_project" || name == "create_label" {
		if len(e.input.WriteProjectIDs) > 0 {
			return op, tcyai.ToolFailure("SCOPE_DENIED", "Account-wide creation is unavailable while a project write scope is selected.")
		}
		op.Before = "null"
		return op, nil
	}
	if name == "create_task" {
		var a struct {
			ProjectID int64 `json:"project_id"`
		}
		_ = json.Unmarshal(raw, &a)
		if err := e.scope(a.ProjectID); err != nil {
			return op, err
		}
		data, err := e.read(ctx, "get_project", map[string]any{"id": a.ProjectID})
		if err != nil {
			return op, err
		}
		var p map[string]any
		_ = json.Unmarshal([]byte(data), &p)
		op.Before, _ = marshalAI(map[string]any{"project_id": a.ProjectID, "project_title": p["title"]})
		op.ProjectIDs = []int64{a.ProjectID}
		return op, nil
	}
	changes, err := aiChanges(name, raw)
	if err != nil {
		return op, err
	}
	before := []map[string]any{}
	for _, change := range changes {
		data, err := e.read(ctx, "get_task", map[string]any{"id": change.ID})
		if err != nil {
			return op, err
		}
		task, err := aiTaskSnapshot([]byte(data))
		if err != nil {
			return op, err
		}
		pid := int64(task["project_id"].(float64))
		if err = e.scope(pid); err != nil {
			return op, err
		}
		before = append(before, task)
		if !slices.Contains(op.ProjectIDs, pid) {
			op.ProjectIDs = append(op.ProjectIDs, pid)
		}
	}
	// Relations affect both ends, so both projects must fall in the explicit scope and be readable.
	if name == "relate_tasks" || name == "unrelate_tasks" {
		var a struct {
			Other int64 `json:"other_task_id"`
		}
		_ = json.Unmarshal(raw, &a)
		data, err := e.read(ctx, "get_task", map[string]any{"id": a.Other})
		if err != nil {
			return op, err
		}
		task, err := aiTaskSnapshot([]byte(data))
		if err != nil {
			return op, err
		}
		pid := int64(task["project_id"].(float64))
		if err = e.scope(pid); err != nil {
			return op, err
		}
		before = append(before, task)
		if !slices.Contains(op.ProjectIDs, pid) {
			op.ProjectIDs = append(op.ProjectIDs, pid)
		}
	}
	op.Units = len(changes)
	op.Before, op.Version, err = aiSnapshotVersion(before)
	return op, err
}
func marshalAI(value any) (string, error) { raw, err := json.Marshal(value); return string(raw), err }
func (e *aiExecution) execute(ctx context.Context, name string, raw json.RawMessage) (string, error) {
	if !tcyai.IsWriteTool(name) {
		return dispatchAI(ctx, e.api, e.caller, name, raw)
	}
	// Revalidate the current JWT and project scope even for a resumed operation.
	preview, err := e.prepare(ctx, name, raw)
	if err != nil {
		return "", err
	}
	op := tcyai.CurrentOperation(ctx)
	if op != nil && op.Version != "" && preview.Version != op.Version {
		return "", tcyai.ToolFailure("STATE_CONFLICT", "The task changed after preparation. Read the current task and prepare a fresh operation.")
	}
	if name == "update_task" || name == "bulk_update_tasks" || name == "delete_task" {
		return e.mutateTasks(ctx, name, raw, preview)
	}
	return dispatchAI(ctx, e.api, e.caller, name, raw)
}
func (e *aiExecution) mutateTasks(ctx context.Context, name string, raw json.RawMessage, preview tcyai.Operation) (string, error) {
	changes, err := aiChanges(name, raw)
	if err != nil {
		return "", err
	}
	s := db.NewSession()
	defer s.Close()
	db.SetSessionContext(ctx, s)
	tasks, err := e.lockTasks(ctx, s, changes, name, preview)
	if err != nil {
		return "", err
	}
	output := []*models.Task{}
	for _, change := range changes {
		if name == "delete_task" {
			if err = tasks[change.ID].Delete(s, e.auth); err != nil {
				return "", err
			}
			continue
		}
		data, err := json.Marshal(change.Changes)
		if err != nil {
			return "", err
		}
		values := &models.Task{}
		if err = json.Unmarshal(data, values); err != nil {
			return "", err
		}
		old := tasks[change.ID]
		start, end := old.StartDate, old.EndDate
		if _, ok := change.Changes["start_date"]; ok {
			start = values.StartDate
		}
		if _, ok := change.Changes["end_date"]; ok {
			end = values.EndDate
		}
		if !start.IsZero() && !end.IsZero() && end.Before(start) {
			return "", tcyai.ToolFailure("INVALID_DATE_RANGE", "End time must be at or after start time.")
		}
		fields := []string{}
		for field := range change.Changes {
			fields = append(fields, field)
		}
		sort.Strings(fields)
		bulk := &models.BulkTask{TaskIDs: []int64{change.ID}, Fields: fields, Values: values}
		can, err := bulk.CanUpdate(s, e.auth)
		if err != nil {
			return "", err
		}
		if !can {
			return "", tcyai.ToolFailure("FORBIDDEN", "Current project permissions deny this change.")
		}
		if err = bulk.Update(s, e.auth); err != nil {
			return "", err
		}
		// Return the actual business-model result, including recurring-task normalization, rather than echoing the proposal.
		output = append(output, bulk.Tasks...)
	}
	if err = ctx.Err(); err != nil {
		return "", err
	}
	if err = s.Commit(); err != nil {
		return "", &tcyai.ToolError{Code: "WRITE_UNCERTAIN", Message: "Database commit failed; check actual task state before retrying.", Uncertain: true}
	}
	if op := tcyai.CurrentOperation(ctx); op != nil {
		op.Verified = true
	}
	if name == "delete_task" {
		return `{"success":true,"deleted":true}`, nil
	}
	if len(output) == 1 && name == "update_task" {
		return marshalAI(output[0])
	}
	return marshalAI(output)
}

func (e *aiExecution) lockTasks(ctx context.Context, s *xorm.Session, changes []aiChange, name string, preview tcyai.Operation) (map[int64]*models.Task, error) {
	var err error
	before := []map[string]any{}
	tasks := map[int64]*models.Task{}
	for _, change := range changes {
		if err = ctx.Err(); err != nil {
			return nil, err
		}
		locking := s
		if kind := db.Type(); kind == schemas.MYSQL || kind == schemas.POSTGRES {
			locking = s.ForUpdate()
		}
		task, err := models.GetTaskSimple(locking, &models.Task{ID: change.ID})
		if err != nil {
			return nil, err
		}
		if err = e.scope(task.ProjectID); err != nil {
			return nil, err
		}
		can, err := task.CanUpdate(s, e.auth)
		if name == "delete_task" {
			can, err = task.CanDelete(s, e.auth)
		}
		if err != nil {
			return nil, err
		}
		if !can {
			return nil, tcyai.ToolFailure("FORBIDDEN", "Current project permissions deny this operation.")
		}
		if err = task.ReadOne(s, e.auth); err != nil {
			return nil, err
		}
		data, err := json.Marshal(task)
		if err != nil {
			return nil, err
		}
		snapshot, err := aiTaskSnapshot(data)
		if err != nil {
			return nil, err
		}
		before = append(before, snapshot)
		tasks[change.ID] = &task
	}
	_, version, err := aiSnapshotVersion(before)
	if err != nil {
		return nil, err
	}
	if version != preview.Version {
		return nil, tcyai.ToolFailure("STATE_CONFLICT", "The task changed before the transaction obtained its lock. Read the current state before retrying.")
	}
	return tasks, nil
}
