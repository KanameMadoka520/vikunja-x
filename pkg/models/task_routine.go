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

package models

import (
	"net/http"
	"time"

	"code.vikunja.io/api/pkg/config"
	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/events"
	"code.vikunja.io/api/pkg/user"
	"code.vikunja.io/api/pkg/web"
	"xorm.io/xorm"
	"xorm.io/xorm/schemas"
)

// TaskRoutine stores daily configuration separately from ordinary repeat_after semantics.
type TaskRoutine struct {
	TaskID          int64     `xorm:"bigint not null pk" json:"task_id" readOnly:"true"`
	Enabled         bool      `xorm:"not null default false" json:"enabled"`
	Paused          bool      `xorm:"not null default false" json:"paused"`
	Timezone        string    `xorm:"varchar(100) not null" json:"timezone" maxLength:"100" doc:"IANA timezone defining the shared task's calendar day. Historical dates are not rewritten when this changes."`
	Revision        int64     `xorm:"bigint not null default 0" json:"revision" minimum:"0" doc:"Expected configuration revision; stale updates fail with 409."`
	Created         time.Time `xorm:"created not null" json:"created" readOnly:"true"`
	Updated         time.Time `xorm:"updated not null" json:"updated" readOnly:"true"`
	Date            string    `xorm:"-" json:"date" readOnly:"true" doc:"Current local YYYY-MM-DD in the routine timezone."`
	CompletedToday  bool      `xorm:"-" json:"completed_today" readOnly:"true"`
	CompletedAt     time.Time `xorm:"-" json:"completed_at" readOnly:"true"`
	CompletedByID   int64     `xorm:"-" json:"completed_by_id" readOnly:"true"`
	NextResetAt     time.Time `xorm:"-" json:"next_reset_at" readOnly:"true" doc:"Next local midnight, including DST transitions."`
	web.CRUDable    `xorm:"-" json:"-"`
	web.Permissions `xorm:"-" json:"-"`
}

