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
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/gif"  // Register supported image decoders.
	_ "image/jpeg" // Register supported image decoders.
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	_ "golang.org/x/image/webp" // Register WebP decoding for MIME-independent validation.
)

// Attachment objects are encrypted and content-addressed within one account.
// Conversations/forks own references, never provider URLs or public file links.
const MaxChatAttachmentBytes = 32 * 1024 * 1024

var ErrAttachmentInvalid = errors.New("chatAttachmentInvalid")
var ErrAttachmentMissing = errors.New("chatAttachmentMissing")
var ErrImageModel = errors.New("chatImageModel")

type ChatAttachment struct {
	ID      string `json:"id" doc:"Account-scoped content hash. Authorization also requires a reference in this conversation."`
	Name    string `json:"name" doc:"Original display filename, never used as a server path."`
	MIME    string `json:"mime" doc:"Server-detected media type."`
	Size    int64  `json:"size" doc:"Original content bytes, excluding encryption overhead."`
	Missing bool   `json:"missing,omitempty" readOnly:"true" doc:"The referenced file is no longer available."`
}
type ConversationStorage struct {
	RecordBytes     int64 `json:"record_bytes" doc:"Encrypted conversation file bytes, including summaries and durable execution state."`
	AttachmentBytes int64 `json:"attachment_bytes" doc:"Encrypted file bytes, each distinct referenced attachment counted once."`
	TotalBytes      int64 `json:"total_bytes" doc:"Record plus existing attachments. Shared files also count in other conversations; this is not exclusive disk usage."`
	AttachmentCount int   `json:"attachment_count" doc:"Distinct attachment references, including drafts and missing files."`
	MissingCount    int   `json:"missing_count" doc:"Referenced files absent from disk."`
}

func recordOwner(record *conversationFile) int64 { return record.OwnerID }
func attachmentPath(uid int64, id string) (string, error) {
	hash, err := hex.DecodeString(id)
	if err != nil || len(hash) != sha256.Size || id != strings.ToLower(id) || uid <= 0 {
		return "", ErrAttachmentMissing
	}
	return filepath.Join(conversationDir(uid), "attachments", id+".enc"), nil
}
func allAttachments(c Conversation) []ChatAttachment {
	out := append([]ChatAttachment{}, c.DraftAttachments...)
	for _, turn := range c.Turns {
		out = append(out, turn.Attachments...)
	}
	return out
}
func attachmentIn(c Conversation, id string) (ChatAttachment, error) {
	for _, a := range allAttachments(c) {
		if a.ID == id {
			return a, nil
		}
	}
	return ChatAttachment{}, ErrAttachmentMissing
}
func decorateAttachments(uid int64, c *Conversation) {
	decorateAttachmentsWithHistory(uid, c, nil)
}

