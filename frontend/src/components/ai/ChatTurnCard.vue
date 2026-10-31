<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useNow} from '@vueuse/core'
import {useI18n} from 'vue-i18n'
import {marked} from 'marked'
import {sanitizeProjectDescription} from '@/helpers/sanitizeProjectDescription'
import XButton from '@/components/input/Button.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import {openAgentDiagnostic} from '@/helpers/diagnostics'
import OutputSpeed from './OutputSpeed.vue'
import CacheUsage from './CacheUsage.vue'
import WebSearchEvidence from './WebSearchEvidence.vue'
import {toolLabels} from './toolLabels'
import AronaAvatar from '@/components/ai/AronaAvatar.vue'
import ChatAttachmentCard from '@/components/ai/attachments/ChatAttachmentCard.vue'
import AgentReviewCard from '@/components/ai/AgentReviewCard.vue'
import type {ChatTurn, ReviewInput, ModelStep} from '@/client/generated'

const props = withDefaults(defineProps<{
	conversationId?: string
	turn: ChatTurn
	busy: boolean
	sending?: boolean
	reviewBusy?: boolean
}>(), {
	reviewBusy: false,
	sending: false,
	conversationId: '',
})
const emit = defineEmits<{
	fork: [id: string]
	review: [input: ReviewInput]
}>()
const {t} = useI18n({useScope: 'global'})
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
const executionOpen = ref(false)
const running = computed(() => props.turn.status === 'running')
const result = computed(() => props.turn.result)
const {now, pause, resume} = useNow({interval: 1000, controls: true})
watch(running, value => value ? resume() : pause(), {immediate: true})
const lastStep = computed(() => result.value?.steps?.at(-1))
const activeTool = computed(() => result.value?.stage === 'model'
	? (lastStep.value?.tool_calls?.at(-1) ? callName(lastStep.value.tool_calls.at(-1)!) : undefined)
	: result.value?.operations?.at(-1)?.tool || result.value?.actions?.at(-1)?.tool)
const searchSteps = computed(() => (result.value?.actions ?? []).flatMap(a => a.search?.step ? [a.search.step] : []))
const cacheUsages = computed(() => [...(result.value?.steps ?? []), ...searchSteps.value].map(step => step.usage))
function callName(call: {function?: {name?: string, arguments?: string}}) {
	if (call.function?.name !== 'invoke_tool') return call.function?.name ?? ''
	try {
		const name = JSON.parse(call.function.arguments ?? '{}').name
		return typeof name === 'string' ? name : 'invoke_tool'
	} catch {
		return 'invoke_tool'
	}
}
const liveUsage = computed(() => [...(result.value?.steps ?? []), ...searchSteps.value].reduce((u, step) => ({
	input: u.input + (step.usage?.input ?? 0),
	output: u.output + (step.usage?.output ?? 0),
	reasoning: u.reasoning + (step.usage?.reasoning ?? 0),
	reported: u.reported || Boolean(step.usage?.reported),
}), {input: 0, output: 0, reasoning: 0, reported: false}))
function stepTime(step: ModelStep) {
	const live = running.value && step.round === lastStep.value?.round && result.value?.stage === 'model' && step.started
	const elapsed = live
		? Math.max(step.duration_ms ?? 0, now.value.getTime() - new Date(step.started!).getTime())
		: step.duration_ms
	return seconds(elapsed)
}
const answer = computed(() => result.value?.reply || result.value?.steps?.at(-1)?.text || '')
const html = computed(() => sanitizeProjectDescription(marked.parse(answer.value, {async: false})))
const labels = computed(() => toolLabels(t))
function seconds(value?: number | null) {
	return value == null ? t('chat.unavailable') : t('chat.seconds', {value: (value / 1000).toFixed(2)})
}
function pretty(value?: string) {
	try { return JSON.stringify(JSON.parse(value ?? ''), null, 2) } catch { return value }
}
async function copy() {
	try {
		await navigator.clipboard.writeText(answer.value)
		copied.value = true
		clearTimeout(copiedTimer)
		copiedTimer = setTimeout(() => { copied.value = false }, 2000)
	} catch {
		copied.value = false
	}
}
onBeforeUnmount(() => clearTimeout(copiedTimer))

