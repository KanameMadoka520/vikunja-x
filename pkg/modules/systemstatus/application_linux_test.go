//go:build linux

package systemstatus

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApplicationCounters(t *testing.T) {
	now := time.Now()
	assert.Nil(t, applicationCPU(applicationCounters{}, applicationCounters{100, now, true}))
	value := applicationCPU(applicationCounters{100, now, true}, applicationCounters{1500100, now.Add(time.Second), true})
	require.NotNil(t, value)
	assert.InDelta(t, 150., *value, 0.001)
	assert.Nil(t, applicationCPU(applicationCounters{100, now, true}, applicationCounters{50, now.Add(time.Second), true}))
	assert.InDelta(t, 1.5, *cpuCapacity("150000 100000", "0-7"), 0.001)
	assert.InDelta(t, 3., *cpuCapacity("max 100000", "0-1,7"), 0.001)
	assert.Nil(t, cpuCapacity("", ""))
	root := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(root, "cpu.stat"), []byte("usage_usec 100\n"), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(root, "memory.current"), []byte("4096"), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(root, "memory.max"), []byte("max"), 0600))
	out, counters := cgroupApplication(root, applicationCounters{}, now)
	assert.Nil(t, out.CPUPercent)
	assert.True(t, counters.valid)
	assert.Equal(t, uint64(4096), *out.MemoryUsed)
	assert.Nil(t, out.MemoryLimit)
	assert.Nil(t, out.GPUPercent)
	assert.Equal(t, "not_assigned", out.GPUStatus)
}
func TestApplicationStorageScope(t *testing.T) {
	root, outside := t.TempDir(), t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(root, "upload"), []byte("12345"), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(outside, "other-app"), []byte("not ours"), 0600))
	require.NoError(t, os.Symlink(outside, filepath.Join(root, "link")))
	size, err := scanFiles(context.Background(), root)
	require.NoError(t, err)
	assert.Equal(t, uint64(5), *size)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = scanFiles(ctx, root)
	assert.ErrorIs(t, err, context.Canceled)
}
