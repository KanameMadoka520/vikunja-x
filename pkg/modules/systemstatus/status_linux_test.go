//go:build linux

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

package systemstatus

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTCYSystemStatusCounters(t *testing.T) {
	assert.Equal(t, 8, cpuCount("0-3,6-9"))
	assert.Equal(t, 0, cpuCount(""))
	assert.Equal(t, 0, cpuCount("4-2"))
	assert.InDelta(t, 0.5, quota("50000 100000"), 0.00001)
	assert.Zero(t, quota("max 100000"))
	assert.Zero(t, quota("-1 100000"))
	assert.Equal(t, uint64(600), workingSet(1000, 400))
	assert.Equal(t, uint64(1000), workingSet(1000, 1500))
	sample, _, _ := measure(t.TempDir())
	assert.NotNil(t, sample.DiskTotal)
	assert.Positive(t, *sample.DiskTotal)
	assert.LessOrEqual(t, *sample.DiskUsed, *sample.DiskTotal)
}

func TestTCYSystemStatusLimitedCgroup(t *testing.T) {
	base := t.TempDir()
	for name, value := range map[string]string{"memory.current": "10000000", "memory.max": "20000000", "memory.stat": "inactive_file 2000000", "cpu.stat": "usage_usec 2000000", "cpu.max": "50000 100000", "cpuset.cpus.effective": "0-3"} {
		require.NoError(t, os.WriteFile(filepath.Join(base, name), []byte(value), 0600))
	}
	var sample Snapshot
	cpu, ok := measureCgroup(base, &sample)
	assert.True(t, ok)
	assert.InDelta(t, 2, cpu, 0.00001)
	assert.InDelta(t, 0.5, sample.CPUCores, 0.00001)
	assert.True(t, sample.CPULimited)
	assert.True(t, sample.MemoryLimited)
	assert.Equal(t, uint64(8000000), *sample.MemoryUsed)
	assert.Equal(t, uint64(20000000), *sample.MemoryTotal)
}