func (*TaskRoutine) TableName() string { return "task_routines" }
func (r *TaskRoutine) CanRead(s *xorm.Session, a web.Auth) (bool, int, error) {
	return (&Task{ID: r.TaskID}).CanRead(s, a)
}
func (r *TaskRoutine) CanUpdate(s *xorm.Session, a web.Auth) (bool, error) {
	task, err := GetTaskByIDSimple(s, r.TaskID)
	if err != nil {
		return false, err
	}
	p, err := GetProjectSimpleByID(s, task.ProjectID)
	if err != nil {
		return false, err
	}
	if err = p.CheckIsArchived(s); err != nil {
		return false, err
	}
	return task.CanUpdate(s, a)
}
func routineTimezone(s *xorm.Session, a web.Auth) string {
	if a.GetID() > 0 {
		u := &user.User{}
		exists, err := s.ID(a.GetID()).Get(u)
		if err == nil && exists && u.Timezone != "" {
			return u.Timezone
		}
	}
	return config.GetTimeZone().String()
}
func (r *TaskRoutine) ReadOne(s *xorm.Session, a web.Auth) error {
	row := TaskRoutine{TaskID: r.TaskID}
	exists, err := s.ID(r.TaskID).Get(&row)
	if err != nil {
		return err
	}
	if !exists {
		row.Timezone = routineTimezone(s, a)
	}
	if err = row.setDate(time.Now()); err != nil {
		return err
	}
	check := &TaskRoutineCheckin{}
	exists, err = s.Where("task_id = ? AND local_date = ?", row.TaskID, row.Date).Get(check)
	if err != nil {
		return err
	}
	if exists {
		row.CompletedToday = true
		row.CompletedAt = check.CompletedAt
		row.CompletedByID = check.CompletedByID
	}
	*r = row
	return nil
}
func (r *TaskRoutine) setDate(now time.Time) error {
	loc, err := time.LoadLocation(r.Timezone)
	if err != nil {
		return InvalidFieldErrorWithMessage([]string{"timezone"}, "Use a valid IANA timezone")
	}
	local := now.In(loc)
	r.Date = local.Format(time.DateOnly)
	r.NextResetAt = time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, 1)
	return nil
}
func lockRoutineTask(s *xorm.Session, id int64) (*Task, error) {
	locking := s
	if kind := db.Type(); kind == schemas.MYSQL || kind == schemas.POSTGRES {
		locking = s.ForUpdate()
	}
	task := &Task{}
	exists, err := locking.ID(id).Get(task)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrTaskDoesNotExist{ID: id}
	}
	return task, nil
}
func (r *TaskRoutine) Update(s *xorm.Session, a web.Auth) error {
	if r.Revision < 0 || len(r.Timezone) > 100 {
		return InvalidFieldErrorWithMessage([]string{"revision", "timezone"}, "Invalid routine configuration")
	}
	if r.Timezone == "" {
		r.Timezone = routineTimezone(s, a)
	}
	if err := r.setDate(time.Now()); err != nil {
		return err
	}
	task, err := lockRoutineTask(s, r.TaskID)
	if err != nil {
		return err
	}
	allowed, err := r.CanUpdate(s, a)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrGenericForbidden{}
	}
	if r.Enabled && (task.Done || task.RepeatAfter != 0 || task.RepeatMode != TaskRepeatModeDefault) {
		return ErrRoutineState{Message: "Reopen the task and remove ordinary repeat settings before enabling daily check-ins."}
	}
	old := &TaskRoutine{TaskID: r.TaskID}
	exists, err := routineCurrentRead(s).ID(r.TaskID).Get(old)
	if err != nil {
		return err
	}
	if old.Revision != r.Revision {
		return ErrRoutineConflict{}
	}
	r.Revision++
	r.Updated = time.Now()
	if !exists {
		r.Created = time.Now()
		_, err = s.Insert(r)
	} else {
		var changed int64
		changed, err = s.ID(r.TaskID).Where("revision = ?", old.Revision).Cols("enabled", "paused", "timezone", "revision", "updated").Update(r)
		if err == nil && changed == 0 {
			return ErrRoutineConflict{}
		}
	}
	if err != nil {
		return err
	}
	if _, err = touchRoutineTask(s, a, task); err != nil {
		return err
	}
	return r.ReadOne(s, a)
}

// LocalDate is a calendar key (UTC midnight encoding), not the completion instant.
type TaskRoutineCheckin struct {
	ID            int64     `xorm:"bigint autoincr not null pk" json:"id" readOnly:"true"`
	TaskID        int64     `xorm:"bigint not null unique(routine_day)" json:"task_id" readOnly:"true"`
	LocalDate     time.Time `xorm:"DATE not null unique(routine_day)" json:"-"`
	Timezone      string    `xorm:"varchar(100) not null" json:"timezone" readOnly:"true"`
	CompletedAt   time.Time `xorm:"not null" json:"completed_at" readOnly:"true"`
	CompletedByID int64     `xorm:"bigint not null" json:"completed_by_id" readOnly:"true"`
	Date          string    `xorm:"-" json:"date" readOnly:"true"`
}

func (*TaskRoutineCheckin) TableName() string { return "task_routine_checkins" }

