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

//nolint:gosmopolitan // Bilingual tool contracts are intentional.
package tcyai

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTCYAIAgentValidation(t *testing.T) {
	write := RunInput{Mode: "write"}
	for _, raw := range []string{`{"id":1,"title":"","unknown":true}`, `{"id":1,"priority":1.5}`, `{"id":1,"due_date":"tomorrow"}`, `{"id":1}`, `{"id":1,"reminders":[{"reminder":"2026-10-27T10:00:00","password":"bad"}]}`, `null`, `[]`} {
		_, err := ValidateTool("update_task", json.RawMessage(raw), write)
		require.Error(t, err, raw)
	}
	_, err := ValidateTool("delete_task", json.RawMessage(`{"id":1}`), write)
	require.Error(t, err)
	_, err = ValidateTool("create_task", json.RawMessage(`{"project_id":1,"title":"meeting","start_date":"2026-10-27T10:00:00+08:00","reminders":[{"reminder":"2026-10-27T09:45:00+08:00"}]}`), write)
	require.NoError(t, err)
	assert.True(t, NeedsReview("delete_task", RunInput{Approval: "auto"}))
	assert.True(t, NeedsReview("add_comment", RunInput{Approval: "auto"}))
	assert.False(t, NeedsReview("bulk_update_tasks", RunInput{Approval: "auto"}))
	assert.True(t, NeedsReview("bulk_update_tasks", RunInput{Approval: "smart"}))
}
func TestTCYAIAgentReviewState(t *testing.T) {
	state := NewAgentState(context.Background(), Connection{Model: "test"}, RunInput{Mode: "write", Message: "current", ServerHistory: []Message{{Role: "user", Content: "old"}, {Role: "assistant", Content: "history"}}})
	assert.Equal(t, 3, state.HistoryStart)
	state.Pending = []ToolCall{{ID: "call"}}
	state.Pending[0].Function.Name = "update_task"
	state.Pending[0].Function.Arguments = `{"id":1,"title":"old"}`
	state.Result.Pause = "review"
	state.Result.Pending = &Operation{ID: "receipt", Tool: "update_task", Arguments: state.Pending[0].Function.Arguments}
	prepare := func(context.Context, string, json.RawMessage) (Operation, error) {
		return Operation{Before: `{"id":1,"title":"current"}`, Version: "version", Units: 1}, nil
	}
	require.ErrorIs(t, ReviewAgent(context.Background(), state, ReviewInput{OperationID: "wrong", Decision: "approve"}, prepare), ErrAgentReview)
	require.NoError(t, ReviewAgent(context.Background(), state, ReviewInput{OperationID: "receipt", Decision: "edit", Arguments: `{"id":1,"title":"edited"}`}, prepare))
	assert.Equal(t, "review", state.Result.Pause)
	assert.NotEqual(t, "receipt", state.Result.Pending.ID)
	require.ErrorIs(t, ReviewAgent(context.Background(), state, ReviewInput{OperationID: "receipt", Decision: "approve"}, prepare), ErrAgentReview)
	require.NoError(t, ReviewAgent(context.Background(), state, ReviewInput{OperationID: state.Result.Pending.ID, Decision: "approve"}, prepare))
	require.NotNil(t, state.Approved)
	assert.Contains(t, state.Approved.Arguments, "edited")
	assert.Empty(t, state.Result.Pause)
}
