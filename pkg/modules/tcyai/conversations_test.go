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
	"encoding/json"
	"os"
	"testing"
	"time"

	"code.vikunja.io/api/pkg/config"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTCYAIConversationStorage(t *testing.T) {
	oldPath := config.FilesBasePath.GetString()
	oldSecret := config.ServiceSecret.GetString()
	config.FilesBasePath.Set(t.TempDir())
	config.ServiceSecret.Set("test-only-encryption-secret")
	t.Cleanup(func() { config.FilesBasePath.Set(oldPath); config.ServiceSecret.Set(oldSecret) })
	c, err := CreateConversation(1, "private title")
	require.NoError(t, err)
	_, err = GetConversation(2, c.ID)
	require.ErrorIs(t, err, ErrConversationMissing)
	_, err = GetConversation(1, "../../secret")
	require.ErrorIs(t, err, ErrConversationMissing)
	path, err := conversationPath(1, c.ID)
	require.NoError(t, err)
	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.NotContains(t, string(raw), "private title")
	info, err := os.Stat(path)
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0600), info.Mode().Perm())
	record, err := readConversation(1, c.ID)
	require.NoError(t, err)
	record.Turns = []ChatTurn{{ID: uuid.NewString(), RequestID: "request-1", Prompt: "private user text", Status: "completed", Started: time.Now(), Result: RunResult{RequestedModel: "model", Protocol: "anthropic", Endpoint: "https://example.com/messages", Reply: "answer"}}, {ID: uuid.NewString(), Status: "running"}}
	record.Contexts = [][]storedMessage{{{Message: Message{Role: "assistant", Content: "answer"}, Native: json.RawMessage(`[{"type":"thinking","signature":"opaque-private"}]`)}}, {}}
	require.NoError(t, writeConversation(1, record))
	value, err := GetConversation(1, c.ID)
	require.NoError(t, err)
	assert.Equal(t, "interrupted", value.Turns[1].Status)
	public, err := json.Marshal(value)
	require.NoError(t, err)
	assert.NotContains(t, string(public), "opaque-private")
	branch, err := ForkConversation(1, c.ID, record.Turns[0].ID)
	require.NoError(t, err)
	assert.Len(t, branch.Turns, 1)
	assert.Equal(t, c.ID, branch.ParentID)
	native, err := readConversation(1, branch.ID)
	require.NoError(t, err)
	assert.Contains(t, string(native.Contexts[0][0].Native), "opaque-private")
	value, err = GetConversation(1, c.ID)
	require.NoError(t, err)
	assert.Len(t, value.Turns, 2)
	value, err = RenameConversation(1, c.ID, "renamed")
	require.NoError(t, err)
	assert.Equal(t, "renamed", value.Title)
	require.NoError(t, DeleteConversation(1, c.ID))
	_, err = GetConversation(1, c.ID)
	require.ErrorIs(t, err, ErrConversationMissing)
}
