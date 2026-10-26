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
	"bufio"
	"encoding/json"
	"io"
	"sort"
	"strings"

	"code.vikunja.io/api/pkg/modules/tcylocale"
)

// Reassemble native responses so signed reasoning and tool calls still round-trip unchanged.
//
//nolint:gocyclo // Explicit protocol event switches preserve native signed tool context.
func readStream(reader io.Reader, protocol string, o *observation) ([]byte, error) {
	scanner := bufio.NewScanner(io.LimitReader(reader, 8*1024*1024+1))
	scanner.Buffer(make([]byte, 4096), 2*1024*1024)
	response := map[string]any{}
	blocks := []any{}
	tools := map[int]map[string]any{}
	arguments := map[int]string{}
	text, reasoning := "", ""
	event, data := "", ""
	terminal := false
	emit := func() error {
		if data == "" {
			return nil
		}
		if strings.TrimSpace(data) == "[DONE]" {
			terminal = true
			return nil
		}
		var frame map[string]any
		if err := json.Unmarshal([]byte(data), &frame); err != nil {
			return err
		}
		if object(frame, "error") != nil || event == "error" {
			return tcylocale.Error("chatStreamInterrupted")
		}
		switch protocol {
		case "anthropic":
			switch textValue(frame, "type") {
			case "message_start":
				response = asObject(frame["message"])
			case "content_block_start":
				index := int(number(frame, "index"))
				if index < 0 || index > 128 {
					return tcylocale.Error("chatStreamInvalid")
				}
				for len(blocks) <= index {
					blocks = append(blocks, map[string]any{})
				}
				blocks[index] = asObject(frame["content_block"])
				block := asObject(blocks[index])
				o.delta(textValue(block, "text"), textValue(block, "thinking"))
			case "content_block_delta":
				index := int(number(frame, "index"))
				if index < 0 || index > 128 {
					return tcylocale.Error("chatStreamInvalid")
				}
				if index >= len(blocks) {
					return tcylocale.Error("chatStreamInvalid")
				}
				block := asObject(blocks[index])
				delta := object(frame, "delta")
				switch textValue(delta, "type") {
				case "text_delta":
					v := textValue(delta, "text")
					block["text"] = textValue(block, "text") + v
					o.delta(v, "")
				case "thinking_delta":
					v := textValue(delta, "thinking")
					block["thinking"] = textValue(block, "thinking") + v
					o.delta("", v)
				case "signature_delta":
					block["signature"] = textValue(block, "signature") + textValue(delta, "signature")
				case "input_json_delta":
					arguments[index] += textValue(delta, "partial_json")
				}
			case "content_block_stop":
				index := int(number(frame, "index"))
				if index < 0 || index > 128 {
					return tcylocale.Error("chatStreamInvalid")
				}
				if index >= len(blocks) {
					return tcylocale.Error("chatStreamInvalid")
				}
				if args := arguments[index]; args != "" {
					var input any
					if err := json.Unmarshal([]byte(args), &input); err != nil {
						return err
					}
					asObject(blocks[index])["input"] = input
				}
			case "message_delta":
				for k, v := range object(frame, "delta") {
					response[k] = v
				}
				usage := object(response, "usage")
				if usage == nil {
					usage = map[string]any{}
				}
				for k, v := range object(frame, "usage") {
					usage[k] = v
				}
				response["usage"] = usage
			case "message_stop":
				terminal = true
			}
		case "openai-responses":
			switch textValue(frame, "type") {
			case "response.output_item.added", "response.output_item.done":
				item := object(frame, "item")
				if textValue(item, "type") == "function_call" {
					tools[int(number(frame, "output_index"))] = map[string]any{"id": textValue(item, "call_id"), "type": "function", "function": map[string]any{"name": textValue(item, "name"), "arguments": textValue(item, "arguments")}}
				}
			case "response.function_call_arguments.delta":
				fn := object(tools[int(number(frame, "output_index"))], "function")
				if fn != nil {
					fn["arguments"] = textValue(fn, "arguments") + textValue(frame, "delta")
				}
			case "response.output_text.delta":
				o.delta(textValue(frame, "delta"), "")
			case "response.reasoning_text.delta", "response.reasoning_summary_text.delta":
				o.delta("", textValue(frame, "delta"))
			case "response.completed", "response.incomplete", "response.failed":
				response = asObject(frame["response"])
				terminal = true
			}
		case "gemini":
			if usage := object(frame, "usageMetadata"); usage != nil {
				response["usageMetadata"] = usage
			}
			if model := textValue(frame, "modelVersion"); model != "" {
				response["modelVersion"] = model
			}
			candidates := list(frame, "candidates")
			if len(candidates) > 0 {
				candidate := asObject(candidates[0])
				for _, part := range list(object(candidate, "content"), "parts") {
					block := asObject(part)
					blocks = append(blocks, block)
					if block["thought"] == true {
						o.delta("", textValue(block, "text"))
					} else {
						o.delta(textValue(block, "text"), "")
					}
				}
				if finish := textValue(candidate, "finishReason"); finish != "" {
					response["finishReason"] = finish
					terminal = true
				}
			}
		default:
			if usage := object(frame, "usage"); usage != nil {
				response["usage"] = usage
			}
			if model := textValue(frame, "model"); model != "" {
				response["model"] = model
			}
			for _, item := range list(frame, "choices") {
				choice := asObject(item)
				if number(choice, "index") != 0 {
					continue
				}
				delta := object(choice, "delta")
				t, r := textValue(delta, "content"), textValue(delta, "reasoning_content")
				if r == "" {
					r = textValue(delta, "reasoning")
				}
				text += t
				reasoning += r
				o.delta(t, r)
				for _, value := range list(delta, "tool_calls") {
					call := asObject(value)
					index := int(number(call, "index"))
					if index < 0 || index > 128 {
						return tcylocale.Error("chatStreamInvalid")
					}
					tool := tools[index]
					if tool == nil {
						tool = map[string]any{"id": "", "type": "function", "function": map[string]any{"name": "", "arguments": ""}}
						tools[index] = tool
					}
					if id := textValue(call, "id"); id != "" {
						tool["id"] = id
					}
					fn := object(tool, "function")
					fragment := object(call, "function")
					fn["name"] = textValue(fn, "name") + textValue(fragment, "name")
					fn["arguments"] = textValue(fn, "arguments") + textValue(fragment, "arguments")
				}
				if choice["finish_reason"] != nil {
					response["finish_reason"] = choice["finish_reason"]
					terminal = true
				}
			}
		}
		draft := []ToolCall{}
		switch protocol {
		case "anthropic":
			for i, b := range blocks {
				m := asObject(b)
				if textValue(m, "type") == "tool_use" {
					args := arguments[i]
					if args == "" {
						raw, encodeErr := json.Marshal(m["input"])
						if encodeErr != nil {
							return encodeErr
						}
						args = string(raw)
					}
					draft = append(draft, ToolCall{ID: textValue(m, "id"), Type: "function", Function: FunctionCall{Name: textValue(m, "name"), Arguments: args}})
				}
			}
		case "gemini":
			for _, b := range blocks {
				if call := object(asObject(b), "functionCall"); call != nil {
					raw, encodeErr := json.Marshal(call["args"])
					if encodeErr != nil {
						return encodeErr
					}
					draft = append(draft, ToolCall{ID: textValue(call, "id"), Type: "function", Function: FunctionCall{Name: textValue(call, "name"), Arguments: string(raw)}})
				}
			}
		default:
			for _, t := range tools {
				raw, encodeErr := json.Marshal(t)
				if encodeErr != nil {
					return encodeErr
				}
				var call ToolCall
				if encodeErr = json.Unmarshal(raw, &call); encodeErr != nil {
					return encodeErr
				}
				draft = append(draft, call)
			}
		}
		if len(draft) > 0 {
			sort.SliceStable(draft, func(i, j int) bool { return draft[i].ID < draft[j].ID })
			o.step.ToolCalls = draft
		}
		if raw, err := json.Marshal(response); err == nil {
			if usage, model := providerUsage(protocol, raw); usage.Reported {
				o.step.Usage = usage
				if model != "" {
					o.step.Model = model
				}
			}
		}
		o.publish()
		if len(o.step.Text)+len(o.step.Reasoning) > 2*1024*1024 {
			return tcylocale.Error("e37")
		}
		return nil
	}
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if err := emit(); err != nil {
				return nil, err
			}
			event, data = "", ""
			continue
		}
		if strings.HasPrefix(line, "event:") {
			event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		}
		if strings.HasPrefix(line, "data:") {
			if data != "" {
				data += "\n"
			}
			data += strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if err := emit(); err != nil {
		return nil, err
	}
	if !terminal {
		return nil, tcylocale.Error("chatStreamIncomplete")
	}
	switch protocol {
	case "anthropic":
		response["content"] = blocks
	case "gemini":
		response["candidates"] = []any{map[string]any{"content": map[string]any{"parts": blocks}, "finishReason": response["finishReason"]}}
	case "openai-responses":
	default:
		calls := []any{}
		indices := make([]int, 0, len(tools))
		for index := range tools {
			indices = append(indices, index)
		}
		sort.Ints(indices)
		for _, index := range indices {
			if tool := tools[index]; tool != nil {
				calls = append(calls, tool)
			}
		}
		response["choices"] = []any{map[string]any{"finish_reason": response["finish_reason"], "message": map[string]any{"role": "assistant", "content": text, "reasoning_content": reasoning, "tool_calls": calls}}}
	}
	return json.Marshal(response)
}