// SetTaskRoutineCheckin is idempotent per task/local date and never changes task.done or task dates.
func SetTaskRoutineCheckin(s *xorm.Session, a web.Auth, id int64, date string, completed bool) (*Task, error) {
	return setTaskRoutineCheckinAt(s, a, id, date, completed, time.Now())
}
func setTaskRoutineCheckinAt(s *xorm.Session, a web.Auth, id int64, date string, completed bool, now time.Time) (*Task, error) {
	task, err := lockRoutineTask(s, id)
	if err != nil {
		return nil, err
	}
	r := &TaskRoutine{TaskID: id}
	allowed, err := r.CanUpdate(s, a)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrGenericForbidden{}
	}
	exists, err := routineCurrentRead(s).ID(id).Get(r)
	if err != nil {
		return nil, err
	}
	if !exists || !r.Enabled || r.Paused {
		return nil, ErrRoutineState{Message: "This daily routine is disabled or paused."}
	}
	if err = r.setDate(now); err != nil {
		return nil, err
	}
	if date != r.Date {
		return nil, ErrRoutineConflict{Message: "The routine's calendar day changed. Reload before checking in."}
	}
	// A row lock plus an explicit existence check makes no-op retries event-free on every DB,
	// including MySQL connections configured to report found rather than changed rows.
	already, err := routineCurrentRead(s).Where("task_id = ? AND local_date = ?", id, date).Get(&TaskRoutineCheckin{})
	if err != nil {
		return nil, err
	}
	if already == completed {
		err = task.ReadOne(s, a)
		return task, err
	}
	var changed int64
	if completed {
		conflict := "ON CONFLICT (task_id, local_date) DO NOTHING"
		if db.Type() == schemas.MYSQL {
			conflict = "ON DUPLICATE KEY UPDATE task_id = task_id"
		}
		table := s.Engine().TableName(&TaskRoutineCheckin{}, true)
		result, e := s.Exec("INSERT INTO "+table+" (task_id, local_date, timezone, completed_at, completed_by_id) VALUES (?, ?, ?, ?, ?) "+conflict, id, date, r.Timezone, now.UTC(), a.GetID())
		if e != nil {
			return nil, e
		}
		changed, err = result.RowsAffected()
	} else {
		changed, err = s.Where("task_id = ? AND local_date = ?", id, date).Delete(&TaskRoutineCheckin{})
	}
	if err != nil {
		return nil, err
	}
	if changed > 0 {
		return touchRoutineTask(s, a, task)
	}
	err = task.ReadOne(s, a)
	return task, err
}
func touchRoutineTask(s *xorm.Session, a web.Auth, task *Task) (*Task, error) {
	task.Updated = time.Now()
	if err := updateTaskLastUpdated(s, task); err != nil {
		return nil, err
	}
	if err := updateProjectLastUpdated(s, &Project{ID: task.ProjectID}); err != nil {
		return nil, err
	}
	if err := task.ReadOne(s, a); err != nil {
		return nil, err
	}
	events.DispatchOnCommit(s, &TaskUpdatedEvent{Task: task, Doer: doerFromAuth(s, a)})
	return task, nil
}

// addRoutineInfoToTasks performs two batched reads regardless of the number of tasks.
func addRoutineInfoToTasks(s *xorm.Session, taskMap map[int64]*Task, now time.Time) error {
	if len(taskMap) == 0 {
		return nil
	}
	ids := make([]int64, 0, len(taskMap))
	for id := range taskMap {
		ids = append(ids, id)
		taskMap[id].Routine = nil
	}
	rows := []*TaskRoutine{}
	if err := s.In("task_id", ids).Find(&rows); err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}
	minDate, maxDate := "9999-12-31", "0000-01-01"
	for _, r := range rows {
		if err := r.setDate(now); err != nil {
			return err
		}
		if r.Date < minDate {
			minDate = r.Date
		}
		if r.Date > maxDate {
			maxDate = r.Date
		}
		taskMap[r.TaskID].Routine = r
	}
	checks := []*TaskRoutineCheckin{}
	if err := s.In("task_id", ids).Where("local_date >= ? AND local_date <= ?", minDate, maxDate).Find(&checks); err != nil {
		return err
	}
	for _, c := range checks {
		r := taskMap[c.TaskID].Routine
		if r != nil && c.LocalDate.Format(time.DateOnly) == r.Date {
			r.CompletedToday = true
			r.CompletedAt = c.CompletedAt
			r.CompletedByID = c.CompletedByID
		}
	}
	return nil
}

