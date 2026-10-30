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
	"testing"
	"time"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/user"
	"github.com/stretchr/testify/require"
)

func timelineDate(value string) time.Time {
	d, err := time.Parse(time.RFC3339, value)
	if err != nil {
		panic(err)
	}
	return d
}

func TestProjectTimelineCoverage(t *testing.T) {
	db.LoadAndAssertFixtures(t)
	s := db.NewSession()
	defer s.Close()
	_, err := s.Where("project_id = ?", 1).Delete(new(Task))
	require.NoError(t, err)
	now := timelineDate("2024-03-12T12:00:00Z")
	tasks := []Task{
		{Title: "Started in previous year", ProjectID: 1, StartDate: timelineDate("2023-12-30T12:00:00Z"), EndDate: timelineDate("2024-01-03T12:00:00Z"), PercentDone: .5},
		{Title: "Overlapping schedule", ProjectID: 1, StartDate: timelineDate("2024-01-02T12:00:00Z"), DueDate: timelineDate("2024-01-04T12:00:00Z"), Done: true, DoneAt: timelineDate("2024-01-02T13:00:00Z")},
		{Title: "Future", ProjectID: 1, StartDate: timelineDate("2024-04-01T12:00:00Z"), EndDate: timelineDate("2024-04-02T12:00:00Z")},
		{Title: "Missing start", ProjectID: 1, DueDate: timelineDate("2024-02-01T12:00:00Z")},
		{Title: "Missing end", ProjectID: 1, StartDate: timelineDate("2024-02-01T12:00:00Z")},
		{Title: "Reversed", ProjectID: 1, StartDate: timelineDate("2024-02-02T12:00:00Z"), EndDate: timelineDate("2024-02-01T12:00:00Z")},
		{Title: "End takes precedence", ProjectID: 1, StartDate: timelineDate("2024-03-09T12:00:00Z"), EndDate: timelineDate("2024-03-10T12:00:00Z"), DueDate: timelineDate("2024-03-11T12:00:00Z"), PercentDone: .1},
	}
	for i := range tasks {
		tasks[i].Index = int64(i + 10000)
	}
	_, err = s.Insert(&tasks)
	require.NoError(t, err)
	opts := ProjectTimelineOptions{Year: 2024, Timezone: "America/New_York", ProjectID: 1, Page: 1}
	h, err := getProjectTimelineAt(s, &user.User{ID: 1}, opts, now)
	require.NoError(t, err)
	require.Equal(t, 2, h.ExcludedTasks)
	require.Equal(t, 1, h.InvalidTasks)
	require.Equal(t, 4, h.DatedTasks)
	require.Equal(t, 1, h.DoneTasks)
	require.Equal(t, 1, h.OverdueTasks)
	require.Equal(t, 8, h.ScheduledDays) // Jan 1–4, Mar 9–10, Apr 1–2.
	require.Equal(t, 5, h.ElapsedDays)   // Jan 1–3, Mar 9–10; future and completed tails excluded.
	require.Equal(t, 1, h.Days["2024-01-02"].ScheduledProjects)
	require.Equal(t, 1, h.Days["2024-01-04"].Deadlines)
	require.Zero(t, h.Days["2024-03-11"].ScheduledProjects)
	require.Equal(t, 1, h.Days["2024-03-11"].Deadlines)
	require.Equal(t, 2023, h.FirstYear)
	require.Equal(t, 2024, h.LastYear)
	require.Len(t, h.Items, 1)
	require.InDelta(t, .4, h.Items[0].Progress, .00001)
	require.Equal(t, "2024-03-11", h.Items[0].OverdueSince)
	require.Empty(t, h.Items[0].NextDeadline)
	require.Len(t, h.Items[0].ScheduledSpans, 3)
	require.Equal(t, "2023-12-30", h.Items[0].StartDate)
	opts.Day = "2024-02-10"
	h, err = getProjectTimelineAt(s, &user.User{ID: 1}, opts, now)
	require.NoError(t, err)
	require.Empty(t, h.Items)
	require.Equal(t, 8, h.ScheduledDays) // Day selection does not rewrite annual statistics.
	opts.Day = "2024-02-30"
	_, err = GetProjectTimeline(s, &user.User{ID: 1}, opts)
	require.Error(t, err)
}