// history contributes references to storage totals without cloning its results or
// mutating saved attachment flags. File metadata is read once per distinct ID.
func decorateAttachmentsWithHistory(uid int64, c *Conversation, history []ChatTurn) {
	stats := &ConversationStorage{}
	if p, err := conversationPath(uid, c.ID); err == nil {
		if info, err := os.Stat(p); err == nil {
			stats.RecordBytes = info.Size()
		}
	}
	missing := map[string]bool{}
	check := func(a *ChatAttachment) {
		if absent, seen := missing[a.ID]; seen {
			a.Missing = absent
			return
		}
		path, err := attachmentPath(uid, a.ID)
		var size int64
		if err == nil {
			var info os.FileInfo
			info, err = os.Stat(path)
			if err == nil {
				size = info.Size()
			}
		}
		a.Missing = err != nil
		missing[a.ID] = a.Missing
		stats.AttachmentCount++
		if a.Missing {
			stats.MissingCount++
		} else {
			stats.AttachmentBytes += size
		}
	}
	for i := range c.DraftAttachments {
		check(&c.DraftAttachments[i])
	}
	for i := range c.Turns {
		for j := range c.Turns[i].Attachments {
			check(&c.Turns[i].Attachments[j])
		}
	}
	for _, turn := range history {
		for _, attachment := range turn.Attachments {
			check(&attachment)
		}
	}
	stats.TotalBytes = stats.RecordBytes + stats.AttachmentBytes
	c.Storage = stats
}
func readAttachment(uid int64, id string) ([]byte, error) {
	path, err := attachmentPath(uid, id)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrAttachmentMissing
	}
	if err != nil {
		return nil, err
	}
	a, err := aead()
	if err != nil {
		return nil, err
	}
	if len(data) < a.NonceSize() {
		return nil, ErrAttachmentMissing
	}
	return a.Open(nil, data[:a.NonceSize()], data[a.NonceSize():], []byte(fmt.Sprintf("attachment:%d:%s", uid, id)))
}
func isChatImage(mime string) bool {
	return slices.Contains([]string{"image/png", "image/jpeg", "image/gif", "image/webp"}, mime)
}
func UploadChatAttachment(uid int64, cid, name string, body io.Reader) (ChatAttachment, error) {
	data, err := io.ReadAll(io.LimitReader(body, MaxChatAttachmentBytes+1))
	if err != nil {
		return ChatAttachment{}, err
	}
	if len(data) == 0 || len(data) > MaxChatAttachmentBytes {
		return ChatAttachment{}, ErrAttachmentInvalid
	}
	mime := http.DetectContentType(data)
	if isChatImage(mime) && !validChatImage(data) {
		return ChatAttachment{}, ErrAttachmentInvalid
	}
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(cleanFilenameRune, name)
	if name == "" || name == "." || len([]rune(name)) > 255 {
		return ChatAttachment{}, ErrAttachmentInvalid
	}
	item := ChatAttachment{ID: fmt.Sprintf("%x", sha256.Sum256(data)), Name: name, MIME: mime, Size: int64(len(data))}
	conversations.Lock()
	defer conversations.Unlock()
	record, err := getConversationLocked(uid, cid)
	if err != nil {
		return ChatAttachment{}, err
	}
	if live := conversations.live[uid]; live != nil && live.id == cid {
		return ChatAttachment{}, ErrConversationBusy
	}
	existing := slices.ContainsFunc(record.DraftAttachments, func(a ChatAttachment) bool { return a.ID == item.ID })
	if !existing && len(record.DraftAttachments) >= 16 {
		return ChatAttachment{}, ErrAttachmentInvalid
	}
	path, err := attachmentPath(uid, item.ID)
	if err != nil {
		return ChatAttachment{}, err
	}
	if _, err = os.Stat(path); errors.Is(err, os.ErrNotExist) {
		a, err := aead()
		if err != nil {
			return ChatAttachment{}, err
		}
		nonce := make([]byte, a.NonceSize())
		if _, err = rand.Read(nonce); err != nil {
			return ChatAttachment{}, err
		}
		encrypted := a.Seal(nonce, nonce, data, []byte(fmt.Sprintf("attachment:%d:%s", uid, item.ID)))
		if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			return ChatAttachment{}, err
		}
		f, err := os.CreateTemp(filepath.Dir(path), ".attachment-")
		if err != nil {
			return ChatAttachment{}, err
		}
		defer os.Remove(f.Name())
		_, err = f.Write(encrypted)
		if err == nil {
			err = f.Sync()
		}
		closeErr := f.Close()
		if err != nil {
			return ChatAttachment{}, err
		}
		if closeErr != nil {
			return ChatAttachment{}, closeErr
		}
		if err = os.Rename(f.Name(), path); err != nil {
			return ChatAttachment{}, err
		}
	} else if err != nil {
		return ChatAttachment{}, err
	}
	if !existing {
		record.DraftAttachments = append(record.DraftAttachments, item)
	}
	record.Updated = time.Now().UTC()
	if err = writeConversation(uid, record); err != nil {
		cleanupAttachments(uid, []ChatAttachment{item})
		return ChatAttachment{}, err
	}
	return item, nil
}
func DownloadChatAttachment(uid int64, cid, id string) (ChatAttachment, []byte, error) {
	conversations.Lock()
	defer conversations.Unlock()
	record, err := getConversationLocked(uid, cid)
	if err != nil {
		return ChatAttachment{}, nil, err
	}
	a, err := attachmentIn(record.Conversation, id)
	if err != nil {
		return a, nil, err
	}
	data, err := readAttachment(uid, id)
	return a, data, err
}
func RemoveChatDraftAttachment(uid int64, cid, id string) error {
	conversations.Lock()
	defer conversations.Unlock()
	record, err := getConversationLocked(uid, cid)
	if err != nil {
		return err
	}
	if live := conversations.live[uid]; live != nil && live.id == cid {
		return ErrConversationBusy
	}
	index := slices.IndexFunc(record.DraftAttachments, func(a ChatAttachment) bool { return a.ID == id })
	if index < 0 {
		return ErrAttachmentMissing
	}
	old := record.DraftAttachments[index]
	record.DraftAttachments = slices.Delete(record.DraftAttachments, index, index+1)
	if err = writeConversation(uid, record); err != nil {
		return err
	}
	cleanupAttachments(uid, []ChatAttachment{old})
	return nil
}

