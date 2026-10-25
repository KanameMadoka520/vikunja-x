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
	"strings"
	"testing"

	"code.vikunja.io/api/pkg/i18n"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTCYAIStream(t *testing.T) {
	for _, tc := range []struct {
		protocol, frames, text, reasoning string
		input, output                     int64
	}{
		{"anthropic", `{"type":"message_start","message":{"model":"actual-model","usage":{"input_tokens":10}}}
{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}
{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Reason"}}
{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"opaque-signed"}}
{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}
{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Answer"}}
{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}
{"type":"message_stop"}`, "Answer", "Reason", 10, 20},
		{"openai-chat", `{"model":"actual-model","choices":[{"index":0,"delta":{"reasoning_content":"Reason"}}]}
{"choices":[{"index":0,"delta":{"content":"Answer"},"finish_reason":"stop"}]}
{"usage":{"prompt_tokens":10,"completion_tokens":20,"completion_tokens_details":{"reasoning_tokens":5}},"choices":[]}
[DONE]`, "Answer", "Reason", 10, 20},
		{"gemini", `{"modelVersion":"actual-model","candidates":[{"content":{"parts":[{"text":"Reason","thought":true}]}}]}
{"candidates":[{"content":{"parts":[{"text":"Answer","thoughtSignature":"opaque-signed"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":15,"thoughtsTokenCount":5}}`, "Answer", "Reason", 10, 20},
		{"openai-responses", `{"type":"response.reasoning_summary_text.delta","delta":"Reason"}
{"type":"response.output_text.delta","delta":"Answer"}
{"type":"response.completed","response":{"model":"actual-model","status":"completed","usage":{"input_tokens":10,"output_tokens":20},"output":[{"type":"reasoning","encrypted_content":"opaque-signed","summary":[{"text":"Reason"}]},{"type":"message","content":[{"type":"output_text","text":"Answer"}]}]}}`, "Answer", "Reason", 10, 20},
	} {
		t.Run(tc.protocol, func(t *testing.T) {
			_, o := withObservation(context.Background(), 1, "requested", nil)
			frames := ""
			for _, line := range strings.Split(tc.frames, "\n") {
				frames += "data: " + line + "\n\n"
			}
			raw, err := readStream(strings.NewReader(frames), tc.protocol, o)
			require.NoError(t, err)
			captureResponse(o, tc.protocol, raw)
			assert.Equal(t, tc.text, o.step.Text)
			assert.Equal(t, tc.reasoning, o.step.Reasoning)
			assert.Equal(t, "actual-model", o.step.Model)
			assert.Equal(t, tc.input, o.step.Usage.Input)
			assert.Equal(t, tc.output, o.step.Usage.Output)
			require.NotNil(t, o.step.FirstTokenMS)
			require.NotNil(t, o.step.FirstTextMS)
			assert.GreaterOrEqual(t, *o.step.FirstTextMS, *o.step.FirstTokenMS)
			if tc.protocol != "openai-chat" {
				assert.Contains(t, string(raw), "opaque-signed")
			}
		})
	}
	t.Run("tool-fragments", func(t *testing.T) {
		_, o := withObservation(context.Background(), 1, "model", nil)
		stream := `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call","function":{"name":"get_task","arguments":"{\"id\":"}}]}}]}

data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]},"finish_reason":"tool_calls"}]}

`
		raw, err := readStream(strings.NewReader(stream), "openai-chat", o)
		require.NoError(t, err)
		var body struct {
			Choices []struct {
				Message Message `json:"message"`
			} `json:"choices"`
		}
		require.NoError(t, json.Unmarshal(raw, &body))
		require.Len(t, body.Choices[0].Message.ToolCalls, 1)
		assert.Equal(t, `{"id":1}`, body.Choices[0].Message.ToolCalls[0].Function.Arguments)
		assert.Nil(t, o.step.FirstTextMS)
	})
	for _, frames := range []string{`data: {"type":"content_block_stop","index":200}` + "\n\n", `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"incomplete"}}` + "\n\n", "data: {bad-json}\n\n"} {
		_, o := withObservation(context.Background(), 1, "model", nil)
		_, err := readStream(strings.NewReader(frames), "anthropic", o)
		require.Error(t, err)
	}
	_, o := withObservation(context.Background(), 1, "model", nil)
	captureResponse(o, "openai-chat", []byte(`{"choices":[{"message":{"content":"fallback"}}]}`))
	assert.Nil(t, o.step.FirstTextMS)
	assert.False(t, o.step.Usage.Reported)
	assert.Equal(t, "model", o.step.Model)
}
func TestTCYAIToolSchemas(t *testing.T) {
	i18n.Init()
	for _, tool := range Tools("write", true) {
		schema := tool["function"].(map[string]any)["parameters"].(map[string]any)
		required, ok := schema["required"].([]string)
		assert.True(t, ok)
		assert.NotNil(t, required)
	}
	assert.NotContains(t, upstreamError(400, strings.NewReader(`{"error":{"message":"invalid secret-key schema"}}`), "secret-key").Error(), "secret-key")
}
