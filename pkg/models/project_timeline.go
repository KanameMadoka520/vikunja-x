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
	"sort"
	"time"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/web"
	"xorm.io/builder"
	"xorm.io/xorm"
)

type ProjectTimelineSpan struct {
	Start string `json:"start" doc:"First local calendar date, inclusive; clipped to the selected year."`
	End   string `json:"end" doc:"Last local calendar date, inclusive; gaps between separate spans are not filled."`
}

type ProjectTimelineDay struct {
	ScheduledProjects int `json:"scheduled_projects" doc:"Distinct accessible projects with explicitly scheduled tasks covering this day."`
	ElapsedProjects   int `json:"elapsed_projects" doc:"Distinct projects with elapsed scheduled coverage; not evidence of hours worked."`
	Deadlines         int `json:"deadlines" doc:"Task due dates on this day among eligible tasks; not inferred from end_date."`
}

type ProjectTimelineItem struct {
	ID             int64                 `json:"id" doc:"Project ID. Only this project's direct tasks are aggregated."`
	Title          string                `json:"title"`
	HexColor       string                `json:"hex_color"`
	IsCompleted    bool                  `json:"is_completed"`
	IsArchived     bool                  `json:"is_archived"`
	StartDate      string                `json:"start_date" doc:"Earliest explicit task start among eligible tasks overlapping the year; may be outside the year."`
	EndDate        string                `json:"end_date" doc:"Latest explicit task end (or due date when no end is set); may be outside the year."`
	ScheduledDays  int                   `json:"scheduled_days" doc:"Unique covered calendar days in the selected year, not the gap-filled bounding span."`
	ElapsedDays    int                   `json:"elapsed_days" doc:"Covered days through today, capped at known task completion dates."`
	TaskCount      int                   `json:"task_count" doc:"Eligible tasks overlapping the selected year."`
	DoneTasks      int                   `json:"done_tasks"`
	OverdueTasks   int                   `json:"overdue_tasks" doc:"Eligible unfinished tasks with an explicit due_date before now."`
	Progress       float64               `json:"progress" doc:"Current mean task progress, 0..1; done tasks count as 1. Not a historical snapshot or elapsed-time percentage."`
	NextDeadline   string                `json:"next_deadline" doc:"Nearest upcoming explicit due date of an eligible unfinished task; empty if none."`
	OverdueSince   string                `json:"overdue_since" doc:"Earliest overdue explicit due date of eligible unfinished tasks; empty if none."`
	LastDeadline   string                `json:"last_deadline" doc:"Latest explicit due date of eligible tasks; never substituted with end_date."`
	ScheduledSpans []ProjectTimelineSpan `json:"scheduled_spans"`
	ElapsedSpans   []ProjectTimelineSpan `json:"elapsed_spans"`
}

type ProjectTimeline struct {
	Year          int                            `json:"year"`
	Timezone      string                         `json:"timezone"`
	Today         string                         `json:"today" doc:"Today's date in the requested timezone."`
	FirstYear     int                            `json:"first_year" doc:"Earliest eligible schedule year in the accessible filtered scope; 0 when none."`
	LastYear      int                            `json:"last_year" doc:"Latest eligible schedule year in the accessible filtered scope; 0 when none."`
	Days          map[string]*ProjectTimelineDay `json:"days" doc:"Year-wide coverage, independent of day selection and pagination."`
	Projects      int                            `json:"projects" doc:"Projects with eligible tasks overlapping the year, before day selection."`
	ScheduledDays int                            `json:"scheduled_days" doc:"Union of covered days across projects, not their sum."`
	ElapsedDays   int                            `json:"elapsed_days"`
	DatedTasks    int                            `json:"dated_tasks"`
	DoneTasks     int                            `json:"done_tasks"`
	OverdueTasks  int                            `json:"overdue_tasks"`
	ExcludedTasks int                            `json:"excluded_tasks" doc:"Scope-wide tasks missing start or end/due. They cannot be assigned to a year and never enter the chart."`
	InvalidTasks  int                            `json:"invalid_tasks" doc:"Scope-wide reversed or unsupported date ranges; excluded from coverage."`
	Items         []*ProjectTimelineItem         `json:"items"`
	Total         int                            `json:"total" doc:"Projects matching the year and optional day selection."`
	Page          int                            `json:"page"`
	TotalPages    int                            `json:"total_pages"`
}

type ProjectTimelineOptions struct {
	Year      int
	Timezone  string
	ProjectID int64
	Status    string
	Search    string
	Day       string
	Page      int
}

type timelineTask struct {
	ProjectID   int64
	Title       string
	HexColor    string
	IsCompleted bool
	IsArchived  bool
	StartDate   time.Time
	EndDate     time.Time
	DueDate     time.Time
	DoneAt      time.Time
	Done        bool
	PercentDone float64
}

type timelineProject struct {
	item      *ProjectTimelineItem
	scheduled map[string]bool
	elapsed   map[string]bool
}

