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

//nolint:gosmopolitan // This fork intentionally provides Chinese prompts and user-facing messages.
package tcyai

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"code.vikunja.io/api/pkg/config"
)

type Connection struct {
	ID      string `json:"id" minLength:"1" maxLength:"80" doc:"Stable connection identifier."`
	Name    string `json:"name" minLength:"1" maxLength:"100" doc:"Display name."`
	BaseURL string `json:"base_url" doc:"OpenAI-compatible API base, including /v1 when required."`
	Model   string `json:"model" minLength:"1" maxLength:"150" doc:"Provider model identifier."`
	Kind    string `json:"kind" enum:"chat,transcription" doc:"chat uses chat/completions; transcription uses audio/transcriptions."`
	APIKey  string `json:"api_key,omitempty" writeOnly:"true" doc:"Write-only key. Empty preserves the saved key when the endpoint is unchanged."`
	HasKey  bool   `json:"has_key" readOnly:"true" doc:"Whether a key is saved; the key itself is never returned."`
}

type Settings struct {
	Connections   []Connection `json:"connections" maxItems:"20" doc:"Connections owned by the current user."`
	Assistant     string       `json:"assistant" doc:"Connection used by the task agent."`
	Transcription string       `json:"transcription" doc:"Connection used for speech recognition."`
	Cleanup       string       `json:"cleanup" doc:"Optional chat connection for cleaning up transcripts. Empty disables cleanup."`
}

var settingsLock sync.Mutex

func fileFor(uid int64) string {
	return filepath.Join(config.FilesBasePath.GetString(), ".tcymc-ai", fmt.Sprintf("%d.enc", uid))
}

func aead() (cipher.AEAD, error) {
	key := sha256.Sum256([]byte("tcymc-ai-settings-v1:" + config.ServiceSecret.GetString()))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func read(uid int64) (s Settings, err error) {
	s.Connections = []Connection{}
	data, err := os.ReadFile(fileFor(uid))
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	a, err := aead()
	if err != nil {
		return s, err
	}
	if len(data) < a.NonceSize() {
		return s, errors.New("invalid encrypted AI settings")
	}
	plain, err := a.Open(nil, data[:a.NonceSize()], data[a.NonceSize():], []byte(fmt.Sprint(uid)))
	if err != nil {
		return s, errors.New("cannot decrypt AI settings; check service secret")
	}
	err = json.Unmarshal(plain, &s)
	return s, err
}

func Load(uid int64) (Settings, error) {
	settingsLock.Lock()
	defer settingsLock.Unlock()
	return read(uid)
}

func Redact(s Settings) Settings {
	s.Connections = append([]Connection{}, s.Connections...)
	for i := range s.Connections {
		s.Connections[i].HasKey = s.Connections[i].APIKey != ""
		s.Connections[i].APIKey = ""
	}
	return s
}

func (s Settings) Find(id, kind string) (Connection, error) {
	for _, c := range s.Connections {
		if c.ID == id && c.Kind == kind {
			return c, nil
		}
	}
	return Connection{}, errors.New("请先在 AI 与语音设置中选择对应模型")
}

func Save(uid int64, s Settings) (Settings, error) {
	settingsLock.Lock()
	defer settingsLock.Unlock()
	old, err := read(uid)
	if err != nil {
		return s, err
	}
	if len(s.Connections) > 20 {
		return s, errors.New("最多保存 20 个模型连接")
	}
	ids := map[string]bool{}
	for i := range s.Connections {
		c := &s.Connections[i]
		if err := validateConnection(c, ids); err != nil {
			return s, err
		}
		if c.APIKey == "" {
			for _, prev := range old.Connections {
				if prev.ID == c.ID {
					if prev.BaseURL != c.BaseURL && prev.APIKey != "" {
						return s, errors.New("更换 API 地址时请重新填写密钥")
					}
					c.APIKey = prev.APIKey
				}
			}
		}
		c.HasKey = false
	}
	for _, role := range []struct{ id, kind string }{{s.Assistant, "chat"}, {s.Cleanup, "chat"}, {s.Transcription, "transcription"}} {
		if role.id != "" {
			if _, e := s.Find(role.id, role.kind); e != nil {
				return s, e
			}
		}
	}
	plain, err := json.Marshal(s)
	if err != nil {
		return s, err
	}
	a, err := aead()
	if err != nil {
		return s, err
	}
	nonce := make([]byte, a.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return s, err
	}
	data := a.Seal(nonce, nonce, plain, []byte(fmt.Sprint(uid)))
	path := fileFor(uid)
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return s, err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".settings-*")
	if err != nil {
		return s, err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(data); err != nil {
		_ = f.Close()
		return s, err
	}
	if err = f.Close(); err != nil {
		return s, err
	}
	if err = os.Rename(f.Name(), path); err != nil {
		return s, err
	}
	return Redact(s), nil
}

func validateConnection(c *Connection, ids map[string]bool) error {
	c.BaseURL = strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	u, e := url.Parse(c.BaseURL)
	if e != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Scheme != "https" {
		return errors.New("模型 API 地址必须是 HTTPS 基础地址，不能包含密码、查询参数或片段")
	}
	if c.ID == "" || ids[c.ID] || c.Name == "" || c.Model == "" || (c.Kind != "chat" && c.Kind != "transcription") {
		return errors.New("连接名称、模型和类型不能为空，连接 ID 不能重复")
	}
	ids[c.ID] = true
	return nil
}