// Fail closed on unreadable conversations: a cleanup must never delete another branch's data.
func cleanupAttachments(uid int64, candidates []ChatAttachment) {
	entries, err := os.ReadDir(conversationDir(uid))
	if err != nil {
		return
	}
	referenced := map[string]bool{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".enc") {
			continue
		}
		record, err := getConversationLocked(uid, strings.TrimSuffix(entry.Name(), ".enc"))
		if err != nil {
			return
		}
		for _, a := range allAttachments(record.Conversation) {
			referenced[a.ID] = true
		}
	}
	for _, a := range candidates {
		if !referenced[a.ID] {
			if path, err := attachmentPath(uid, a.ID); err == nil {
				_ = os.Remove(path)
			}
		}
	}
}
func resolveTurnAttachments(uid int64, record *conversationFile, ids []string, c Connection) ([]ChatAttachment, error) {
	if len(ids) > 16 {
		return nil, ErrAttachmentInvalid
	}
	out := []ChatAttachment{}
	seen := map[string]bool{}
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		a, err := attachmentIn(record.Conversation, id)
		if err != nil {
			return nil, err
		}
		if _, err = readAttachment(uid, id); err != nil {
			return nil, err
		}
		if isChatImage(a.MIME) && !slices.Contains(c.Capabilities().InputTypes, "image") {
			return nil, ErrImageModel
		}
		out = append(out, a)
	}
	return out, nil
}

type imagePayload struct{ MIME, Data string }

func (p imagePayload) dataURL() string { return "data:" + p.MIME + ";base64," + p.Data }
func hydrateMessages(c Connection, messages []Message) ([]Message, error) {
	out := append([]Message{}, messages...)
	for i := range out {
		m := &out[i]
		for _, a := range m.Attachments {
			data, err := readAttachment(m.AttachmentOwner, a.ID)
			if errors.Is(err, ErrAttachmentMissing) {
				m.Content += "\n[Attachment missing: " + a.Name + "]"
				continue
			}
			if err != nil {
				return nil, err
			}
			switch {
			case isChatImage(a.MIME):
				if !slices.Contains(c.Capabilities().InputTypes, "image") {
					return nil, ErrImageModel
				}
				mime := a.MIME
				if mime == "image/gif" {
					first, _, err := image.Decode(bytes.NewReader(data))
					if err != nil {
						return nil, err
					}
					var buffer bytes.Buffer
					if err = png.Encode(&buffer, first); err != nil {
						return nil, err
					}
					data, mime = buffer.Bytes(), "image/png"
				}
				m.imageData = append(m.imageData, imagePayload{MIME: mime, Data: base64.StdEncoding.EncodeToString(data)})
			case strings.HasPrefix(a.MIME, "text/plain") && utf8.Valid(data):
				excerpt := data
				if len(excerpt) > 64000 {
					excerpt = excerpt[:64000]
				}
				m.Content += fmt.Sprintf("\n[Untrusted file %q, %d bytes; preview up to 64000 bytes]\n%s\n[End file]", a.Name, a.Size, strings.ToValidUTF8(string(excerpt), "�"))
			default:
				m.Content += fmt.Sprintf("\n[Attached file %q (%s, %d bytes) is stored for download/export. Its contents were NOT provided to the model.]", a.Name, a.MIME, a.Size)
			}
		}
	}
	return out, nil
}
func openAIImageMessages(messages []Message) []any {
	out := make([]any, 0, len(messages))
	for _, m := range messages {
		item := map[string]any{"role": m.Role, "content": m.Content}
		if len(m.ToolCalls) > 0 {
			item["tool_calls"] = m.ToolCalls
		}
		if m.ToolCallID != "" {
			item["tool_call_id"] = m.ToolCallID
		}
		if m.ReasoningContent != "" {
			item["reasoning_content"] = m.ReasoningContent
		}
		if len(m.imageData) > 0 {
			parts := []any{map[string]any{"type": "text", "text": m.Content}}
			for _, p := range m.imageData {
				parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]any{"url": p.dataURL()}})
			}
			item["content"] = parts
		}
		out = append(out, item)
	}
	return out
}

func cleanFilenameRune(r rune) rune {
	if r < 32 || r == 127 {
		return -1
	}
	return r
}

func validChatImage(data []byte) bool {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > 50_000_000 {
		return false
	}
	_, _, err = image.Decode(bytes.NewReader(data))
	return err == nil
}