// GetProjectTimeline is a read-only projection of explicit task schedules. ACLs
// apply before even exclusion counters or year extrema; archived projects remain
// eligible. It never derives work dates from entity creation/update or milestones.
func GetProjectTimeline(s *xorm.Session, a web.Auth, opts ProjectTimelineOptions) (*ProjectTimeline, error) {
	return getProjectTimelineAt(s, a, opts, time.Now())
}

func getProjectTimelineAt(s *xorm.Session, a web.Auth, opts ProjectTimelineOptions, now time.Time) (*ProjectTimeline, error) {
	loc, cond, err := projectTimelineScope(s, a, opts)
	if err != nil {
		return nil, err
	}
	result := &ProjectTimeline{Year: opts.Year, Timezone: opts.Timezone, Today: now.In(loc).Format(time.DateOnly), Days: map[string]*ProjectTimelineDay{}, Items: []*ProjectTimelineItem{}, Page: opts.Page}
	projects := map[int64]*timelineProject{}
	yearStart := time.Date(opts.Year, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := yearStart.AddDate(1, 0, 0)
	// One streaming query: do not retain arbitrary descriptions or all task rows.
	err = s.Table("tasks").Join("INNER", "projects", "projects.id = tasks.project_id").
		Select("tasks.project_id, tasks.start_date, tasks.end_date, tasks.due_date, tasks.done_at, tasks.done, tasks.percent_done, projects.title, projects.hex_color, projects.is_completed, projects.is_archived").
		Where(cond).Iterate(new(timelineTask), func(_ int, bean interface{}) error {
		task := bean.(*timelineTask)
		start, end, eligible := timelineDates(task, result, opts.Year, loc)
		if !eligible {
			return nil
		}
		p := projectForTimelineTask(projects, task, start, end)
		addTimelineStats(p, task, result, now, loc)
		addTimelineCoverage(p, task, start, end, now, loc, yearStart, yearEnd)
		return nil
	})
	if err != nil {
		return nil, err
	}
	rows := []*ProjectTimelineItem{}
	for _, p := range projects {
		p.item.Progress /= float64(p.item.TaskCount)
		p.item.ScheduledDays = len(p.scheduled)
		p.item.ElapsedDays = len(p.elapsed)
		p.item.ScheduledSpans = timelineSpans(p.scheduled)
		p.item.ElapsedSpans = timelineSpans(p.elapsed)
		for key := range p.scheduled {
			if result.Days[key] == nil {
				result.Days[key] = &ProjectTimelineDay{}
			}
			result.Days[key].ScheduledProjects++
		}
		for key := range p.elapsed {
			result.Days[key].ElapsedProjects++
		}
		if opts.Day == "" || p.scheduled[opts.Day] {
			rows = append(rows, p.item)
		}
	}
	result.Projects = len(projects)
	for _, day := range result.Days {
		if day.ScheduledProjects > 0 {
			result.ScheduledDays++
		}
		if day.ElapsedProjects > 0 {
			result.ElapsedDays++
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].StartDate == rows[j].StartDate {
			return rows[i].ID < rows[j].ID
		}
		return rows[i].StartDate < rows[j].StartDate
	})
	result.Total = len(rows)
	const pageSize = 24
	result.TotalPages = (result.Total + pageSize - 1) / pageSize
	start := min((opts.Page-1)*pageSize, len(rows))
	result.Items = rows[start:min(start+pageSize, len(rows))]
	return result, nil
}

func projectTimelineScope(s *xorm.Session, a web.Auth, opts ProjectTimelineOptions) (*time.Location, builder.Cond, error) {
	if opts.Year < 1970 || opts.Year > 9998 || opts.Page < 1 || opts.Page > 10000000 || opts.ProjectID < 0 {
		return nil, nil, InvalidFieldErrorWithMessage([]string{"year", "page", "project"}, "Invalid project timeline range")
	}
	loc, err := time.LoadLocation(opts.Timezone)
	if err != nil {
		return nil, nil, InvalidFieldErrorWithMessage([]string{"timezone"}, "Use a valid IANA timezone")
	}
	if opts.Day != "" {
		day, parseErr := time.ParseInLocation(time.DateOnly, opts.Day, loc)
		if parseErr != nil || day.Year() != opts.Year {
			return nil, nil, InvalidFieldErrorWithMessage([]string{"day"}, "Select a date in the selected year")
		}
	}
	access, err := accessibleProjectIDsCond(s, a, "projects.id")
	if err != nil {
		return nil, nil, err
	}
	// The projection bean does not carry Task.DeletedAt's XORM soft-delete tag.
	cond := builder.And(access, taskNotDeletedCond("tasks"))
	switch opts.Status {
	case "", "all":
	case "active":
		cond = cond.And(builder.Eq{"projects.is_completed": false, "projects.is_archived": false})
	case "completed":
		cond = cond.And(builder.Eq{"projects.is_completed": true})
	case "archived":
		cond = cond.And(builder.Eq{"projects.is_archived": true})
	default:
		return nil, nil, InvalidFieldErrorWithMessage([]string{"status"}, "Invalid project status")
	}
	if opts.ProjectID > 0 {
		cond = cond.And(builder.Eq{"projects.id": opts.ProjectID})
	}
	if opts.Search != "" {
		cond = cond.And(db.ILIKE("projects.title", opts.Search))
	}
	return loc, cond, nil
}

