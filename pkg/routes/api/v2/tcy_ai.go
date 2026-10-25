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
package apiv2

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"code.vikunja.io/api/pkg/modules/humabridge"
	"code.vikunja.io/api/pkg/modules/tcyai"
	"code.vikunja.io/api/pkg/user"
	"github.com/danielgtaylor/huma/v2"
)

func init() { AddRouteRegistrar(RegisterTCYAIRoutes) }

type aiSettingsResponse struct {
	CacheControl string `header:"Cache-Control"`
	Body         tcyai.Settings
}
type aiTextResponse struct {
	Body struct {
		Text     string `json:"text" doc:"Processed text."`
		Original string `json:"original" doc:"Original transcription, before optional cleanup."`
		Warning  string `json:"warning" doc:"Non-fatal cleanup failure, if any."`
	}
}

// Only authenticated human sessions can use saved provider credentials.
func aiUser(ctx context.Context) (int64, error) {
	ec := humabridge.EchoContextFrom(ctx)
	if ec == nil || (*ec).Get("api_token") != nil {
		return 0, huma.Error403Forbidden("AI 设置和调用需要用户登录会话")
	}
	a, err := authFromCtx(ctx)
	if err != nil {
		return 0, err
	}
	u, err := user.GetFromAuth(a)
	if err != nil {
		return 0, translateDomainError(err)
	}
	return u.ID, nil
}

func aiError(err error) error { return huma.Error400BadRequest(err.Error()) }

func RegisterTCYAIRoutes(api huma.API) {
	op := func(id, method, path, description string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: description, Description: description + "。仅供当前登录用户使用，不向 MCP 暴露。", Tags: []string{"tcymc-ai"}, DefaultStatus: http.StatusOK, MaxBodyBytes: 24 * 1024 * 1024, BodyReadTimeout: 30 * time.Second}
	}
	Register(api, op("tcy-ai-settings", "GET", "/ai/settings", "读取脱敏的个人模型连接与功能分配"), func(ctx context.Context, _ *struct{}) (*aiSettingsResponse, error) {
		uid, err := aiUser(ctx)
		if err != nil {
			return nil, err
		}
		s, err := tcyai.Load(uid)
		if err != nil {
			return nil, aiError(err)
		}
		return &aiSettingsResponse{CacheControl: "no-store", Body: tcyai.Redact(s)}, nil
	})
	Register(api, op("tcy-ai-save-settings", "POST", "/ai/settings", "保存个人模型连接，密钥加密存储且不返回"), func(ctx context.Context, in *struct{ Body tcyai.Settings }) (*aiSettingsResponse, error) {
		uid, err := aiUser(ctx)
		if err != nil {
			return nil, err
		}
		s, err := tcyai.Save(uid, in.Body)
		if err != nil {
			return nil, aiError(err)
		}
		return &aiSettingsResponse{CacheControl: "no-store", Body: s}, nil
	})
	Register(api, op("tcy-ai-test", "POST", "/ai/test", "测试已保存模型的文字响应或语音转写能力"), func(ctx context.Context, in *struct {
		Body struct {
			ConnectionID string `json:"connection_id"`
			Audio        string `json:"audio"`
			Filename     string `json:"filename"`
		}
	}) (*aiTextResponse, error) {
		uid, err := aiUser(ctx)
		if err != nil {
			return nil, err
		}
		s, err := tcyai.Load(uid)
		if err != nil {
			return nil, aiError(err)
		}
		for _, c := range s.Connections {
			if c.ID == in.Body.ConnectionID {
				out := &aiTextResponse{}
				if c.Kind == "chat" {
					m, e := tcyai.Chat(ctx, c, []tcyai.Message{{Role: "user", Content: "请仅回复：连接成功"}}, nil)
					out.Body.Text = m.Content
					err = e
				} else {
					data, e := decodeAIAudio(in.Body.Audio)
					if e != nil {
						return nil, aiError(e)
					}
					out.Body.Text, err = tcyai.Transcribe(ctx, c, in.Body.Filename, data)
				}
				if err != nil {
					return nil, aiError(err)
				}
				return out, nil
			}
		}
		return nil, huma.Error404NotFound("模型连接不存在")
	})
	Register(api, op("tcy-ai-transcribe", "POST", "/ai/transcribe", "识别上传音频，可选使用独立模型整理文字"), func(ctx context.Context, in *struct {
		Body struct {
			Audio    string `json:"audio"`
			Filename string `json:"filename"`
			Cleanup  bool   `json:"cleanup"`
		}
	}) (*aiTextResponse, error) {
		uid, err := aiUser(ctx)
		if err != nil {
			return nil, err
		}
		s, err := tcyai.Load(uid)
		if err != nil {
			return nil, aiError(err)
		}
		c, err := s.Find(s.Transcription, "transcription")
		if err != nil {
			return nil, aiError(err)
		}
		data, err := decodeAIAudio(in.Body.Audio)
		if err != nil {
			return nil, aiError(err)
		}
		text, err := tcyai.Transcribe(ctx, c, in.Body.Filename, data)
		if err != nil {
			return nil, aiError(err)
		}
		out := &aiTextResponse{}
		out.Body.Text = text
		out.Body.Original = text
		if in.Body.Cleanup && s.Cleanup != "" {
			c, err = s.Find(s.Cleanup, "chat")
			if err == nil {
				out.Body.Text, err = tcyai.Cleanup(ctx, c, text)
			}
			if err != nil {
				out.Body.Text = text
				out.Body.Warning = "文字整理失败，已保留识别原文：" + err.Error()
			}
		}
		return out, nil
	})
	Register(api, op("tcy-ai-cleanup", "POST", "/ai/cleanup", "使用文字整理模型保留原意地整理口语记录"), func(ctx context.Context, in *struct {
		Body struct {
			Text string `json:"text" minLength:"1" maxLength:"12000"`
		}
	}) (*aiTextResponse, error) {
		uid, err := aiUser(ctx)
		if err != nil {
			return nil, err
		}
		s, err := tcyai.Load(uid)
		if err != nil {
			return nil, aiError(err)
		}
		c, err := s.Find(s.Cleanup, "chat")
		if err != nil {
			return nil, aiError(err)
		}
		text, err := tcyai.Cleanup(ctx, c, in.Body.Text)
		if err != nil {
			return nil, aiError(err)
		}
		out := &aiTextResponse{}
		out.Body.Text = text
		out.Body.Original = in.Body.Text
		return out, nil
	})
	Register(api, op("tcy-ai-run", "POST", "/ai/run", "运行具有明确读写模式的任务助手，返回实际工具调用记录"), func(ctx context.Context, in *struct{ Body tcyai.RunInput }) (*singleBody[tcyai.RunResult], error) {
		uid, err := aiUser(ctx)
		if err != nil {
			return nil, err
		}
		return runAI(ctx, api, uid, in.Body)
	})
}

