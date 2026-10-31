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

type announcement20261031234639 struct {
	ProjectID   int64     `xorm:"bigint not null pk"`
	Title       string    `xorm:"varchar(160) not null"`
	Content     string    `xorm:"longtext null"`
	Revision    int64     `xorm:"bigint not null default 0"`
	Updated     time.Time `xorm:"updated not null"`
	UpdatedByID int64     `xorm:"bigint not null"`
}

func (*announcement20261031234639) TableName() string { return "project_announcements" }

type routine20261031234639 struct {
	TaskID   int64     `xorm:"bigint not null pk"`
	Enabled  bool      `xorm:"not null default false"`
	Paused   bool      `xorm:"not null default false"`
	Timezone string    `xorm:"varchar(100) not null"`
	Revision int64     `xorm:"bigint not null default 0"`
	Created  time.Time `xorm:"created not null"`
	Updated  time.Time `xorm:"updated not null"`
}

func (*routine20261031234639) TableName() string { return "task_routines" }

type checkin20261031234639 struct {
	ID            int64     `xorm:"bigint autoincr not null pk"`
	TaskID        int64     `xorm:"bigint not null unique(routine_day)"`
	LocalDate     time.Time `xorm:"DATE not null unique(routine_day)"`
	Timezone      string    `xorm:"varchar(100) not null"`
	CompletedAt   time.Time `xorm:"not null"`
	CompletedByID int64     `xorm:"bigint not null"`
}

func (*checkin20261031234639) TableName() string { return "task_routine_checkins" }
func migrateProjectRoutines20261031234639(tx *xorm.Engine) error {
	// All three are new tables. Existing project/task columns and indexes are untouched.
	return tx.Sync(&announcement20261031234639{}, &routine20261031234639{}, &checkin20261031234639{}) //nolint:forbidigo // Brand-new tables.
}
func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID: "20261031234639", Description: "Add independent project announcements and daily task check-in history",
		Migrate: migrateProjectRoutines20261031234639,
		Rollback: func(tx *xorm.Engine) error {
			return tx.DropTables(&checkin20261031234639{}, &routine20261031234639{}, &announcement20261031234639{})
		},
	})
}
