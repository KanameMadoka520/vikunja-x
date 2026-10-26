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

package tcyai

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTCYAIDeferredTools(t *testing.T) {
	state := NewAgentState(context.Background(), Connection{}, RunInput{Mode: "write", AllowDelete: true})
	require.Len(t, state.Available, 5)
	assert.NotContains(t, state.Available, "update_task")
	initial, err := json.Marshal(state.tools())
	require.NoError(t, err)
	full, err := json.Marshal(AllTools("write", true))
	require.NoError(t, err)
	t.Logf("initial definitions: %d bytes vs full %d bytes (%.1f%% reduction)", len(initial), len(full), 100*(1-float64(len(initial))/float64(len(full))))
	require.Less(t, len(initial)*2, len(full))
	result, err := state.discover(json.RawMessage(`{"query":"update_task", "limit":1}`))
	require.NoError(t, err)
	assert.Contains(t, state.Available, "update_task")
	assert.NotContains(t, result, "parameters")
	assert.NotContains(t, result, "properties")
	var directory struct {
		Tools   []toolEntry
		Matched int  `json:"matched"`
		More    bool `json:"more_available"`
	}
	require.NoError(t, json.Unmarshal([]byte(result), &directory))
	require.Len(t, directory.Tools, 1)
	assert.Equal(t, "update_task", directory.Tools[0].Name)
	result, err = state.discover(json.RawMessage(`{"query":"task project label comment assign relate"}`))
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal([]byte(result), &directory))
	assert.LessOrEqual(t, len(directory.Tools), 5)
	assert.True(t, directory.More)
	state.Pending = []ToolCall{{ID: "pending"}}
	state.Pending[0].Function.Name = "update_task"
	for _, tool := range AllTools("write", true) {
		_, err = state.discover(json.RawMessage(`{"query":"` + toolName(tool) + `","limit":1}`))
		require.NoError(t, err)
	}
	assert.Contains(t, state.Available, "update_task", "must not evict queued calls")
	assert.LessOrEqual(t, len(state.Available), 14, "5 core + 8 recent + pinned call")
	state.Pending = nil
	state.trimTools()
	assert.LessOrEqual(t, len(state.Available), 13, "release completed call pins before the next model request")
	read := NewAgentState(context.Background(), Connection{}, RunInput{Mode: "read"})
	result, err = read.discover(json.RawMessage(`{"query":"delete_task create_task update_task"}`))
	require.NoError(t, err)
	assert.NotContains(t, result, `"name":"delete_task"`)
	assert.NotContains(t, result, `"name":"create_task"`)
	assert.NotContains(t, result, `"name":"update_task"`)
	// Parameter-only search must not match every schema's ubiquitous id field.
	result, err = state.discover(json.RawMessage(`{"query":"additionalProperties"}`))
	require.NoError(t, err)
	assert.Contains(t, result, `"tools":[]`)
}

func TestTCYAIDiscoveryHistory(t *testing.T) {
	call := ToolCall{ID: "discovery"}
	call.Function.Name = "find_tools"
	raw, err := json.Marshal(map[string]any{"tools": AllTools("write", true)})
	require.NoError(t, err)
	messages := []Message{{Role: "assistant", ToolCalls: []ToolCall{call}}, {Role: "tool", ToolCallID: call.ID, Content: string(raw)}, {Role: "tool", ToolCallID: "other", Content: string(raw)}}
	compacted := compactDiscoveryMessages(append([]Message{}, messages...))
	assert.NotContains(t, compacted[1].Content, "parameters")
	assert.Equal(t, messages[2].Content, compacted[2].Content, "unrelated results must remain intact")
	assert.Contains(t, messages[1].Content, "parameters", "stored history is untouched")
}

func TestTCYAICurrentPermissionsOverrideHistory(t *testing.T) {
	for _, mode := range []string{"read", "write", "read"} {
		state := NewAgentState(context.Background(), Connection{}, RunInput{Mode: mode, Approval: "smart", Summary: "The old session was read-only; create_project was unavailable.", ServerHistory: []Message{{Role: "assistant", Content: "I cannot create projects."}}, Message: "Create a project"})
		require.NotNil(t, state.Result.Configuration)
		assert.Equal(t, mode, state.Result.Configuration.Mode)
		assert.Contains(t, state.Messages[1].Content, "past runs only")
		data, err := state.discover(json.RawMessage(`{"query":"create_project","limit":1}`))
		require.NoError(t, err)
		var result struct {
			Tools         []toolEntry      `json:"tools"`
			Configuration AssistantOptions `json:"execution_configuration"`
		}
		require.NoError(t, json.Unmarshal([]byte(data), &result))
		assert.Equal(t, mode, result.Configuration.Mode)
		if mode == "write" {
			require.Len(t, result.Tools, 1)
			assert.Equal(t, "create_project", result.Tools[0].Name)
			assert.Contains(t, state.Available, "create_project")
		} else {
			assert.Empty(t, result.Tools)
			assert.NotContains(t, state.Available, "create_project")
		}
	}
}
