import type {ModelStep} from '@/client/generated'

export type OutputSpeed = {
 rate: number
 mode: 'stream' | 'visible' | 'request'
 tokens: number
 durationMs: number
} | {
 rate: null
 reason: 'usage' | 'timing' | 'short' | 'tools'
}

// Per-response decode throughput (the reciprocal of TPOT), not whole-agent throughput.
// Provider token counts and server-observed timings survive reloads; never estimate from characters.
export function outputSpeed(step?: ModelStep): OutputSpeed {
	const usage = step?.usage
	if (!usage?.reported || usage.partial || !Number.isSafeInteger(usage.output) || usage.output! < 0) return {rate: null, reason: 'usage'}
	const elapsed = step?.duration_ms
	if (!Number.isFinite(elapsed) || elapsed! <= 0) return {rate: null, reason: 'timing'}
	let tokens = usage.output!
	if (step?.streaming === false) {
		return tokens > 0 ? {rate: tokens / elapsed! * 1000, mode: 'request', tokens, durationMs: elapsed!} : {rate: null, reason: 'short'}
	}
	if (!step?.streaming) return {rate: null, reason: 'timing'}
	// Our timing records text/reasoning deltas, not the start of tool-argument deltas.
	if (step.tool_calls?.length) return {rate: null, reason: 'tools'}
	let first = step.first_token_ms
	let mode: 'stream' | 'visible' = 'stream'
	if (usage.reasoning_reported) {
		if (!Number.isSafeInteger(usage.reasoning) || usage.reasoning! < 0 || usage.reasoning! > tokens) return {rate: null, reason: 'usage'}
		// Hidden reasoning has no observable start. Count only visible output after its first delta.
		if (usage.reasoning! > 0 && !step.reasoning) {
			tokens -= usage.reasoning!
			first = step.first_text_ms
			mode = 'visible'
		}
	}
	if (first == null || !Number.isFinite(first) || first < 0 || first >= elapsed!) return {rate: null, reason: 'timing'}
	if (tokens <= 1) return {rate: null, reason: 'short'}
	const durationMs = elapsed! - first
	return {rate: (tokens - 1) / durationMs * 1000, mode, tokens, durationMs}
}