// One polite status per turn that only changes with the stage, never with counters or streamed text.
const finishedHere = ref(false)
watch(running, (isRunning, wasRunning) => { if (wasRunning && !isRunning) finishedHere.value = true })
const announcement = computed(() => {
	if (props.sending) return t('chat.sending')
	if (running.value) return t(`flow.stage_${result.value?.stage || 'model'}`)
	if (result.value?.pause) return t(result.value.pause === 'budget' ? 'flow.stage_budget' : 'flow.stage_review')
	return finishedHere.value && props.turn.status === 'completed' ? t('flow.stage_completed') : ''
})
</script>

<template>
	<article
		class="chat-turn"
		:data-turn-id="turn.id"
	>
		<div class="user-message">
			<div>
				<strong class="is-sr-only">{{ t('tcymc.text.you') }}</strong><p>{{ turn.prompt }}</p><div
					v-if="turn.attachments?.length && conversationId"
					class="message-attachments"
				>
					<ChatAttachmentCard
						v-for="file in turn.attachments"
						:key="file.id"
						:conversation-id="conversationId"
						:file="file"
					/>
				</div>
			</div>
		</div>
		<div class="assistant-message">
			<div class="assistant-identity">
				<AronaAvatar size="small" />
				<strong>{{ t('tcymc.text.task_assistant') }}</strong>
				<span
					v-if="result?.model"
					class="model-badge"
				>{{ result.model }}</span>
				<span
					class="is-sr-only"
					role="status"
				>{{ announcement }}</span>
			</div>
			<details
				v-if="result?.steps?.length"
				class="execution"
				@toggle="executionOpen = ($event.target as HTMLDetailsElement).open"
			>
				<summary>
					<Icon icon="sitemap" />
					<span>{{ t('chat.thinkingAndSteps') }} · {{ t('chat.rounds', {count: result.steps.length}) }} · {{ t('chat.operations', {count: result.actions?.length ?? 0}) }}</span>
				</summary>
				<template v-if="executionOpen">
					<section
						v-for="step in result.steps"
						:key="step.round"
						class="model-step"
					>
						<header><strong>{{ t('chat.round', {count: step.round}) }}</strong><span>{{ step.model }} · {{ stepTime(step) }}</span></header>
						<CacheUsage :usages="[step.usage]" /><p
							v-if="step.loaded_tools?.length"
							class="step-note"
						>
							{{ t('assistantUI.toolFootprint', {count: step.loaded_tools.length, total: step.catalog_tool_count, size: ((step.tool_schema_bytes ?? 0) / 1024).toFixed(1), full: ((step.catalog_schema_bytes ?? 0) / 1024).toFixed(1)}) }}<br><code>{{ step.loaded_tools.join(', ') }}</code><small v-if="step.loaded_tools.includes('invoke_tool')"> · {{ t('cacheEfficiency.deferredTools') }}</small>
						</p>
						<p
							v-if="!running && step.requested_streaming && !step.streaming"
							class="step-note"
						>
							{{ t('flow.streamIgnored') }}
						</p>
						<p
							v-if="step.http_status"
							class="step-note"
						>
							HTTP {{ step.http_status }}<span v-if="step.request_id"> · {{ t('debug.upstreamID') }}: {{ step.request_id }}</span>
						</p>
						<details
							v-if="step.reasoning"
							class="reasoning"
							:open="running && step.round === result.steps.length"
						>
							<summary>{{ t('chat.providerReasoning') }}</summary><p>{{ step.reasoning }}</p>
						</details>
						<p
							v-else
							class="step-note"
						>
							{{ t('chat.noReasoning') }}
						</p>
						<p
							v-if="step.text && step.round !== result.steps.length"
							class="step-text"
						>
							{{ step.text }}
						</p>
						<details
							v-for="call in (step.tool_calls ?? []).filter(call => !(result?.actions ?? []).some(action => action.round === step.round && action.tool === callName(call)))"
							:key="call.id || call.function?.name"
							class="tool-step tool-draft"
							:open="running"
						>
							<summary><Icon icon="code" />{{ labels[callName(call)] || callName(call) }} · {{ t(running && step.round === lastStep?.round && result?.stage === 'model' ? 'flow.toolDraft' : 'flow.toolProposed') }}</summary><pre>{{ pretty(call.function?.arguments) }}</pre>
						</details>
						<div
							v-for="receipt in (result.operations ?? []).filter(op => op.status === 'running' && step.round === lastStep?.round)"
							:key="receipt.id"
							class="tool-inflight"
						>
							<span
								class="working-orbit"
								aria-hidden="true"
							/>{{ labels[receipt.tool ?? ''] || receipt.tool }} · {{ t('flow.toolExecuting') }}
						</div>
						<details
							v-for="(action, actionIndex) in (result?.actions ?? []).filter(a => a.round === step.round)"
							:key="actionIndex"
							class="tool-step"
							:class="{'is-failed': !action.success}"
						>
							<summary><Icon :icon="action.success ? 'check' : 'exclamation-circle'" /> {{ labels[action.tool ?? ''] || action.tool }} · {{ action.success ? t('tcymc.text.succeeded') : t('tcymc.text.failed') }} · {{ seconds(action.duration_ms) }}</summary>
							<WebSearchEvidence
								v-if="action.search"
								:result="action.search"
							/><strong>{{ t('chat.arguments') }}</strong><pre>{{ pretty(action.arguments) }}</pre><strong>{{ t('chat.actualResult') }}</strong><pre>{{ pretty(action.result) }}</pre>
						</details>
					</section>
				</template>
			</details>
			<AgentReviewCard
				:turn="turn"
				:busy="reviewBusy || running"
				@review="emit('review', $event)"
			/>
			<p
				v-if="result?.budget?.round_limit"
				class="step-note"
			>
				{{ t('agent.budgetProgress', {rounds: result.budget.rounds, roundLimit: result.budget.round_limit, operations: result.budget.operations, operationLimit: result.budget.operation_limit}) }}
			</p>
			<div
				v-if="answer"
				class="chat-markdown content"
				:class="{'is-streaming': running && result?.stage === 'model'}"
				v-html="html"
			/>
			<p
				v-if="!answer && running"
				class="thinking-status"
			>
				<Icon icon="bolt" /> {{ t(sending ? 'chat.sending' : 'chat.waiting') }}
			</p>
			<!-- Live status sits below the answer, so it can leave without moving text being read. -->
			<div
				v-if="running && !sending"
				class="live-run-panel"
			>
				<span
					class="working-orbit"
					aria-hidden="true"
				/>
				<strong>{{ t(`flow.stage_${result?.stage || 'model'}`) }}<template v-if="activeTool"> · {{ labels[activeTool] || activeTool }}</template></strong>
				<span class="live-detail">{{ lastStep?.streaming ? t('flow.streaming') : t('flow.waitingData') }}<template v-if="lastStep"> · {{ stepTime(lastStep) }}</template></span>
				<span
					class="live-counts"
					aria-hidden="true"
				>
					<span v-if="liveUsage.reported">{{ liveUsage.input }} {{ t('chat.inputTokens') }} · {{ liveUsage.output }} {{ t('chat.outputTokens') }}<template v-if="liveUsage.reasoning"> · {{ liveUsage.reasoning }} {{ t('chat.reasoningTokens') }}</template></span><span v-else>{{ t('flow.usagePending') }}</span>
					<small>{{ t('flow.observedCharacters', {count: lastStep?.output_characters ?? 0}) }}</small>
				</span>
			</div>
			<p
				v-if="result?.error"
				class="run-error"
				role="status"
			>
				{{ result.error }}
			</p>
			<p
				v-if="turn.status === 'interrupted'"
				class="run-error"
			>
				{{ t('chat.interrupted') }}
			</p>
			<p
				v-if="turn.status === 'stopped'"
				class="step-note"
			>
				{{ t('chat.stopped') }}
			</p>

			<div
				v-if="turn.retryable"
				class="retry-panel"
			>
				<XButton
					:disabled="busy || reviewBusy"
					:loading="reviewBusy"
					icon="redo"
					@click="emit('review', {turn_id: turn.id!, decision: 'retry', operation_id: '', arguments: '', answer: ''})"
				>
					{{ t('chat.retryResume') }}
				</XButton>
				<p class="step-note">
					{{ t('chat.retryResumeHint') }}
				</p>
			</div>

			<div
				v-if="turn.status === 'completed' || result?.system_prompt"
				class="run-meta"
			>
				<OutputSpeed
					v-if="turn.status === 'completed'"
					:step="lastStep"
				/>
				<details
					v-if="result?.system_prompt"
					class="request-details"
				>
					<summary>
						{{ t('chat.requestDetails') }} · {{ seconds(result?.duration_ms) }}<template v-if="result?.usage?.reported">
							· {{ t('assistantUI.tokenCount', {count: (result.usage.input ?? 0) + (result.usage.output ?? 0)}) }}
						</template>
					</summary>
					<details
						v-if="result?.configuration"
						class="run-configuration"
					>
						<summary>{{ t('assistantUI.runConfiguration') }}</summary><pre>{{ JSON.stringify(result.configuration, null, 2) }}</pre>
					</details>
					<div
						v-if="!running"
						class="run-metrics"
					>
						<span>{{ t('chat.totalTime') }}: {{ seconds(result?.duration_ms) }}</span><span>{{ t('chat.firstToken') }}: {{ seconds(result?.first_token_ms) }}</span><span>{{ t('chat.firstText') }}: {{ seconds(result?.first_text_ms) }}</span>
						<span v-if="result?.steps?.at(-1)?.context_window">{{ t('modelConfig.context') }}: {{ result.steps.at(-1)?.context_window?.toLocaleString() }} · {{ t('modelConfig.lastInput') }}: {{ result.steps.at(-1)?.usage?.reported ? result.steps.at(-1)?.usage?.input?.toLocaleString() : t('chat.unavailable') }}</span>
						<span v-if="result?.steps?.at(-1)?.max_output_tokens">{{ t('modelConfig.output') }}: {{ result.steps.at(-1)?.max_output_tokens?.toLocaleString() }}</span>
						<span v-if="result?.usage?.reported">{{ t('chat.inputTokens') }}: {{ result.usage.input }} · {{ t('chat.outputTokens') }}: {{ result.usage.output }} · {{ t('chat.totalTokens') }}: {{ (result.usage.input ?? 0) + (result.usage.output ?? 0) }}</span>
						<span v-else>{{ t('chat.tokens') }}: {{ t('chat.unavailable') }}</span>
						<span v-if="result?.usage?.reported && result.usage.partial">{{ t('chat.partialUsage') }}</span>
						<CacheUsage :usages="cacheUsages" /><span v-if="result?.usage?.reasoning_reported">{{ t('chat.reasoningTokens') }}: {{ result.usage.reasoning }}</span>
					</div>
					<p>{{ t('chat.requestedModel') }}: {{ result.requested_model }} · {{ result.protocol }}</p>
					<code>{{ result.endpoint }}</code>
					<pre>{{ result.system_prompt }}</pre>
					<p>{{ t('chat.metricNotes') }}</p>
				</details>
			</div>
			<WebSearchEvidence
				v-for="(action, index) in (result?.actions ?? []).filter(a => a.search)"
				:key="`search-${index}`"
				:result="action.search!"
			/>
			<div class="message-actions">
				<BaseButton
					v-if="answer"
					class="message-action"
					@click="copy"
				>
					<Icon :icon="copied ? 'check' : 'copy'" /> {{ copied ? t('chat.copied') : t('chat.copy') }}
				</BaseButton>
				<BaseButton
					v-if="!running"
					class="message-action"
					:aria-disabled="busy"
					@click="!busy && emit('fork', turn.id!)"
				>
					<Icon icon="code-branch" /> {{ t('chat.forkHere') }}
				</BaseButton>
				<BaseButton
					class="message-action is-icon"
					:title="t('debug.openRun')"
					:aria-label="t('debug.openRun')"
					@click="openAgentDiagnostic(turn)"
				>
					<Icon icon="code" />
				</BaseButton>
			</div>
		</div>
	</article>
