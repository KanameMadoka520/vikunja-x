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

//nolint:gosmopolitan // Chinese persona and transcript fixtures are intentional.
package tcyai

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"code.vikunja.io/api/pkg/config"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func chatAttachmentFixture(t *testing.T) (Conversation, ChatAttachment, []byte) {
	t.Helper()
	path, secret := config.FilesBasePath.GetString(), config.ServiceSecret.GetString()
	config.FilesBasePath.Set(t.TempDir())
	config.ServiceSecret.Set("attachment-fixture-secret")
	t.Cleanup(func() { config.FilesBasePath.Set(path); config.ServiceSecret.Set(secret) })
	c, err := CreateConversation(1, "带图片的测试会话")
	require.NoError(t, err)
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var b bytes.Buffer
	require.NoError(t, png.Encode(&b, img))
	a, err := UploadChatAttachment(1, c.ID, "test image.png", bytes.NewReader(b.Bytes()))
	require.NoError(t, err)
	return c, a, b.Bytes()
}
func TestTCYAttachmentsStorageAndFork(t *testing.T) {
	c, a, data := chatAttachmentFixture(t)
	p, err := attachmentPath(1, a.ID)
	require.NoError(t, err)
	encrypted, err := os.ReadFile(p)
	require.NoError(t, err)
	assert.NotContains(t, string(encrypted), string(data))
	assert.Greater(t, len(encrypted), len(data))
	_, _, err = DownloadChatAttachment(2, c.ID, a.ID)
	require.ErrorIs(t, err, ErrConversationMissing)
	unrelated, err := CreateConversation(1, "other")
	require.NoError(t, err)
	_, _, err = DownloadChatAttachment(1, unrelated.ID, a.ID)
	require.ErrorIs(t, err, ErrAttachmentMissing)
	twice, err := UploadChatAttachment(1, c.ID, a.Name, bytes.NewReader(data))
	require.NoError(t, err)
	assert.Equal(t, a.ID, twice.ID)
	c, err = GetConversation(1, c.ID)
	require.NoError(t, err)
	require.Equal(t, 1, c.Storage.AttachmentCount)
	assert.Equal(t, int64(len(encrypted)), c.Storage.AttachmentBytes)
	require.NoError(t, os.Remove(p))
	_, err = UploadChatAttachment(1, c.ID, a.Name, bytes.NewReader(data))
	require.NoError(t, err)
	_, repaired, err := DownloadChatAttachment(1, c.ID, a.ID)
	require.NoError(t, err)
	assert.Equal(t, data, repaired)
	stat, _ := os.Stat(p)
	assert.Equal(t, os.FileMode(0600), stat.Mode().Perm())
	record, err := readConversation(1, c.ID)
	require.NoError(t, err)
	turn := ChatTurn{ID: uuid.NewString(), Prompt: "test", Status: "completed", Started: time.Now(), Attachments: []ChatAttachment{a}}
	record.Turns = []ChatTurn{turn}
	record.Contexts = [][]storedMessage{{{Message: Message{Role: "user", Content: "test", Attachments: []ChatAttachment{a}, AttachmentOwner: 1}}}}
	record.DraftAttachments = nil
	require.NoError(t, writeConversation(1, record))
	fork, err := ForkConversation(1, c.ID, turn.ID)
	require.NoError(t, err)
	require.NoError(t, DeleteConversation(1, c.ID))
	_, content, err := DownloadChatAttachment(1, fork.ID, a.ID)
	require.NoError(t, err)
	assert.Equal(t, data, content)
	require.NoError(t, DeleteConversation(1, fork.ID))
	_, err = os.Stat(p)
	assert.True(t, os.IsNotExist(err))
}
func TestTCYAttachmentsExportAndMissing(t *testing.T) {
	c, a, data := chatAttachmentFixture(t)
	record, err := readConversation(1, c.ID)
	require.NoError(t, err)
	record.Turns = []ChatTurn{{ID: uuid.NewString(), Prompt: "BEFORE", Started: time.Now(), Attachments: []ChatAttachment{a}, Result: RunResult{Reply: "AFTER"}}}
	record.DraftAttachments = nil
	require.NoError(t, writeConversation(1, record))
	blob, kind, err := ExportConversation(1, c.ID, "zip")
	require.NoError(t, err)
	assert.Equal(t, "application/zip", kind)
	z, err := zip.NewReader(bytes.NewReader(blob), int64(len(blob)))
	require.NoError(t, err)
	content := map[string][]byte{}
	for _, f := range z.File {
		r, err := f.Open()
		require.NoError(t, err)
		content[f.Name], err = io.ReadAll(r)
		require.NoError(t, err)
		require.NoError(t, r.Close())
	}
	assert.Equal(t, data, content["attachments/"+a.ID+"/"+a.Name])
	md := string(content["conversation.md"])
	assert.Less(t, strings.Index(md, "BEFORE"), strings.Index(md, "![test image.png]"))
	assert.Less(t, strings.Index(md, "![test image.png]"), strings.Index(md, "AFTER"))
	assert.NotContains(t, string(content["conversation.json"]), "attachment-fixture-secret")
	path, _ := attachmentPath(1, a.ID)
	require.NoError(t, os.Remove(path))
	c, err = GetConversation(1, c.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, c.Storage.MissingCount)
	assert.Zero(t, c.Storage.AttachmentBytes)
	assert.True(t, c.Turns[0].Attachments[0].Missing)
	blob, _, err = ExportConversation(1, c.ID, "md")
	require.NoError(t, err)
	assert.Contains(t, string(blob), "附件已丢失")
}
func TestTCYAttachmentsModelCapabilitiesAndContext(t *testing.T) {
	c, a, _ := chatAttachmentFixture(t)
	record, err := readConversation(1, c.ID)
	require.NoError(t, err)
	_, err = resolveTurnAttachments(1, record, []string{a.ID}, Connection{})
	require.ErrorIs(t, err, ErrImageModel)
	_, err = resolveTurnAttachments(1, record, []string{"../../secret"}, Connection{})
	require.ErrorIs(t, err, ErrAttachmentMissing)
	images, err := resolveTurnAttachments(1, record, []string{a.ID, a.ID}, Connection{InputTypes: []string{"text", "image"}})
	require.NoError(t, err)
	assert.Len(t, images, 1)
	state := NewAgentState(context.Background(), Connection{}, RunInput{Message: "Look", ServerAttachments: images, AttachmentOwner: 1})
	encoded, err := json.Marshal(state)
	require.NoError(t, err)
	var restored AgentState
	require.NoError(t, json.Unmarshal(encoded, &restored))
	require.Len(t, restored.messages()[len(restored.messages())-1].Attachments, 1)
	assert.NotContains(t, string(encoded), "base64")
	assert.Contains(t, SystemPrompt(context.Background(), RunInput{}), "Arona")
	assert.NotContains(t, SystemPrompt(context.Background(), RunInput{Persona: "none"}), "Sensei")
	require.NoError(t, RemoveChatDraftAttachment(1, c.ID, a.ID))
	_, _, err = DownloadChatAttachment(1, c.ID, a.ID)
	require.ErrorIs(t, err, ErrAttachmentMissing)
}
func TestTCYAttachmentsFourWireProtocols(t *testing.T) {
	c, a, data := chatAttachmentFixture(t)
	_ = c
	oldAllow := config.OutgoingRequestsAllowNonRoutableIPs.GetBool()
	config.OutgoingRequestsAllowNonRoutableIPs.Set(true)
	t.Cleanup(func() { config.OutgoingRequestsAllowNonRoutableIPs.Set(oldAllow) })
	protocol := ""
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, err := io.ReadAll(r.Body)
		if !assert.NoError(t, err) {
			return
		}
		text := string(raw)
		assert.Contains(t, text, base64.StdEncoding.EncodeToString(data))
		assert.NotContains(t, text, "attachment_owner")
		assert.NotContains(t, text, `"attachments"`)
		w.Header().Set("Content-Type", "application/json")
		switch protocol {
		case "openai-chat":
			assert.Contains(t, text, `"type":"image_url"`)
			_, _ = io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"Seen"}}]}`)
		case "openai-responses":
			assert.Contains(t, text, `"type":"input_image"`)
			_, _ = io.WriteString(w, `{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"Seen"}]}]}`)
		case "anthropic":
			assert.Contains(t, text, `"media_type":"image/png"`)
			_, _ = io.WriteString(w, `{"content":[{"type":"text","text":"Seen"}],"stop_reason":"end_turn"}`)
		case "gemini":
			assert.Contains(t, text, `"mimeType":"image/png"`)
			_, _ = io.WriteString(w, `{"candidates":[{"content":{"parts":[{"text":"Seen"}]},"finishReason":"STOP"}]}`)
		}
	}))
	defer server.Close()
	pool := x509.NewCertPool()
	pool.AddCert(server.Certificate())
	original := http.DefaultTransport
	transport := original.(*http.Transport).Clone()
	transport.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = original; transport.CloseIdleConnections() })
	for _, p := range []string{"openai-chat", "openai-responses", "anthropic", "gemini"} {
		t.Run(p, func(t *testing.T) {
			protocol = p
			m, err := Chat(context.Background(), Connection{BaseURL: server.URL, Protocol: p, Model: "vision", InputTypes: []string{"text", "image"}}, []Message{{Role: "user", Content: "See", Attachments: []ChatAttachment{a}, AttachmentOwner: 1}}, nil)
			require.NoError(t, err)
			assert.Equal(t, "Seen", m.Content)
		})
	}
}

func TestTCYAttachmentsValidateAndConvertGIF(t *testing.T) {
	c, _, pngData := chatAttachmentFixture(t)
	corrupted := append([]byte{}, pngData...)
	corrupted[len(corrupted)-18] ^= 0xff
	_, err := UploadChatAttachment(1, c.ID, "broken.png", bytes.NewReader(corrupted))
	require.ErrorIs(t, err, ErrAttachmentInvalid)
	img := image.NewPaletted(image.Rect(0, 0, 2, 2), color.Palette{color.Black, color.White})
	var data bytes.Buffer
	require.NoError(t, gif.Encode(&data, img, nil))
	attachment, err := UploadChatAttachment(1, c.ID, "animation.gif", bytes.NewReader(data.Bytes()))
	require.NoError(t, err)
	messages, err := hydrateMessages(Connection{InputTypes: []string{"text", "image"}}, []Message{{Role: "user", Content: "see", Attachments: []ChatAttachment{attachment}, AttachmentOwner: 1}})
	require.NoError(t, err)
	require.Len(t, messages[0].imageData, 1)
	assert.Equal(t, "image/png", messages[0].imageData[0].MIME)
	_, original, err := DownloadChatAttachment(1, c.ID, attachment.ID)
	require.NoError(t, err)
	assert.Equal(t, data.Bytes(), original)
}
