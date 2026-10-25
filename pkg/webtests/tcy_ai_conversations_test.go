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

package webtests

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"code.vikunja.io/api/pkg/config"
	"code.vikunja.io/api/pkg/i18n"
	"code.vikunja.io/api/pkg/models"
	"code.vikunja.io/api/pkg/modules/auth"
	"code.vikunja.io/api/pkg/modules/tcyai"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTCYAIConversations(t *testing.T) {
	i18n.Init()
	e, err := setupTestEnv()
	require.NoError(t, err)
	token := humaTokenFor(t, &testuser1)
	other := humaTokenFor(t, &testuser2)
	oldPath := config.FilesBasePath.GetString()
	oldAllow := config.OutgoingRequestsAllowNonRoutableIPs.GetBool()
	config.FilesBasePath.Set(t.TempDir())
	config.OutgoingRequestsAllowNonRoutableIPs.Set(true)
	t.Cleanup(func() { config.FilesBasePath.Set(oldPath); config.OutgoingRequestsAllowNonRoutableIPs.Set(oldAllow) })
	var calls atomic.Int64
	write := func(w http.ResponseWriter, text string) { _, err := io.WriteString(w, text); assert.NoError(t, err) }
	provider := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var body struct {
			Messages []tcyai.Message `json:"messages"`
			Tools    []any           `json:"tools"`
		}
		if !assert.NoError(t, json.NewDecoder(r.Body).Decode(&body)) {
			return
		}
		if len(body.Messages) > 0 && body.Messages[len(body.Messages)-1].Content == "slow" {
			<-r.Context().Done()
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		text := "Done"
		if len(body.Tools) == 0 {
			text = "Saved compact summary"
		}
		if len(body.Tools) > 0 && body.Messages[len(body.Messages)-1].Role != "tool" {
			write(w, `data: {"model":"actual-fixture","choices":[{"index":0,"delta":{"reasoning_content":"Checking accessible projects"}}]}`+"\n\n")
			write(w, `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"list_projects","arguments":"{}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":20}}`+"\n\n")
			return
		}
		write(w, fmt.Sprintf(`data: {"model":"actual-fixture","choices":[{"index":0,"delta":{"content":%q},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20}}`, text)+"\n\n")
	}))
	defer provider.Close()
	pool := x509.NewCertPool()
	pool.AddCert(provider.Certificate())
	original := http.DefaultTransport
	transport := original.(*http.Transport).Clone()
	transport.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = original; transport.CloseIdleConnections() })
	saved := humaRequest(t, e, "POST", "/api/v2/ai/settings", fmt.Sprintf(`{"connections":[{"id":"fixture","name":"Fixture","kind":"chat","protocol":"openai-chat","base_url":%q,"model":"requested","api_key":"private-fixture"}],"assistant":"fixture","cleanup":"","transcription":""}`, provider.URL), token, "")
	require.Equal(t, 200, saved.Code, saved.Body.String())
	tested := humaRequest(t, e, "POST", "/api/v2/ai/test", `{"connection_id":"fixture","audio":"","filename":""}`, token, "")
	require.Equal(t, 200, tested.Code, tested.Body.String())
	assert.Contains(t, tested.Body.String(), "tool-result continuation passed")
	base := "/api/v2/ai/conversations"
	create := humaRequest(t, e, "POST", base, `{"title":""}`, token, "")
	require.Equal(t, 201, create.Code, create.Body.String())
	var conversation tcyai.Conversation
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &conversation))
	path := base + "/" + conversation.ID
	require.Equal(t, 401, humaRequest(t, e, "GET", path, "", "", "").Code)
	assert.Contains(t, []int{401, 403}, humaRequest(t, e, "GET", base, "", "tk_2eef46f40ebab3304919ab2e7e39993f75f29d2e", "").Code)
	require.Equal(t, 404, humaRequest(t, e, "GET", path, "", other, "").Code)
	require.Equal(t, 404, humaRequest(t, e, "POST", path+"/messages", `{"message":"denied","history":[],"project_id":0,"mode":"read","allow_delete":false,"request_id":"denied-key"}`, other, "").Code)
	share, err := auth.NewLinkShareJWTAuthtoken(&models.LinkSharing{ID: 1, Hash: "test", ProjectID: 1})
	require.NoError(t, err)
	assert.Contains(t, []int{401, 403}, humaRequest(t, e, "GET", base, "", share, "").Code)
	wait := func() tcyai.Conversation {
		var v tcyai.Conversation
		require.Eventually(t, func() bool {
			rec := humaRequest(t, e, "GET", path, "", token, "")
			if rec.Code != 200 {
				return false
			}
			if json.Unmarshal(rec.Body.Bytes(), &v) != nil {
				return false
			}
			return len(v.Turns) > 0 && v.Turns[len(v.Turns)-1].Status != "running"
		}, 5*time.Second, 10*time.Millisecond)
		return v
	}
	message := func(text, key string) *httptest.ResponseRecorder {
		return humaRequest(t, e, "POST", path+"/messages", fmt.Sprintf(`{"message":%q,"history":[],"project_id":0,"mode":"read","allow_delete":false,"request_id":%q}`, text, key), token, "")
	}
	key := uuid.NewString()
	started := message("List projects", key)
	require.Equal(t, 201, started.Code, started.Body.String())
	conversation = wait()
	require.Equal(t, "completed", conversation.Turns[0].Status, conversation.Turns[0].Result.Error)
	assert.Equal(t, "Done", conversation.Turns[0].Result.Reply)
	require.Len(t, conversation.Turns[0].Result.Actions, 1)
	assert.True(t, conversation.Turns[0].Result.Actions[0].Success)
	assert.Equal(t, int64(60), conversation.Turns[0].Result.Usage.Input+conversation.Turns[0].Result.Usage.Output)
	assert.NotNil(t, conversation.Turns[0].Result.FirstTextMS)
	assert.Equal(t, "actual-fixture", conversation.Turns[0].Result.Model)
	before := calls.Load()
	require.Equal(t, 201, message("List projects", key).Code)
	assert.Equal(t, before, calls.Load())
	assert.Equal(t, 409, message("Different message", key).Code)
	for n := 0; n < 4; n++ {
		require.Equal(t, 201, message(fmt.Sprintf("Followup %d", n), uuid.NewString()).Code)
		conversation = wait()
		assert.Equal(t, "completed", conversation.Turns[len(conversation.Turns)-1].Status)
	}
	compact := humaRequest(t, e, "POST", path+"/compact", `{"connection_id":"fixture"}`, token, "")
	require.Equal(t, 201, compact.Code, compact.Body.String())
	require.NoError(t, json.Unmarshal(compact.Body.Bytes(), &conversation))
	require.Len(t, conversation.Turns, 5)
	require.Len(t, conversation.Compactions, 1)
	assert.Equal(t, 1, conversation.Compactions[0].Through)
	fork := humaRequest(t, e, "POST", path+"/fork", fmt.Sprintf(`{"turn_id":%q}`, conversation.Turns[1].ID), token, "")
	require.Equal(t, 201, fork.Code, fork.Body.String())
	var branch tcyai.Conversation
	require.NoError(t, json.Unmarshal(fork.Body.Bytes(), &branch))
	assert.Len(t, branch.Turns, 2)
	assert.Empty(t, branch.Compactions)
	assert.Equal(t, conversation.ID, branch.ParentID)
	assert.Equal(t, 404, humaRequest(t, e, "DELETE", base+"/"+branch.ID, "", other, "").Code)
	assert.Equal(t, 204, humaRequest(t, e, "DELETE", base+"/"+branch.ID, "", token, "").Code)
	require.Equal(t, 201, message("slow", uuid.NewString()).Code)
	assert.Equal(t, 409, message("busy", uuid.NewString()).Code)
	assert.Equal(t, 201, humaRequest(t, e, "POST", path+"/stop", "", token, "").Code)
	conversation = wait()
	assert.Equal(t, "stopped", conversation.Turns[len(conversation.Turns)-1].Status)
	prompt := humaRequest(t, e, "GET", "/api/v2/ai/prompt?mode=read", "", token, "")
	assert.Equal(t, 200, prompt.Code)
	assert.NotContains(t, prompt.Body.String(), `required\\\":null`)
	assert.Equal(t, "no-store", prompt.Header().Get("Cache-Control"))
	assert.NotContains(t, strings.Join([]string{create.Body.String(), compact.Body.String(), fork.Body.String()}, ""), "private-fixture")
}