func TestProjectTimelineACLAndTimezone(t *testing.T) {
	db.LoadAndAssertFixtures(t)
	s := db.NewSession()
	defer s.Close()
	for _, id := range []int64{1, 2, 6, 9, 43} {
		_, err := s.Insert(&Task{Title: "Dated", ProjectID: id, StartDate: timelineDate("2023-12-31T16:00:00Z"), DueDate: timelineDate("2024-01-01T01:00:00Z")})
		require.NoError(t, err)
	}
	_, err := s.ID(1).Cols("is_archived").Update(&Project{IsArchived: true})
	require.NoError(t, err)
	deleted := &Task{Title: "Deleted schedules must not leak", ProjectID: 1, Index: 99999, StartDate: timelineDate("2099-01-01T12:00:00Z"), EndDate: timelineDate("2099-01-03T12:00:00Z")}
	_, err = s.Insert(deleted)
	require.NoError(t, err)
	_, err = s.ID(deleted.ID).Delete(new(Task))
	require.NoError(t, err)
	opts := ProjectTimelineOptions{Year: 2024, Timezone: "Asia/Shanghai", Page: 1}
	h, err := GetProjectTimeline(s, &user.User{ID: 1}, opts)
	require.NoError(t, err)
	require.Equal(t, 4, h.Days["2024-01-01"].ScheduledProjects)
	require.Equal(t, 4, h.Days["2024-01-01"].Deadlines)
	require.Less(t, h.LastYear, 2099)
	for _, p := range h.Items {
		require.NotEqualValues(t, 2, p.ID)
	}
	opts.ProjectID = 2
	h, err = GetProjectTimeline(s, &user.User{ID: 1}, opts)
	require.NoError(t, err)
	require.Zero(t, h.FirstYear)
	require.Zero(t, h.ExcludedTasks)
	require.Zero(t, h.Projects)
	require.Empty(t, h.Days)
	opts.ProjectID = 0
	h, err = GetProjectTimeline(s, &LinkSharing{ProjectID: 1, Permission: PermissionRead}, opts)
	require.NoError(t, err)
	require.Equal(t, 1, h.Projects)
	require.True(t, h.Items[0].IsArchived)
	opts.Status = "archived"
	h, err = GetProjectTimeline(s, &user.User{ID: 1}, opts)
	require.NoError(t, err)
	require.Equal(t, 1, h.Projects)
	opts.Status = "active"
	h, err = GetProjectTimeline(s, &LinkSharing{ProjectID: 1, Permission: PermissionRead}, opts)
	require.NoError(t, err)
	require.Empty(t, h.Items)
	opts.Status = "all"
	opts.Timezone = "invalid"
	_, err = GetProjectTimeline(s, &user.User{ID: 1}, opts)
	require.Error(t, err)
}

func TestProjectTimelineLeapYearAndPaging(t *testing.T) {
	db.LoadAndAssertFixtures(t)
	s := db.NewSession()
	defer s.Close()
	for i := 0; i < 25; i++ {
		p := &Project{Title: "Timeline pagination", OwnerID: 1}
		require.NoError(t, p.Create(s, &user.User{ID: 1}))
		_, err := s.Insert(&Task{Title: "Leap day", ProjectID: p.ID, StartDate: timelineDate("2024-02-28T12:00:00Z"), EndDate: timelineDate("2024-03-01T12:00:00Z")})
		require.NoError(t, err)
	}
	opts := ProjectTimelineOptions{Year: 2024, Timezone: "UTC", Search: "Timeline pagination", Page: 1}
	h, err := GetProjectTimeline(s, &user.User{ID: 1}, opts)
	require.NoError(t, err)
	require.Equal(t, 25, h.Projects)
	require.Equal(t, 25, h.Days["2024-02-29"].ScheduledProjects)
	require.Equal(t, 3, h.ScheduledDays)
	require.Equal(t, 2, h.TotalPages)
	require.Len(t, h.Items, 24)
	lastID := h.Items[23].ID
	opts.Page = 2
	h, err = GetProjectTimeline(s, &user.User{ID: 1}, opts)
	require.NoError(t, err)
	require.Len(t, h.Items, 1)
	require.Greater(t, h.Items[0].ID, lastID)
}