</template>

<style scoped lang="scss">
.chat-turn {
	content-visibility: auto;
	contain-intrinsic-size: auto 200px;
	margin-block: var(--space-4) var(--space-8);
}

.chat-turn:has(.live-run-panel) {
	content-visibility: visible;
}

.user-message {
	display: flex;
	gap: var(--space-3);
	inline-size: fit-content;
	max-inline-size: min(85%, 40rem);
	margin-inline-start: auto;
	padding: var(--space-2) var(--space-4);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-lg);
	background: var(--surface-sunken);
	color: var(--text-primary);
	font-size: var(--text-base);
	line-height: var(--leading-normal);
}

.user-message > div {
	min-inline-size: 0;
}

.user-message p,
.reasoning p,
.step-text {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	margin-block: var(--space-2) 0;
}

.user-message p {
	margin: 0;
}

.message-attachments {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
	margin-block-start: var(--space-2);
}

.assistant-message {
	margin-block-start: var(--space-5);
}

.assistant-identity {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: var(--space-1) var(--space-2);
	min-block-size: var(--control-height-sm);
	margin-block-end: var(--space-2);
	color: var(--text-secondary);
	font-size: var(--text-sm);

	strong {
		color: var(--text-primary);
		font-weight: var(--weight-semibold);
	}
}

