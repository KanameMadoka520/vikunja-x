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
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"

	"code.vikunja.io/api/pkg/config"
	"code.vikunja.io/api/pkg/i18n"
	"code.vikunja.io/api/pkg/modules/tcyai"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTCYAttachmentsRoutes(t *testing.T) {
	i18n.Init()
	e, err := setupTestEnv()
	require.NoError(t, err)
	old := config.FilesBasePath.GetString()
	config.FilesBasePath.Set(t.TempDir())
	t.Cleanup(func() { config.FilesBasePath.Set(old) })
	token, other := humaTokenFor(t, &testuser1), humaTokenFor(t, &testuser2)
	created := humaRequest(t, e, "POST", "/api/v2/ai/conversations", `{"title":"Files"}`, token, "")
	require.Equal(t, 201, created.Code)
	var c tcyai.Conversation
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &c))
	path := "/api/v2/ai/conversations/" + c.ID
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, err := form.CreateFormFile("file", "notes.txt")
	require.NoError(t, err)
	_, err = part.Write([]byte("private notes"))
	require.NoError(t, err)
	require.NoError(t, form.Close())
	req := httptest.NewRequest("POST", path+"/attachments", bytes.NewReader(body.Bytes()))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", form.FormDataContentType())
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, 201, rec.Code, rec.Body.String())
	var a tcyai.ChatAttachment
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &a))
	filePath := path + "/attachments/" + a.ID
	for _, url := range []string{filePath, path + "/export?format=zip"} {
		assert.Equal(t, 401, humaRequest(t, e, "GET", url, "", "", "").Code)
		assert.Equal(t, 404, humaRequest(t, e, "GET", url, "", other, "").Code)
		assert.Contains(t, []int{401, 403}, humaRequest(t, e, "GET", url, "", "tk_2eef46f40ebab3304919ab2e7e39993f75f29d2e", "").Code)
	}
	got := humaRequest(t, e, "GET", filePath, "", token, "")
	require.Equal(t, 200, got.Code)
	assert.Equal(t, "private notes", got.Body.String())
	assert.Equal(t, "no-store", got.Header().Get("Cache-Control"))
	assert.True(t, strings.HasPrefix(got.Header().Get("Content-Disposition"), "attachment"))
	exported := humaRequest(t, e, "GET", path+"/export?format=zip", "", token, "")
	require.Equal(t, 200, exported.Code)
	assert.Equal(t, "application/zip", exported.Header().Get("Content-Type"))
	require.Equal(t, 204, humaRequest(t, e, "DELETE", filePath, "", token, "").Code)
	assert.Equal(t, 404, humaRequest(t, e, "GET", filePath, "", token, "").Code)
}
