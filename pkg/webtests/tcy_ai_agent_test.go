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
package webtests

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"code.vikunja.io/api/pkg/config"
	"code.vikunja.io/api/pkg/i18n"
	"code.vikunja.io/api/pkg/modules/tcyai"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTCYAIAgentExecution(t *testing.T) {
	i18n.Init()
	e, err := setupTestEnv()
	require.NoError(t, err)
	token, other := humaTokenFor(t, &testuser1), humaTokenFor(t, &testuser2)
	oldPath, oldAllow := config.FilesBasePath.GetString(), config.OutgoingRequestsAllowNonRoutableIPs.GetBool()
	config.FilesBasePath.Set(t.TempDir())
	config.OutgoingRequestsAllowNonRoutableIPs.Set(true)
	t.Cleanup(func() { config.FilesBasePath.Set(oldPath); config.OutgoingRequestsAllowNonRoutableIPs.Set(oldAllow) })
	provider := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []tcyai.Message  `json:"messages"`
			Tools    []map[string]any `json:"tools"`
		}
		if !assert.NoError(t, json.NewDecoder(r.Body).Decode(&body)) {
			return
		}
		last := body.Messages[len(body.Messages)-1]
		var request struct {
			Tool string          `json:"tool"`
			Args json.RawMessage `json:"args"`
		}
		for _, m := range body.Messages {
			if m.Role == "user" {
				_ = json.Unmarshal([]byte(m.Content), &request)
			}
		}
		name, args := request.Tool, request.Args
		if last.Role == "tool" && !strings.Contains(last.Content, `"note":"These tools`) {
			name = ""
		}
		loaded := false
		for _, tool := range body.Tools {
			fn, _ := tool["function"].(map[string]any)
			if fn["name"] == request.Tool {
				loaded = true
			}
		}
		if name != "" && !loaded {
			name = "find_tools"
			args = json.RawMessage(fmt.Sprintf(`{"query":%q}`, request.Tool))
		}
		message := map[string]any{"role": "assistant", "content": "Done"}
		if name != "" {
			message["content"] = ""
			message["tool_calls"] = []any{map[string]any{"id": "call-" + uuid.NewString(), "type": "function", "function": map[string]any{"name": name, "arguments": string(args)}}}
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Request-ID", "fixture-provider-request")
		_ = json.NewEncoder(w).Encode(map[string]any{"model": "fixture-actual", "choices": []any{map[string]any{"message": message}}, "usage": map[string]int{"prompt_tokens": 10, "completion_tokens": 5}})
	}))
	defer provider.Close()
	pool := x509.NewCertPool()
	pool.AddCert(provider.Certificate())
	original := http.DefaultTransport
	transport := original.(*http.Transport).Clone()
	transport.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = original; transport.CloseIdleConnections() })
	settings := fmt.Sprintf(`{"connections":[{"id":"fixture","name":"fixture","kind":"chat","protocol":"openai-chat","base_url":%q,"model":"requested","api_key":"never-export-private"}],"assistant":"fixture"}`, provider.URL)
	require.Equal(t, 200, humaRequest(t, e, "POST", "/api/v2/ai/settings", settings, token, "").Code)
	var project struct {
		ID int64 `json:"id"`
	}
	rec := humaRequest(t, e, "POST", "/api/v2/projects", `{"title":"Agent transaction fixture"}`, token, "")
	require.Equal(t, 201, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &project))
	createTask := func(title string) int64 {
		rec := humaRequest(t, e, "POST", fmt.Sprintf("/api/v2/projects/%d/tasks", project.ID), fmt.Sprintf(`{"title":%q,"description":"preserve this description","priority":3}`, title), token, "")
		require.Equal(t, 201, rec.Code, rec.Body.String())
		var task struct {
			ID int64 `json:"id"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &task))
		return task.ID
	}
	one, two := createTask("one"), createTask("two")
	readTask := func(id int64) string {
		rec := humaRequest(t, e, "GET", fmt.Sprintf("/api/v2/tasks/%d", id), "", token, "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		return rec.Body.String()
	}
	wait := func(path string) tcyai.Conversation {
		var result tcyai.Conversation
		require.Eventually(t, func() bool {
			rec := humaRequest(t, e, "GET", path, "", token, "")
			if rec.Code != 200 {
				return false
			}
			if json.Unmarshal(rec.Body.Bytes(), &result) != nil || len(result.Turns) == 0 {
				return false
			}
			return result.Turns[len(result.Turns)-1].Status != "running"
		}, 5*time.Second, 10*time.Millisecond)
		return result
	}
	start := func(tool string, args any, policy string, scope []int64, budget int) (string, tcyai.Conversation) {
		rec := humaRequest(t, e, "POST", "/api/v2/ai/conversations", `{"title":"Agent review"}`, token, "")
		require.Equal(t, 201, rec.Code, rec.Body.String())
		var conv tcyai.Conversation
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &conv))
		path := "/api/v2/ai/conversations/" + conv.ID
		prompt, encodeErr := json.Marshal(map[string]any{"tool": tool, "args": args})
		require.NoError(t, encodeErr)
		body, encodeErr := json.Marshal(map[string]any{"message": string(prompt), "mode": "write", "approval": policy, "request_id": uuid.NewString(), "write_project_ids": scope, "max_operations": budget, "allow_delete": true})
		require.NoError(t, encodeErr)
		rec = humaRequest(t, e, "POST", path+"/messages", string(body), token, "")
		require.Equal(t, 201, rec.Code, rec.Body.String())
		return path, wait(path)
	}
	review := func(path string, conv tcyai.Conversation, decision, args string) *httptest.ResponseRecorder {
		last := conv.Turns[len(conv.Turns)-1]
		op := ""
		if last.Result.Pending != nil {
			op = last.Result.Pending.ID
		}
		body, encodeErr := json.Marshal(tcyai.ReviewInput{TurnID: last.ID, OperationID: op, Decision: decision, Arguments: args})
		require.NoError(t, encodeErr)
		return humaRequest(t, e, "POST", path+"/review", string(body), token, "")
	}
	path, conv := start("update_task", map[string]any{"id": one, "title": "proposed"}, "review", nil, 0)
	require.Equal(t, "awaiting_approval", conv.Turns[0].Status)
	require.NotNil(t, conv.Turns[0].Result.Pending)
	assert.Contains(t, readTask(one), `"title":"one"`)
	require.Equal(t, 404, humaRequest(t, e, "POST", path+"/review", fmt.Sprintf(`{"turn_id":%q,"decision":"approve"}`, conv.Turns[0].ID), other, "").Code)
	edited := review(path, conv, "edit", fmt.Sprintf(`{"id":%d,"title":"edited"}`, one))
	require.Equal(t, 201, edited.Code, edited.Body.String())
	var edit tcyai.Conversation
	require.NoError(t, json.Unmarshal(edited.Body.Bytes(), &edit))
	assert.NotEqual(t, conv.Turns[0].Result.Pending.ID, edit.Turns[0].Result.Pending.ID)
	assert.Equal(t, 409, review(path, conv, "approve", "").Code)
	require.Equal(t, 201, review(path, edit, "approve", "").Code)
	finished := wait(path)
	require.Equal(t, "completed", finished.Turns[0].Status)
	assert.True(t, finished.Turns[0].Result.Operations[1].Verified)
	assert.Equal(t, 200, finished.Turns[0].Result.Steps[0].HTTPStatus)
	assert.Equal(t, "fixture-provider-request", finished.Turns[0].Result.Steps[0].RequestID)
	assert.Contains(t, readTask(one), `"title":"edited"`)
	assert.Contains(t, readTask(one), "preserve this description")
	assert.Contains(t, readTask(one), `"priority":3`)
	assert.Equal(t, 409, review(path, edit, "approve", "").Code)
	// Changes made during review regenerate the preview, invalidating the old approval.
	path, conv = start("update_task", map[string]any{"id": one, "title": "after conflict"}, "review", nil, 0)
	changed := humaRequest(t, e, "PATCH", fmt.Sprintf("/api/v2/tasks/%d", one), `{"title":"external edit"}`, token, "")
	require.Equal(t, 200, changed.Code, changed.Body.String())
	require.Equal(t, 201, review(path, conv, "approve", "").Code)
	fresh := wait(path)
	require.Equal(t, "awaiting_approval", fresh.Turns[0].Status)
	assert.NotEqual(t, conv.Turns[0].Result.Pending.ID, fresh.Turns[0].Result.Pending.ID)
	assert.Contains(t, fresh.Turns[0].Result.Pending.Before, "external edit")
	assert.Contains(t, readTask(one), "external edit")
	require.Equal(t, 201, review(path, fresh, "reject", "").Code)
	finished = wait(path)
	assert.Equal(t, "rejected", finished.Turns[0].Result.Operations[1].Status)
	assert.Contains(t, readTask(one), "external edit")
	// A selected project is an enforced write boundary, not just a prompt suggestion.
	_, denied := start("update_task", map[string]any{"id": one, "title": "must not write"}, "auto", []int64{project.ID + 9999}, 0)
	assert.Contains(t, denied.Turns[0].Result.Actions[1].Result, "SCOPE_DENIED")
	assert.Contains(t, readTask(one), "external edit")
	// Bulk writes are one transaction. A later invalid date rolls back earlier valid changes.
	_, bulk := start("bulk_update_tasks", map[string]any{"updates": []any{map[string]any{"id": one, "changes": map[string]any{"title": "must roll back"}}, map[string]any{"id": two, "changes": map[string]any{"start_date": "2026-11-01T12:00:00+08:00", "end_date": "2026-11-01T10:00:00+08:00"}}}}, "auto", nil, 0)
	require.Len(t, bulk.Turns[0].Result.Actions, 2)
	assert.False(t, bulk.Turns[0].Result.Actions[1].Success)
	assert.Contains(t, readTask(one), "external edit")
	assert.Contains(t, readTask(two), `"title":"two"`)
	// Budget continuation resumes pending tools and does not repeat discovery or already completed operations.
	path, conv = start("bulk_update_tasks", map[string]any{"updates": []any{map[string]any{"id": one, "changes": map[string]any{"title": "bulk one"}}, map[string]any{"id": two, "changes": map[string]any{"title": "bulk two"}}}}, "auto", nil, 1)
	require.Equal(t, "paused", conv.Turns[0].Status)
	require.Equal(t, 201, review(path, conv, "continue", "").Code)
	conv = wait(path)
	require.Equal(t, "paused", conv.Turns[0].Status)
	require.Equal(t, 201, review(path, conv, "continue", "").Code)
	conv = wait(path)
	if conv.Turns[0].Status == "paused" {
		require.Equal(t, 201, review(path, conv, "continue", "").Code)
		conv = wait(path)
	}
	require.Equal(t, "completed", conv.Turns[0].Status)
	assert.Len(t, conv.Turns[0].Result.Actions, 2)
	assert.Contains(t, readTask(one), "bulk one")
	assert.Contains(t, readTask(two), "bulk two")
	path, conv = start("ask_user", map[string]any{"question": "Which day?", "choices": []string{"Monday", "Tuesday"}}, "smart", nil, 0)
	require.Equal(t, "awaiting_input", conv.Turns[0].Status)
	body, encodeErr := json.Marshal(tcyai.ReviewInput{TurnID: conv.Turns[0].ID, Decision: "answer", Answer: "Tuesday"})
	require.NoError(t, encodeErr)
	rec = humaRequest(t, e, "POST", path+"/review", string(body), token, "")
	require.Equal(t, 201, rec.Code, rec.Body.String())
	assert.Equal(t, "completed", wait(path).Turns[0].Status)
	// Exercise the extended catalog against actual business routes, not only schemas.
	_, conv = start("create_label", map[string]any{"title": "Agent fixture label", "hex_color": "aabbcc"}, "smart", nil, 0)
	require.Equal(t, "completed", conv.Turns[0].Status)
	var label struct {
		ID int64 `json:"id"`
	}
	require.Len(t, conv.Turns[0].Result.Actions, 2)
	require.True(t, conv.Turns[0].Result.Actions[1].Success, conv.Turns[0].Result.Actions[1].Result)
	require.NoError(t, json.Unmarshal([]byte(conv.Turns[0].Result.Actions[1].Result), &label))
	require.Positive(t, label.ID)
	_, conv = start("add_task_label", map[string]any{"id": one, "label_id": label.ID}, "smart", nil, 0)
	require.True(t, conv.Turns[0].Result.Actions[1].Success, conv.Turns[0].Result.Actions[1].Result)
	assert.Contains(t, readTask(one), "Agent fixture label")
	_, conv = start("remove_task_label", map[string]any{"id": one, "label_id": label.ID}, "smart", nil, 0)
	require.True(t, conv.Turns[0].Result.Actions[1].Success, conv.Turns[0].Result.Actions[1].Result)
	assert.NotContains(t, readTask(one), "Agent fixture label")
	path, conv = start("add_comment", map[string]any{"id": one, "comment": "Agent fixture comment"}, "auto", nil, 0)
	require.Equal(t, "awaiting_approval", conv.Turns[0].Status)
	before := humaRequest(t, e, "GET", fmt.Sprintf("/api/v2/tasks/%d/comments", one), "", token, "")
	assert.NotContains(t, before.Body.String(), "Agent fixture comment")
	require.Equal(t, 201, review(path, conv, "approve", "").Code)
	conv = wait(path)
	require.True(t, conv.Turns[0].Result.Actions[1].Success, conv.Turns[0].Result.Actions[1].Result)
	_, conv = start("list_comments", map[string]any{"id": one}, "smart", nil, 0)
	require.True(t, conv.Turns[0].Result.Actions[1].Success, conv.Turns[0].Result.Actions[1].Result)
	assert.Contains(t, conv.Turns[0].Result.Actions[1].Result, "Agent fixture comment")
	for _, name := range []string{"assign_task", "unassign_task"} {
		path, conv = start(name, map[string]any{"id": one, "user_id": testuser1.ID}, "auto", nil, 0)
		require.Equal(t, "awaiting_approval", conv.Turns[0].Status)
		require.Equal(t, 201, review(path, conv, "approve", "").Code)
		conv = wait(path)
		require.True(t, conv.Turns[0].Result.Actions[1].Success, conv.Turns[0].Result.Actions[1].Result)
		var actual struct {
			Assignees []json.RawMessage `json:"assignees"`
		}
		require.NoError(t, json.Unmarshal([]byte(readTask(one)), &actual))
		if name == "assign_task" {
			assert.Len(t, actual.Assignees, 1)
		} else {
			assert.Empty(t, actual.Assignees)
		}
	}
	for _, name := range []string{"relate_tasks", "unrelate_tasks"} {
		_, conv = start(name, map[string]any{"id": one, "other_task_id": two, "relation_kind": "related"}, "smart", nil, 0)
		require.True(t, conv.Turns[0].Result.Actions[1].Success, conv.Turns[0].Result.Actions[1].Result)
		var actual struct {
			Related map[string][]json.RawMessage `json:"related_tasks"`
		}
		require.NoError(t, json.Unmarshal([]byte(readTask(one)), &actual))
		if name == "relate_tasks" {
			assert.Len(t, actual.Related["related"], 1)
		} else {
			assert.Empty(t, actual.Related["related"])
		}
	}
	_, conv = start("update_task", map[string]any{"id": one, "reminders": []any{map[string]any{"reminder": "2026-11-01T09:00:00+08:00"}}}, "auto", nil, 0)
	require.True(t, conv.Turns[0].Result.Actions[0].Success, conv.Turns[0].Result.Actions[0].Result)
	var actual struct {
		Reminders []struct {
			Reminder time.Time `json:"reminder"`
		} `json:"reminders"`
	}
	require.NoError(t, json.Unmarshal([]byte(readTask(one)), &actual))
	require.Len(t, actual.Reminders, 1)
	expected, err := time.Parse(time.RFC3339, "2026-11-01T09:00:00+08:00")
	require.NoError(t, err)
	assert.True(t, actual.Reminders[0].Reminder.Equal(expected))
	doomed := createTask("delete after review")
	path, conv = start("delete_task", map[string]any{"id": doomed}, "auto", nil, 0)
	require.Equal(t, "awaiting_approval", conv.Turns[0].Status)
	assert.Contains(t, readTask(doomed), "delete after review")
	require.Equal(t, 201, review(path, conv, "approve", "").Code)
	conv = wait(path)
	require.True(t, conv.Turns[0].Result.Actions[0].Success, conv.Turns[0].Result.Actions[0].Result)
	assert.Equal(t, 404, humaRequest(t, e, "GET", fmt.Sprintf("/api/v2/tasks/%d", doomed), "", token, "").Code)

}
