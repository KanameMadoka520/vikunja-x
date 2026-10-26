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

type driveFiles20261026171504 struct {
	FileID    int64     `xorm:"bigint pk"`
	OwnerID   int64     `xorm:"bigint not null index"`
	Category  string    `xorm:"varchar(120)"`
	Pinned    bool      `xorm:"not null default false"`
	TrashedAt time.Time `xorm:"null"`
	Purging   bool      `xorm:"not null default false" json:"purging"`
	Revision  int64     `xorm:"bigint not null default 1"`
}

func (*driveFiles20261026171504) TableName() string { return "drive_files" }
func migrateDrive20261026171504(tx *xorm.Engine) error {
	if err := tx.Sync(&driveFiles20261026171504{}); err != nil { //nolint:forbidigo // Brand-new table; no existing indexes can be dropped.
		return err
	}
	// Only genuine user-owned, referenced uploads. Exports and anonymous shares are excluded.
	_, err := tx.Exec(`INSERT INTO drive_files (file_id, owner_id, revision, pinned)
 SELECT f.id, f.created_by_id, 1, false FROM files f
 WHERE f.created_by_id > 0 AND EXISTS (SELECT 1 FROM users u WHERE u.id = f.created_by_id)
 AND (EXISTS (SELECT 1 FROM task_attachments a WHERE a.file_id = f.id)
 OR EXISTS (SELECT 1 FROM projects p WHERE p.background_file_id = f.id)
 OR EXISTS (SELECT 1 FROM users u WHERE u.avatar_file_id = f.id))
 AND NOT EXISTS (SELECT 1 FROM drive_files d WHERE d.file_id = f.id)`)
	return err
}
func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID: "20261026171504", Description: "Add personal drive and retain existing referenced user uploads",
		Migrate:  migrateDrive20261026171504,
		Rollback: func(tx *xorm.Engine) error { return tx.DropTables(&driveFiles20261026171504{}) },
	})
}
