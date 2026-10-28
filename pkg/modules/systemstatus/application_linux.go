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
	"math"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func cpuCapacity(quota, cpuset string) *float64 {
	var cores float64
	for _, part := range strings.Split(strings.TrimSpace(cpuset), ",") {
		if part == "" {
			continue
		}
		bounds := strings.Split(part, "-")
		low, err := strconv.ParseUint(bounds[0], 10, 32)
		if err != nil || len(bounds) > 2 {
			return nil
		}
		high := low
		if len(bounds) == 2 {
			high, err = strconv.ParseUint(bounds[1], 10, 32)
			if err != nil || high < low {
				return nil
			}
		}
		cores += float64(high - low + 1)
	}
	parts := strings.Fields(quota)
	if len(parts) == 2 && parts[0] != "max" {
		q, e1 := strconv.ParseUint(parts[0], 10, 64)
		period, e2 := strconv.ParseUint(parts[1], 10, 64)
		if e1 == nil && e2 == nil && q > 0 && period > 0 {
			limit := float64(q) / float64(period)
			if cores > 0 {
				cores = math.Min(cores, limit)
			} else {
				cores = limit
			}
		}
	}
	if cores <= 0 {
		return nil
	}
	return &cores
}
func cgroupApplication(root string, before applicationCounters, now time.Time) (ApplicationSnapshot, applicationCounters) {
	cpu := fields(read(filepath.Join(root, "cpu.stat")))
	usage, valid := cpu["usage_usec"]
	after := applicationCounters{usage: usage, valid: valid, at: now}
	out := ApplicationSnapshot{CPUPercent: applicationCPU(before, after), CPUCores: cpuCapacity(read(filepath.Join(root, "cpu.max")), read(filepath.Join(root, "cpuset.cpus.effective"))), GPUStatus: "not_assigned"}
	if value, err := strconv.ParseUint(read(filepath.Join(root, "memory.current")), 10, 64); err == nil {
		out.MemoryUsed = &value
	}
	if value, err := strconv.ParseUint(read(filepath.Join(root, "memory.max")), 10, 64); err == nil {
		out.MemoryLimit = &value
	}
	return out, after
}
func measureApplication(before applicationCounters, now time.Time) (ApplicationSnapshot, applicationCounters) {
	out, after := cgroupApplication("/sys/fs/cgroup", before, now)
	for _, pattern := range []string{"/dev/nvidia[0-9]*", "/dev/dri/renderD*"} {
		matches, _ := filepath.Glob(pattern)
		if len(matches) > 0 {
			out.GPUStatus = "unavailable"
		}
	}
	return out, after
}
