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
	"sync"
	"time"

	"code.vikunja.io/api/pkg/config"
	"code.vikunja.io/api/pkg/health"
	"code.vikunja.io/api/pkg/version"
)

type Snapshot struct {
	Version       string    `json:"version" doc:"Running API build version."`
	Started       time.Time `json:"started" doc:"Application process start, UTC; resets on restart."`
	UptimeSeconds int64     `json:"uptime_seconds" doc:"Continuous application process runtime in seconds."`
	Sampled       time.Time `json:"sampled" doc:"UTC sample time. Samples are shared and cached for 15 seconds."`
	Healthy       bool      `json:"healthy" doc:"Database and configured Redis are reachable."`
	CPUPercent    *float64  `json:"cpu_percent" doc:"CPU time delta divided by elapsed time and available CPU cores, percent; null until a sample pair exists."`
	CPUCores      float64   `json:"cpu_cores" doc:"Available cores after CPU quota and cpuset limits; zero if unavailable."`
	CPULimited    bool      `json:"cpu_limited" doc:"Whether a finite cgroup CPU quota or cpuset restriction was found."`
	MemoryUsed    *uint64   `json:"memory_used" doc:"Container working set bytes: cgroup usage minus inactive file cache, as in Docker stats."`
	MemoryTotal   *uint64   `json:"memory_total" doc:"Finite cgroup memory limit, or host RAM when no independent limit exists."`
	MemoryLimited bool      `json:"memory_limited" doc:"True only when an independent finite cgroup memory limit applies."`
	DiskUsed      *uint64   `json:"disk_used" doc:"Used bytes on the filesystem containing uploaded data; includes other applications on that filesystem."`
	DiskTotal     *uint64   `json:"disk_total" doc:"Filesystem capacity available to this process: used plus available bytes; not a container-specific quota."`
}

var started = time.Now().UTC()
var cache struct {
	sync.Mutex
	snapshot     Snapshot
	previousCPU  float64
	previousTime time.Time
}

// Read performs no directory scans, external commands or background polling.
//
//nolint:contextcheck // Existing health.Check owns its database/Redis contexts.
func Read() Snapshot {
	cache.Lock()
	defer cache.Unlock()
	now := time.Now().UTC()
	if !cache.snapshot.Sampled.IsZero() && now.Sub(cache.snapshot.Sampled) < 15*time.Second {
		return cache.snapshot
	}
	sample, cpuSeconds, cpuOK := measure(config.FilesBasePath.GetString())
	sample.Version = version.Version
	sample.Started = started
	sample.UptimeSeconds = int64(now.Sub(started).Seconds())
	sample.Sampled = now
	sample.Healthy = health.Check() == nil
	if cpuOK && !cache.previousTime.IsZero() && sample.CPUCores > 0 && cpuSeconds >= cache.previousCPU {
		percent := 100 * (cpuSeconds - cache.previousCPU) / now.Sub(cache.previousTime).Seconds() / sample.CPUCores
		sample.CPUPercent = &percent
	}
	if cpuOK {
		cache.previousCPU = cpuSeconds
		cache.previousTime = now
	} else {
		cache.previousTime = time.Time{}
	}
	cache.snapshot = sample
	return sample
}