func timelineDates(task *timelineTask, result *ProjectTimeline, year int, loc *time.Location) (time.Time, time.Time, bool) {
	end := task.EndDate
	if end.IsZero() {
		end = task.DueDate
	}
	if task.StartDate.IsZero() || end.IsZero() {
		result.ExcludedTasks++
		return time.Time{}, time.Time{}, false
	}
	start := task.StartDate.In(loc)
	end = end.In(loc)
	if end.Before(start) || start.Year() < 1970 || end.Year() > 9998 {
		result.InvalidTasks++
		return time.Time{}, time.Time{}, false
	}
	if result.FirstYear == 0 || start.Year() < result.FirstYear {
		result.FirstYear = start.Year()
	}
	if end.Year() > result.LastYear {
		result.LastYear = end.Year()
	}
	if start.Year() > year || end.Year() < year {
		return time.Time{}, time.Time{}, false
	}
	return start, end, true
}

func projectForTimelineTask(projects map[int64]*timelineProject, task *timelineTask, start, end time.Time) *timelineProject {
	p := projects[task.ProjectID]
	if p == nil {
		p = &timelineProject{item: &ProjectTimelineItem{ID: task.ProjectID, Title: task.Title, HexColor: task.HexColor, IsCompleted: task.IsCompleted, IsArchived: task.IsArchived, ScheduledSpans: []ProjectTimelineSpan{}, ElapsedSpans: []ProjectTimelineSpan{}}, scheduled: map[string]bool{}, elapsed: map[string]bool{}}
		projects[task.ProjectID] = p
	}
	startDate, endDate := start.Format(time.DateOnly), end.Format(time.DateOnly)
	if p.item.StartDate == "" || startDate < p.item.StartDate {
		p.item.StartDate = startDate
	}
	if endDate > p.item.EndDate {
		p.item.EndDate = endDate
	}
	return p
}

func addTimelineStats(p *timelineProject, task *timelineTask, result *ProjectTimeline, now time.Time, loc *time.Location) {
	p.item.TaskCount++
	result.DatedTasks++
	progress := max(0, min(1, task.PercentDone))
	if task.Done {
		progress = 1
		p.item.DoneTasks++
		result.DoneTasks++
	}
	p.item.Progress += progress
	if !task.Done && !task.DueDate.IsZero() && task.DueDate.Before(now) {
		p.item.OverdueTasks++
		result.OverdueTasks++
	}
	if !task.DueDate.IsZero() {
		deadline := task.DueDate.In(loc).Format(time.DateOnly)
		if deadline > p.item.LastDeadline {
			p.item.LastDeadline = deadline
		}
		if !task.Done {
			if task.DueDate.Before(now) {
				if p.item.OverdueSince == "" || deadline < p.item.OverdueSince {
					p.item.OverdueSince = deadline
				}
			} else if p.item.NextDeadline == "" || deadline < p.item.NextDeadline {
				p.item.NextDeadline = deadline
			}
		}
	}
	if !task.DueDate.IsZero() && task.DueDate.In(loc).Year() == result.Year {
		key := task.DueDate.In(loc).Format(time.DateOnly)
		if result.Days[key] == nil {
			result.Days[key] = &ProjectTimelineDay{}
		}
		result.Days[key].Deadlines++
	}
}

func addTimelineCoverage(p *timelineProject, task *timelineTask, start, end, now time.Time, loc *time.Location, yearStart, yearEnd time.Time) {
	endDate := end.Format(time.DateOnly)
	elapsedEnd := now.In(loc)
	if task.Done && !task.DoneAt.IsZero() && task.DoneAt.Before(elapsedEnd) {
		elapsedEnd = task.DoneAt.In(loc)
	}
	day := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	if day.Before(yearStart) {
		day = yearStart
	}
	elapsedDate := elapsedEnd.Format(time.DateOnly)
	for ; day.Before(yearEnd) && day.Format(time.DateOnly) <= endDate; day = day.AddDate(0, 0, 1) {
		key := day.Format(time.DateOnly)
		p.scheduled[key] = true
		if !task.StartDate.After(elapsedEnd) && key <= elapsedDate {
			p.elapsed[key] = true
		}
	}
}

func timelineSpans(days map[string]bool) []ProjectTimelineSpan {
	keys := make([]string, 0, len(days))
	for key := range days {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	spans := []ProjectTimelineSpan{}
	for _, key := range keys {
		if len(spans) > 0 {
			previous, _ := time.Parse(time.DateOnly, spans[len(spans)-1].End)
			if previous.AddDate(0, 0, 1).Format(time.DateOnly) == key {
				spans[len(spans)-1].End = key
				continue
			}
		}
		spans = append(spans, ProjectTimelineSpan{Start: key, End: key})
	}
	return spans
}