func captureResponse(o *observation, protocol string, raw []byte) {
	usage, model := providerUsage(protocol, raw)
	o.step.Usage = usage
	if model != "" {
		o.step.Model = model
	}
	var body map[string]any
	if json.Unmarshal(raw, &body) != nil {
		return
	}
	if o.step.Text != "" || o.step.Reasoning != "" {
		return
	}
	switch protocol {
	case "anthropic":
		for _, v := range list(body, "content") {
			part := asObject(v)
			o.step.Text += textValue(part, "text")
			o.step.Reasoning += textValue(part, "thinking")
		}
	case "gemini":
		if candidates := list(body, "candidates"); len(candidates) > 0 {
			for _, v := range list(object(asObject(candidates[0]), "content"), "parts") {
				part := asObject(v)
				if part["thought"] == true {
					o.step.Reasoning += textValue(part, "text")
				} else {
					o.step.Text += textValue(part, "text")
				}
			}
		}
	case "openai-responses":
		for _, v := range list(body, "output") {
			item := asObject(v)
			for _, part := range list(item, "content") {
				o.step.Text += textValue(asObject(part), "text")
			}
			for _, part := range list(item, "summary") {
				o.step.Reasoning += textValue(asObject(part), "text")
			}
		}
	default:
		if choices := list(body, "choices"); len(choices) > 0 {
			m := object(asObject(choices[0]), "message")
			o.step.Text = textValue(m, "content")
			o.step.Reasoning = textValue(m, "reasoning_content")
		}
	}
}

// Status and a bounded provider message help diagnose protocol errors without exposing credentials.
func upstreamError(status int, reader io.Reader, key string) error {
	raw, _ := io.ReadAll(io.LimitReader(reader, 8192))
	var body map[string]any
	_ = json.Unmarshal(raw, &body)
	message := textValue(object(body, "error"), "message")
	if message == "" {
		message = textValue(body, "message")
	}
	if key != "" {
		message = strings.ReplaceAll(message, key, "[redacted]")
	}
	if len(message) > 1500 {
		message = message[:1500]
	}
	return tcylocale.Error("chatUpstream", status, message)
}