// Called after the task row write: locking/current reads also see concurrent configuration commits on MySQL.
func validateTaskRoutineState(s *xorm.Session, t *Task) error {
	if !t.Done && t.RepeatAfter == 0 && t.RepeatMode == TaskRepeatModeDefault {
		return nil
	}
	locking := s
	if kind := db.Type(); kind == schemas.MYSQL || kind == schemas.POSTGRES {
		locking = s.ForUpdate()
	}
	r := &TaskRoutine{}
	exists, err := locking.ID(t.ID).Get(r)
	if err != nil {
		return err
	}
	if exists && r.Enabled {
		return ErrRoutineState{Message: "Use daily check-in for this task, or disable its daily routine before setting done or ordinary repeats."}
	}
	return nil
}

type TaskRoutineHistory struct {
	Timezone      string                `json:"timezone"`
	Year          int                   `json:"year"`
	Month         int                   `json:"month"`
	Items         []*TaskRoutineCheckin `json:"items"`
	TotalCheckins int                   `json:"total_checkins"`
	CurrentStreak int                   `json:"current_streak"`
	LongestStreak int                   `json:"longest_streak"`
}

func GetTaskRoutineHistory(s *xorm.Session, a web.Auth, id int64, year, month int) (*TaskRoutineHistory, error) {
	if year < 1970 || year > 9998 || month < 1 || month > 12 {
		return nil, InvalidFieldErrorWithMessage([]string{"year", "month"}, "Choose a valid calendar month")
	}
	r := &TaskRoutine{TaskID: id}
	can, _, err := r.CanRead(s, a)
	if err != nil {
		return nil, err
	}
	if !can {
		return nil, ErrGenericForbidden{}
	}
	if err = r.ReadOne(s, a); err != nil {
		return nil, err
	}
	result := &TaskRoutineHistory{Timezone: r.Timezone, Year: year, Month: month, Items: []*TaskRoutineCheckin{}}
	records := []*TaskRoutineCheckin{}
	if err = s.Where("task_id = ?", id).OrderBy("local_date ASC").Find(&records); err != nil {
		return nil, err
	}
	result.TotalCheckins = len(records)
	streak := 0
	var previous time.Time
	for _, c := range records {
		c.Date = c.LocalDate.Format(time.DateOnly)
		if previous.IsZero() || !c.LocalDate.Equal(previous.AddDate(0, 0, 1)) {
			streak = 1
		} else {
			streak++
		}
		previous = c.LocalDate
		if streak > result.LongestStreak {
			result.LongestStreak = streak
		}
		if c.LocalDate.Year() == year && int(c.LocalDate.Month()) == month {
			result.Items = append(result.Items, c)
		}
	}
	today, _ := time.Parse(time.DateOnly, r.Date)
	if !previous.IsZero() && (previous.Equal(today) || previous.Equal(today.AddDate(0, 0, -1))) {
		result.CurrentStreak = streak
	}
	return result, nil
}

type ErrRoutineConflict struct{ Message string }

func (e ErrRoutineConflict) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return "Routine settings changed. Reload before saving."
}
func (e ErrRoutineConflict) HTTPError() web.HTTPError {
	return web.HTTPError{HTTPCode: http.StatusConflict, Code: 20002, Message: e.Error()}
}

type ErrRoutineState struct{ Message string }

func (e ErrRoutineState) Error() string { return e.Message }
func (e ErrRoutineState) HTTPError() web.HTTPError {
	return web.HTTPError{HTTPCode: http.StatusBadRequest, Code: 20003, Message: e.Error()}
}

// A duplicate gets the schedule but starts its own history.
func duplicateTaskRoutine(s *xorm.Session, oldID, newID int64) error {
	r := &TaskRoutine{}
	exists, err := s.ID(oldID).Get(r)
	if err != nil || !exists {
		return err
	}
	r.TaskID = newID
	r.Revision = 1
	r.Created = time.Now()
	r.Updated = r.Created
	_, err = s.Insert(r)
	return err
}

// Current reads after the parent lock avoid an older MySQL repeatable-read snapshot.
func routineCurrentRead(s *xorm.Session) *xorm.Session {
	if kind := db.Type(); kind == schemas.MYSQL || kind == schemas.POSTGRES {
		return s.ForUpdate()
	}
	return s
}