.model-badge {
	padding-inline: var(--space-2);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-full);
	color: var(--text-tertiary);
	font-size: var(--text-xs);
	line-height: 1.5;
	overflow-wrap: anywhere;
}

summary {
	cursor: pointer;
	line-height: var(--leading-normal);
	overflow-wrap: anywhere;
	border-radius: var(--radius-sm);

	&:focus-visible {
		@include focus-ring;
	}
}

.execution {
	margin-block-end: var(--space-3);
	padding-inline-start: var(--space-3);
	border-inline-start: 2px solid var(--border-default);
	color: var(--text-secondary);
	font-size: var(--text-sm);

	> summary {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		color: var(--text-tertiary);

		&:hover {
			color: var(--text-primary);
		}

		svg {
			flex-shrink: 0;
			inline-size: .8em;
		}
	}
}

.model-step {
	margin-block-start: var(--space-3);
	padding-inline-start: var(--space-3);
	border-inline-start: 2px solid var(--primary);
}

.model-step header {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: var(--space-2);
}

.model-step header span,
.step-note {
	color: var(--text-tertiary);
	font-size: var(--text-sm);
}

.reasoning,
.tool-step {
	margin-block-start: var(--space-3);
}

.reasoning p {
	max-block-size: 20rem;
	overflow-y: auto;
	padding: var(--space-3);
	border-radius: var(--radius-md);
	background: var(--surface-sunken);
}

