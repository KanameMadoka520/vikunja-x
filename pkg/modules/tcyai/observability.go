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
	"time"
)

type Usage struct {
	Partial           bool  `json:"partial" doc:"Some model rounds did not report usage; totals cover only reported rounds."`
	Input             int64 `json:"input" doc:"Provider-reported input tokens, including cache tokens when reported separately."`
	Output            int64 `json:"output" doc:"Provider-reported output tokens; may include reasoning tokens."`
	Cached            int64 `json:"cached" doc:"Cache-hit tokens, a subset of input tokens."`
	Reasoning         int64 `json:"reasoning" doc:"Reasoning tokens, a subset of output tokens when provided."`
	Reported          bool  `json:"reported" doc:"False means the provider supplied no usage counts."`
	CacheReported     bool  `json:"cache_reported" doc:"Whether the provider supplied cache-hit token counts."`
	ReasoningReported bool  `json:"reasoning_reported" doc:"Whether the provider supplied reasoning token counts."`
}

func (u *Usage) Add(v Usage) {
	u.Input += v.Input
	u.Output += v.Output
	u.Cached += v.Cached
	u.Reasoning += v.Reasoning
	u.Partial = u.Partial || v.Partial || !v.Reported
	u.Reported = u.Reported || v.Reported
	u.CacheReported = u.CacheReported || v.CacheReported
	u.ReasoningReported = u.ReasoningReported || v.ReasoningReported
}

type ModelStep struct {
	Started            time.Time  `json:"started" doc:"Upstream request start time, for live elapsed time."`
	RequestedStreaming bool       `json:"requested_streaming" doc:"Whether streaming was explicitly requested from this provider."`
	Streaming          bool       `json:"streaming" doc:"Whether the provider actually responded with an event stream."`
	OutputCharacters   int        `json:"output_characters" doc:"Observed text and visible reasoning characters, not a token estimate."`
	ToolCalls          []ToolCall `json:"tool_calls,omitempty" doc:"Provider tool-call drafts; never executable until the model round completes and validation succeeds."`
	HTTPStatus         int        `json:"http_status" doc:"Actual upstream HTTP status, or zero when no response arrived."`
	RequestID          string     `json:"request_id" doc:"Provider response request ID when supplied; no request headers or credentials."`
	Round              int        `json:"round" doc:"One-based model round, including rounds that request tools."`
	Model              string     `json:"model" doc:"Model name returned by the provider, falling back to the requested ID."`
	Text               string     `json:"text" doc:"Model text, distinct from its reasoning and actual tool execution."`
	Reasoning          string     `json:"reasoning" doc:"Only reasoning or reasoning summaries explicitly returned by the provider."`
	Usage              Usage      `json:"usage" doc:"Provider-reported usage for this model round."`
	DurationMS         int64      `json:"duration_ms" doc:"Elapsed wall-clock milliseconds."`
	FirstTokenMS       *int64     `json:"first_token_ms" doc:"Time from upstream request start to first streamed text or reasoning delta; absent without streaming evidence."`
	FirstTextMS        *int64     `json:"first_text_ms" doc:"Time to first streamed visible answer text; absent if the provider did not stream text."`
}

type observerKey struct{}
type observation struct {
	lastNotify time.Time
	step       ModelStep
	start      time.Time
	notify     func(ModelStep)
}

func withObservation(ctx context.Context, round int, model string, notify func(ModelStep)) (context.Context, *observation) {
	o := &observation{step: ModelStep{Round: round, Model: model, Started: time.Now().UTC()}, start: time.Now(), notify: notify}
	return context.WithValue(ctx, observerKey{}, o), o
}
func observe(ctx context.Context) *observation {
	o, _ := ctx.Value(observerKey{}).(*observation)
	return o
}
func (o *observation) delta(text, reasoning string) {
	if text == "" && reasoning == "" {
		return
	}
	elapsed := time.Since(o.start).Milliseconds()
	if o.step.FirstTokenMS == nil {
		o.step.FirstTokenMS = &elapsed
	}
	if text != "" && o.step.FirstTextMS == nil {
		first := elapsed
		o.step.FirstTextMS = &first
	}
	o.step.Text += text
	o.step.Reasoning += reasoning
	o.step.DurationMS = elapsed
	o.publish()
}
func (o *observation) publish() {
	o.step.OutputCharacters = len([]rune(o.step.Text)) + len([]rune(o.step.Reasoning))
	o.step.DurationMS = time.Since(o.start).Milliseconds()
	if o.notify != nil && time.Since(o.lastNotify) >= 60*time.Millisecond {
		o.lastNotify = time.Now()
		o.notify(o.step)
	}
}

func number(m map[string]any, key string) int64          { n, _ := m[key].(float64); return int64(n) }
func object(m map[string]any, key string) map[string]any { v, _ := m[key].(map[string]any); return v }
func textValue(m map[string]any, key string) string      { v, _ := m[key].(string); return v }
func list(m map[string]any, key string) []any            { v, _ := m[key].([]any); return v }

func providerUsage(protocol string, raw []byte) (Usage, string) {
	var r map[string]any
	if json.Unmarshal(raw, &r) != nil {
		return Usage{}, ""
	}
	u := object(r, "usage")
	result := Usage{Reported: len(u) > 0}
	switch protocol {
	case "anthropic":
		result.Input = number(u, "input_tokens") + number(u, "cache_read_input_tokens") + number(u, "cache_creation_input_tokens")
		result.Output = number(u, "output_tokens")
		result.Cached = number(u, "cache_read_input_tokens")
		_, result.CacheReported = u["cache_read_input_tokens"]
	case "gemini":
		u = object(r, "usageMetadata")
		result.Reported = len(u) > 0
		result.Input = number(u, "promptTokenCount")
		result.Output = number(u, "candidatesTokenCount") + number(u, "thoughtsTokenCount")
		result.Reasoning = number(u, "thoughtsTokenCount")
		result.Cached = number(u, "cachedContentTokenCount")
		_, result.CacheReported = u["cachedContentTokenCount"]
		_, result.ReasoningReported = u["thoughtsTokenCount"]
	default:
		result.Input = number(u, "input_tokens") + number(u, "prompt_tokens")
		result.Output = number(u, "output_tokens") + number(u, "completion_tokens")
		details := object(u, "input_tokens_details")
		if len(details) == 0 {
			details = object(u, "prompt_tokens_details")
		}
		result.Cached = number(details, "cached_tokens")
		_, result.CacheReported = details["cached_tokens"]
		details = object(u, "output_tokens_details")
		if len(details) == 0 {
			details = object(u, "completion_tokens_details")
		}
		result.Reasoning = number(details, "reasoning_tokens")
		_, result.ReasoningReported = details["reasoning_tokens"]
	}
	model := textValue(r, "model")
	if model == "" {
		model = textValue(r, "modelVersion")
	}
	return result, model
}

func asObject(value any) map[string]any {
	v, _ := value.(map[string]any)
	if v == nil {
		return map[string]any{}
	}
	return v
}
