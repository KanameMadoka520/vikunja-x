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

package migration

import (
	"time"

	"src.techknowlogick.com/xormigrate"
	"xorm.io/xorm"
)

type projectCompletion20261031032235 struct {
	IsCompleted bool      `xorm:"not null default false"`
	CompletedAt time.Time `xorm:"null"`
}

func (*projectCompletion20261031032235) TableName() string { return "projects" }

type projectLifecycle20261031032235 struct {
	ID         int64     `xorm:"bigint autoincr not null pk"`
	ProjectID  int64     `xorm:"bigint not null index"`
	Kind       string    `xorm:"varchar(20) not null"`
	OccurredAt time.Time `xorm:"null index"`
}

func (*projectLifecycle20261031032235) TableName() string { return "project_lifecycle_events" }

func migrateProjectLifecycle20261031032235(tx *xorm.Engine) error {
	if err := partialSync(tx, &projectCompletion20261031032235{}); err != nil {
		return err
	}
	if err := tx.Sync(&projectLifecycle20261031032235{}); err != nil { //nolint:forbidigo // Brand-new table.
		return err
	}
	// Existing archives have no trustworthy original archive timestamp. Never use
	// updated or migration time: either would fabricate the user's history.
	_, err := tx.Exec(`INSERT INTO project_lifecycle_events (project_id, kind) SELECT id, 'archived' FROM projects WHERE is_archived = true`)
	return err
}
func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID: "20261031032235", Description: "Track project completion and archive history with unknown-date legacy archives",
		Migrate:  migrateProjectLifecycle20261031032235,
		Rollback: func(tx *xorm.Engine) error { return tx.DropTables(&projectLifecycle20261031032235{}) },
	})
}