.tool-step.is-failed > summary {
	color: var(--danger-text);
}

.tool-draft {
	padding: var(--space-2) var(--space-3);
	border: 1px dashed var(--border-strong);
	border-radius: var(--radius-md);
}

.tool-inflight {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	margin-block-start: var(--space-2);
	padding: var(--space-2) var(--space-3);
	border-radius: var(--radius-md);
	background: var(--surface-sunken);
}

pre {
	max-block-size: 20rem;
	margin-block: var(--space-2);
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	font-family: var(--font-mono);
	font-size: var(--text-xs);
}

.chat-markdown {
	color: var(--text-primary);
	font-size: var(--text-base);
	line-height: 1.65;
	overflow-wrap: anywhere;

	// Replies are part of a dense column, not a document: headings stay close to body size.
	:deep(h1),
	:deep(h2) {
		margin-block: var(--space-4) var(--space-2);
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
	}

	:deep(h3),
	:deep(h4),
	:deep(h5),
	:deep(h6) {
		margin-block: var(--space-3) var(--space-1);
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
	}

	:deep(p),
	:deep(ul),
	:deep(ol) {
		margin-block-end: var(--space-3);
	}

	> :deep(:last-child) {
		margin-block-end: 0;
	}

	:deep(pre) {
		max-inline-size: 100%;
		overflow-x: auto;
		border-radius: var(--radius-md);
		background: var(--surface-sunken);
		font-size: var(--text-sm);
	}

	:deep(code) {
		font-family: var(--font-mono);
	}

	:deep(table) {
		display: block;
		max-inline-size: 100%;
		overflow-x: auto;
		font-size: var(--text-md);
	}

	:deep(img) {
		max-inline-size: 100%;
	}
}