func decodeAIAudio(encoded string) ([]byte, error) {
	if len(encoded) > 22*1024*1024 {
		return nil, errors.New("音频不能超过 16 MiB")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 || len(data) > 16*1024*1024 {
		return nil, errors.New("请提供不超过 16 MiB 的有效音频")
	}
	return data, nil
}

type aiRunCacheEntry struct {
	hash   [32]byte
	result tcyai.RunResult
	ready  bool
	at     time.Time
}

var aiRuns = struct {
	sync.Mutex
	entries map[string]aiRunCacheEntry
	busy    map[int64]bool
}{entries: map[string]aiRunCacheEntry{}, busy: map[int64]bool{}}

func runAI(ctx context.Context, api huma.API, uid int64, in tcyai.RunInput) (*singleBody[tcyai.RunResult], error) {
	key := fmt.Sprintf("%d:%s", uid, in.RequestID)
	raw, err := json.Marshal(in)
	if err != nil {
		return nil, aiError(err)
	}
	hash := sha256.Sum256(raw)
	aiRuns.Lock()
	for k, v := range aiRuns.entries {
		if v.ready && time.Since(v.at) > 10*time.Minute {
			delete(aiRuns.entries, k)
		}
	}
	if v, ok := aiRuns.entries[key]; ok {
		aiRuns.Unlock()
		if v.hash != hash {
			return nil, huma.Error409Conflict("同一请求 ID 不能用于不同指令")
		}
		if !v.ready {
			return nil, huma.Error409Conflict("该请求仍在执行")
		}
		return &singleBody[tcyai.RunResult]{Body: &v.result}, nil
	}
	if aiRuns.busy[uid] || len(aiRuns.entries) >= 256 {
		aiRuns.Unlock()
		return nil, huma.Error429TooManyRequests("已有任务执行中，请稍后重试")
	}
	aiRuns.busy[uid] = true
	aiRuns.entries[key] = aiRunCacheEntry{hash: hash, at: time.Now()}
	aiRuns.Unlock()
	result := tcyai.RunResult{Actions: []tcyai.Action{}}
	defer func() {
		aiRuns.Lock()
		delete(aiRuns.busy, uid)
		aiRuns.entries[key] = aiRunCacheEntry{hash: hash, result: result, ready: true, at: time.Now()}
		aiRuns.Unlock()
	}()
	s, err := tcyai.Load(uid)
	if err != nil {
		result.Reply = err.Error()
		return &singleBody[tcyai.RunResult]{Body: &result}, nil
	}
	c, err := s.Find(s.Assistant, "chat")
	if err != nil {
		result.Reply = err.Error()
		return &singleBody[tcyai.RunResult]{Body: &result}, nil
	}
	ec := humabridge.EchoContextFrom(ctx)
	caller := (*ec).Request().Clone(ctx)
	ctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	result, err = tcyai.Run(ctx, c, in, func(ctx context.Context, name string, args json.RawMessage) (string, error) {
		return dispatchAI(ctx, api, caller, name, args)
	})
	if err != nil {
		result.Reply = "执行已停止：" + err.Error() + "。已完成的操作见下方记录。"
	}
	return &singleBody[tcyai.RunResult]{Body: &result}, nil
}

func dispatchAI(ctx context.Context, api huma.API, caller *http.Request, name string, raw json.RawMessage) (string, error) {
	var args map[string]json.RawMessage
	if err := json.Unmarshal(raw, &args); err != nil {
		return "", errors.New("工具参数必须是 JSON 对象")
	}
	id := func(key string) (int64, error) {
		var n int64
		if err := json.Unmarshal(args[key], &n); err != nil || n < 1 {
			return 0, fmt.Errorf("%s 必须是有效 ID", key)
		}
		delete(args, key)
		return n, nil
	}
	path, method := "", "GET"
	query := url.Values{}
	switch name {
	case "list_projects", "list_tasks":
		path = "/projects"
		if name == "list_tasks" {
			path = "/tasks"
		}
		if _, ok := args["project_id"]; ok && name == "list_tasks" {
			n, e := id("project_id")
			if e != nil {
				return "", e
			}
			path = fmt.Sprintf("/projects/%d/tasks", n)
		}
		if e := aiQuery(args, query); e != nil {
			return "", e
		}
		args = nil
	case "get_task", "update_task", "delete_task":
		n, e := id("id")
		if e != nil {
			return "", e
		}
		path = fmt.Sprintf("/tasks/%d", n)
		if name == "update_task" {
			method = "PATCH"
		}
		if name == "delete_task" {
			method = "DELETE"
		}
		if method != "PATCH" && len(args) > 0 {
			return "", errors.New("未知工具参数")
		}
	case "create_task":
		n, e := id("project_id")
		if e != nil {
			return "", e
		}
		path = fmt.Sprintf("/projects/%d/tasks", n)
		method = "POST"
	case "create_project":
		path = "/projects"
		method = "POST"
	default:
		return "", errors.New("不支持的工具")
	}
	if method == "PATCH" || method == "POST" {
		allowed := map[string]bool{"title": true, "description": true, "due_date": true, "start_date": true, "end_date": true, "priority": true, "done": true}
		for k := range args {
			if !allowed[k] {
				return "", fmt.Errorf("不允许修改字段 %s", k)
			}
		}
	}
	body, err := json.Marshal(args)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, method, GroupPrefix+path+"?"+query.Encode(), bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", caller.Header.Get("Authorization"))
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if method == "PATCH" {
		req.Header.Set("Content-Type", "application/merge-patch+json")
	}
	req.Host = caller.Host
	req.RemoteAddr = caller.RemoteAddr
	req.TLS = caller.TLS
	for _, h := range []string{"X-Forwarded-For", "X-Real-IP", "X-Forwarded-Host", "User-Agent"} {
		req.Header.Set(h, caller.Header.Get(h))
	}
	rec := httptest.NewRecorder()
	api.Adapter().ServeHTTP(rec, req)
	data := strings.TrimSpace(rec.Body.String())
	if len(data) > 64000 {
		data = data[:64000] + " [结果过长，请缩小查询范围]"
	}
	if rec.Code >= 300 {
		return "", fmt.Errorf("操作失败 HTTP %d: %s", rec.Code, data)
	}
	if data == "" {
		data = `{"success":true}`
	}
	return data, nil
}

func aiQuery(args map[string]json.RawMessage, query url.Values) error {
	for k, v := range args {
		switch k {
		case "query", "filter":
			var text string
			if e := json.Unmarshal(v, &text); e != nil {
				return e
			}
			if k == "query" {
				k = "q"
			}
			query.Set(k, text)
		case "page":
			var n int
			if e := json.Unmarshal(v, &n); e != nil || n < 1 {
				return errors.New("页码无效")
			}
			query.Set(k, strconv.Itoa(n))
		default:
			return errors.New("未知查询字段")
		}
	}
	query.Set("per_page", "25")
	return nil
}
