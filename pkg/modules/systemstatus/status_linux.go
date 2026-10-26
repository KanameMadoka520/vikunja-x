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
	"runtime"
	"strconv"
	"strings"

	"golang.org/x/sys/unix"
)

func read(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}
func number(path string) (uint64, bool) {
	v, err := strconv.ParseUint(read(path), 10, 64)
	return v, err == nil
}
func fields(text string) map[string]uint64 {
	result := map[string]uint64{}
	for line := range strings.SplitSeq(text, "\n") {
		f := strings.Fields(line)
		if len(f) < 2 {
			continue
		}
		if v, err := strconv.ParseUint(f[1], 10, 64); err == nil {
			result[strings.TrimSuffix(f[0], ":")] = v
		}
	}
	return result
}
func cpuCount(text string) int {
	count := 0
	for part := range strings.SplitSeq(text, ",") {
		bounds := strings.Split(part, "-")
		first, err := strconv.Atoi(bounds[0])
		if err != nil || first < 0 {
			return 0
		}
		last := first
		if len(bounds) == 2 {
			last, err = strconv.Atoi(bounds[1])
			if err != nil || last < first {
				return 0
			}
		} else if len(bounds) > 2 {
			return 0
		}
		count += last - first + 1
	}
	return count
}
func quota(text string) float64 {
	f := strings.Fields(text)
	if len(f) != 2 {
		return 0
	}
	q, e := strconv.ParseFloat(f[0], 64)
	p, e2 := strconv.ParseFloat(f[1], 64)
	if e != nil || e2 != nil || q <= 0 || p <= 0 {
		return 0
	}
	return q / p
}
func workingSet(used, inactive uint64) uint64 {
	if inactive > used {
		return used
	}
	return used - inactive
}

func measure(dataPath string) (Snapshot, float64, bool) {
	out := Snapshot{}
	base := "/sys/fs/cgroup"
	// Private Docker cgroup namespaces use '/', while host/shared namespaces
	// expose the current process path. Resolve only kernel-provided paths.
	for line := range strings.SplitSeq(read("/proc/self/cgroup"), "\n") {
		if strings.HasPrefix(line, "0::") {
			p := filepath.Join(base, strings.TrimPrefix(line, "0::"))
			if _, err := os.Stat(filepath.Join(p, "cpu.stat")); err == nil {
				base = p
			}
			break
		}
	}
	cpuSeconds, cpuOK := measureCgroup(base, &out)
	var disk unix.Statfs_t
	if err := unix.Statfs(dataPath, &disk); err == nil && disk.Bsize > 0 {
		used := (disk.Blocks - disk.Bfree) * uint64(disk.Bsize)
		total := used + disk.Bavail*uint64(disk.Bsize)
		out.DiskUsed = &used
		out.DiskTotal = &total
	}
	return out, cpuSeconds, cpuOK
}
func measureCgroup(base string, out *Snapshot) (float64, bool) {
	total := fields(read("/proc/meminfo"))["MemTotal"] * 1024
	cores := float64(runtime.NumCPU())
	usage, ok := number(filepath.Join(base, "memory.current"))
	cpuStat := fields(read(filepath.Join(base, "cpu.stat")))
	cpu, hasCPU := cpuStat["usage_usec"]
	inactive := fields(read(filepath.Join(base, "memory.stat")))["inactive_file"]
	if !ok { // cgroup v1 layouts in a private container namespace.
		usage, ok = number(filepath.Join(base, "memory/memory.usage_in_bytes"))
		inactive = fields(read(filepath.Join(base, "memory/memory.stat")))["total_inactive_file"]
		if n, valid := number(filepath.Join(base, "memory/memory.limit_in_bytes")); valid && n > 0 && n < total {
			total = n
			out.MemoryLimited = true
		}
		n, valid := number(filepath.Join(base, "cpuacct/cpuacct.usage"))
		cpu = n / 1000
		hasCPU = valid
		q := quota(read(filepath.Join(base, "cpu/cpu.cfs_quota_us")) + " " + read(filepath.Join(base, "cpu/cpu.cfs_period_us")))
		if q > 0 {
			cores = min(cores, q)
			out.CPULimited = true
		}
		if n := cpuCount(read(filepath.Join(base, "cpuset/cpuset.cpus"))); n > 0 && float64(n) < cores {
			cores = float64(n)
			out.CPULimited = true
		}
	} else {
		// Honor visible ancestor limits as well as the leaf cgroup.
		for dir := base; ; dir = filepath.Dir(dir) {
			if q := quota(read(filepath.Join(dir, "cpu.max"))); q > 0 {
				cores = min(cores, q)
				out.CPULimited = true
			}
			if n, valid := number(filepath.Join(dir, "memory.max")); valid && n > 0 && n < total {
				total = n
				out.MemoryLimited = true
			}
			if dir == "/sys/fs/cgroup" || !strings.HasPrefix(dir, "/sys/fs/cgroup/") {
				break
			}
		}
		if n := cpuCount(read(filepath.Join(base, "cpuset.cpus.effective"))); n > 0 && float64(n) < cores {
			cores = float64(n)
			out.CPULimited = true
		}
	}
	if hasCPU {
		out.CPUCores = cores
	}
	if ok {
		used := workingSet(usage, inactive)
		out.MemoryUsed = &used
		if total > 0 {
			out.MemoryTotal = &total
		}
	}
	return float64(cpu) / 1e6, hasCPU
}