// The cursor follows the last block inline, so it never adds or removes a line while streaming.
.chat-markdown.is-streaming > :deep(:last-child)::after {
	content: '';
	display: inline-block;
	inline-size: .45em;
	block-size: 1em;
	margin-inline-start: .15em;
	vertical-align: text-bottom;
	border-radius: var(--radius-xs);
	background: var(--primary);
	animation: cursor-breathe 1s ease-in-out infinite;
}

.thinking-status {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	color: var(--text-secondary);
	font-size: var(--text-md);
}

.live-run-panel {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-1) var(--space-3);
	min-block-size: var(--control-height-sm);
	margin-block-start: var(--space-3);
	color: var(--text-secondary);
	font-size: var(--text-sm);

	strong {
		color: var(--text-primary);
		font-weight: var(--weight-medium);
	}
}

.live-detail {
	color: var(--text-tertiary);
}

.live-counts {
	display: flex;
	flex-wrap: wrap;
	gap: 0 var(--space-2);
	margin-inline-start: auto;
	color: var(--text-tertiary);
	font-size: var(--text-xs);
	font-variant-numeric: tabular-nums;
}

.working-orbit {
	display: inline-block;
	flex-shrink: 0;
	inline-size: .75rem;
	block-size: .75rem;
	border: 2px solid var(--border-default);
	border-block-start-color: var(--primary);
	border-radius: 50%;
	animation: working-spin .85s linear infinite;
}

.run-error {
	padding: var(--space-2) var(--space-3);
	border-inline-start: 3px solid var(--danger);
	border-radius: var(--radius-sm);
	background: var(--tint-danger);
	color: var(--text-primary);
	font-size: var(--text-md);
	overflow-wrap: anywhere;
}

.retry-panel {
	margin-block: var(--space-3);
}

.run-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0 var(--space-4);
	min-block-size: var(--control-height-sm);
	margin-block-start: var(--space-3);
	color: var(--text-tertiary);
	font-size: var(--text-xs);

	> details[open] {
		flex-basis: 100%;
	}
}

.request-details {
	color: var(--text-tertiary);

	> summary {
		padding-block: var(--space-1);
	}

	> p {
		margin-block: var(--space-2);
	}

	code {
		display: block;
		overflow-wrap: anywhere;
	}
}

.run-configuration {
	margin-block: var(--space-2);
}

.run-metrics {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-1) var(--space-4);
	margin-block: var(--space-2);
	color: var(--text-secondary);
	font-variant-numeric: tabular-nums;
}

.message-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-1);
	margin-block-start: var(--space-2);
}

.message-action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: var(--space-1);
	min-block-size: var(--control-height-sm);
	min-inline-size: var(--control-height-sm);
	padding-inline: var(--space-2);
	border-radius: var(--radius-sm);
	color: var(--text-tertiary);
	font-size: var(--text-xs);

	&:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}

	&.is-icon {
		padding-inline: 0;
	}

	&[aria-disabled='true'] {
		opacity: .5;
		cursor: not-allowed;
	}

	svg {
		inline-size: .85em;
	}
}

@keyframes working-spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes cursor-breathe {
	50% {
		opacity: .2;
	}
}

@media (prefers-reduced-motion: reduce) {
	.working-orbit,
	.chat-markdown.is-streaming > :deep(:last-child)::after {
		animation: none;
	}
}
</style>
