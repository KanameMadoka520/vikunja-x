<script setup lang="ts">
import {computed, ref} from 'vue'
import {useNow} from '@vueuse/core'
import {useI18n} from 'vue-i18n'
import {marked} from 'marked'
import {sanitizeProjectDescription} from '@/helpers/sanitizeProjectDescription'
import BaseButton from '@/components/base/BaseButton.vue'
import {openAgentDiagnostic} from '@/helpers/diagnostics'
import AgentReviewCard from '@/components/ai/AgentReviewCard.vue'
import type {ChatTurn, ReviewInput, ModelStep} from '@/client/generated'

const props = withDefaults(defineProps<{
	turn: ChatTurn
	busy: boolean
 reviewBusy?: boolean
}>(), {reviewBusy: false})
const emit = defineEmits<{
	fork: [id: string]
 review: [input: ReviewInput]
}>()
const {t} = useI18n({useScope: 'global'})
const copied = ref(false)
const running = computed(() => props.turn.status === 'running')
const result = computed(() => props.turn.result)
const now = useNow({interval: 250})
const lastStep = computed(() => result.value?.steps?.at(-1))
const activeTool = computed(() => result.value?.stage === 'model' ? lastStep.value?.tool_calls?.at(-1)?.function?.name : result.value?.operations?.at(-1)?.tool || result.value?.actions?.at(-1)?.tool)
const liveUsage = computed(() => (result.value?.steps ?? []).reduce((u, step) => ({input: u.input + (step.usage?.input ?? 0), output: u.output + (step.usage?.output ?? 0), reasoning: u.reasoning + (step.usage?.reasoning ?? 0), reported: u.reported || Boolean(step.usage?.reported)}), {input: 0, output: 0, reasoning: 0, reported: false}))
function stepTime(step: ModelStep) {
	const elapsed = running.value && step.round === lastStep.value?.round && result.value?.stage === 'model' && step.started ? Math.max(step.duration_ms ?? 0, now.value.getTime() - new Date(step.started).getTime()) : step.duration_ms
	return seconds(elapsed)
}
const answer = computed(() => result.value?.reply || result.value?.steps?.at(-1)?.text || '')
const html = computed(() => sanitizeProjectDescription(marked.parse(answer.value, {async: false})))
const labels = computed<Record<string, string>>(() => ({
	list_projects: t('tcymc.text.find_projects'),
	list_tasks: t('tcymc.text.find_tasks'),
	get_task: t('tcymc.text.read_task'),
	create_project: t('tcymc.text.create_project'),
	create_task: t('tcymc.text.create_task'),
	update_task: t('tcymc.text.update_task'),
	delete_task: t('tcymc.text.delete_task'),
	...Object.fromEntries(['find_tools','ask_user','get_project','list_labels','list_comments','list_project_users','bulk_update_tasks','create_label','add_task_label','remove_task_label','add_comment','assign_task','unassign_task','relate_tasks','unrelate_tasks'].map(name => [name, t(`agent.tools.${name}`)])),
}))
function seconds(value?: number | null) {
	return value == null ? t('chat.unavailable') : t('chat.seconds', {value: (value / 1000).toFixed(2)})
}
function pretty(value?: string) {
	try { return JSON.stringify(JSON.parse(value ?? ''), null, 2) } catch { return value }
}
async function copy() {
	try { await navigator.clipboard.writeText(answer.value); copied.value = true } catch { copied.value = false }
}
</script>

<template>
	<article
		class="chat-turn"
		:data-turn-id="turn.id"
	>
		<div class="user-message">
			<div><strong class="is-sr-only">{{ t('tcymc.text.you') }}</strong><p>{{ turn.prompt }}</p></div>
		</div>
		<div class="assistant-message">
			<div class="assistant-identity">
				<span class="message-avatar assistant-avatar"><Icon icon="robot" /></span><strong>{{ t('tcymc.text.task_assistant') }}</strong><span
					v-if="result?.model"
					class="model-badge"
				>{{ result.model }}</span><span
					v-if="running"
					class="run-status"
					role="status"
				>{{ t('chat.running') }}</span>
			</div>
			<div
				v-if="running"
				class="live-run-panel"
				role="status"
			>
				<span class="working-orbit" /><div><strong>{{ t(`flow.stage_${result?.stage || 'model'}`) }}<template v-if="activeTool"> · {{ labels[activeTool] || activeTool }}</template></strong><small>{{ lastStep?.streaming ? t('flow.streaming') : t('flow.waitingData') }}<template v-if="lastStep"> · {{ stepTime(lastStep) }}</template></small></div>
				<div class="live-counts">
					<span v-if="liveUsage.reported">{{ liveUsage.input }} {{ t('chat.inputTokens') }} · {{ liveUsage.output }} {{ t('chat.outputTokens') }}<template v-if="liveUsage.reasoning"> · {{ liveUsage.reasoning }} {{ t('chat.reasoningTokens') }}</template></span><span v-else>{{ t('flow.usagePending') }}</span><small>{{ t('flow.observedCharacters', {count: lastStep?.output_characters ?? 0}) }}</small>
				</div>
			</div>
			<details
				v-if="result?.steps?.length"
				class="execution"
			>
				<summary><Icon icon="sitemap" /> {{ t('chat.thinkingAndSteps') }} · {{ t('chat.rounds', {count: result.steps.length}) }} · {{ t('chat.operations', {count: result.actions?.length ?? 0}) }}</summary>
				<section
					v-for="step in result.steps"
					:key="step.round"
					class="model-step"
				>
					<header><strong>{{ t('chat.round', {count: step.round}) }}</strong><span>{{ step.model }} · {{ stepTime(step) }}</span></header><p
						v-if="step.loaded_tools?.length"
						class="step-note"
					>
						{{ t('assistantUI.toolFootprint', {count: step.loaded_tools.length, total: step.catalog_tool_count, size: ((step.tool_schema_bytes ?? 0) / 1024).toFixed(1), full: ((step.catalog_schema_bytes ?? 0) / 1024).toFixed(1)}) }}<br><code>{{ step.loaded_tools.join(', ') }}</code>
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
						v-for="call in (step.tool_calls ?? []).filter(call => !(result?.actions ?? []).some(action => action.round === step.round && action.tool === call.function?.name))"
						:key="call.id || call.function?.name"
						class="tool-step tool-draft"
						:open="running"
					>
						<summary><Icon icon="code" />{{ labels[call.function?.name ?? ''] || call.function?.name }} · {{ t(running && step.round === lastStep?.round && result?.stage === 'model' ? 'flow.toolDraft' : 'flow.toolProposed') }}</summary><pre>{{ pretty(call.function?.arguments) }}</pre>
					</details>
					<div
						v-for="receipt in (result.operations ?? []).filter(op => op.status === 'running' && step.round === lastStep?.round)"
						:key="receipt.id"
						class="tool-inflight"
					>
						<span class="working-orbit" />{{ labels[receipt.tool ?? ''] || receipt.tool }} · {{ t('flow.toolExecuting') }}
					</div>
					<details
						v-for="(action, actionIndex) in (result?.actions ?? []).filter(a => a.round === step.round)"
						:key="actionIndex"
						class="tool-step"
					>
						<summary><Icon :icon="action.success ? 'check' : 'exclamation-circle'" /> {{ labels[action.tool ?? ''] || action.tool }} · {{ action.success ? t('tcymc.text.succeeded') : t('tcymc.text.failed') }} · {{ seconds(action.duration_ms) }}</summary>
						<strong>{{ t('chat.arguments') }}</strong><pre>{{ pretty(action.arguments) }}</pre><strong>{{ t('chat.actualResult') }}</strong><pre>{{ pretty(action.result) }}</pre>
					</details>
				</section>
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
				role="status"
			>
				<Icon icon="bolt" /> {{ t('chat.waiting') }}
			</p>
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

			<details
				v-if="result?.system_prompt"
				class="request-details"
			>
				<summary>
					{{ t('chat.requestDetails') }} · {{ seconds(result?.duration_ms) }}<template v-if="result?.usage?.reported">
						· {{ (result.usage.input ?? 0) + (result.usage.output ?? 0) }} tokens
					</template>
				</summary>			<div
					v-if="!running"
					class="run-metrics"
				>
					<span>{{ t('chat.totalTime') }}: {{ seconds(result?.duration_ms) }}</span><span>{{ t('chat.firstToken') }}: {{ seconds(result?.first_token_ms) }}</span><span>{{ t('chat.firstText') }}: {{ seconds(result?.first_text_ms) }}</span>
					<span v-if="result?.steps?.at(-1)?.context_window">{{ t('modelConfig.context') }}: {{ result.steps.at(-1)?.context_window?.toLocaleString() }} · {{ t('modelConfig.lastInput') }}: {{ result.steps.at(-1)?.usage?.reported ? result.steps.at(-1)?.usage?.input?.toLocaleString() : t('chat.unavailable') }}</span>
					<span v-if="result?.steps?.at(-1)?.max_output_tokens">{{ t('modelConfig.output') }}: {{ result.steps.at(-1)?.max_output_tokens?.toLocaleString() }}</span>
					<span v-if="result?.usage?.reported">{{ t('chat.inputTokens') }}: {{ result.usage.input }} · {{ t('chat.outputTokens') }}: {{ result.usage.output }} · {{ t('chat.totalTokens') }}: {{ (result.usage.input ?? 0) + (result.usage.output ?? 0) }}</span>
					<span v-else>{{ t('chat.tokens') }}: {{ t('chat.unavailable') }}</span>
					<span v-if="result?.usage?.reported && result.usage.partial">{{ t('chat.partialUsage') }}</span>
					<span v-if="result?.usage?.cache_reported">{{ t('chat.cacheTokens') }}: {{ result.usage.cached }}</span><span v-if="result?.usage?.reasoning_reported">{{ t('chat.reasoningTokens') }}: {{ result.usage.reasoning }}</span>
				</div><p>{{ t('chat.requestedModel') }}: {{ result.requested_model }} · {{ result.protocol }}</p><code>{{ result.endpoint }}</code><pre>{{ result.system_prompt }}</pre><p>{{ t('chat.metricNotes') }}</p>
			</details>
			<div class="message-actions">
				<BaseButton
					class="message-action"
					@click="openAgentDiagnostic(turn)"
				>
					<Icon icon="code" /> {{ t('debug.openRun') }}
				</BaseButton>
				<BaseButton
					v-if="answer"
					class="message-action"
					:aria-label="t('chat.copy')"
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
			</div>
		</div>
	</article>
</template>

<style scoped lang="scss">
.chat-turn {
content-visibility: auto;contain-intrinsic-size: auto 200px;
margin-block: 1rem 2.5rem;
}
.user-message {
display: flex;gap: .75rem;background: var(--grey-100);
inline-size: fit-content;
max-inline-size: 85%;
margin-inline-start: auto;
padding: .65rem 1.1rem;
border-radius: 1.5rem;
line-height: 1.7;
}
.user-message p, .reasoning p, .step-text {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	margin-block: .5rem 0;
}
.user-message > div {
	min-inline-size: 0;
}
.assistant-message {
;
margin-block-start: 1.75rem;
}
.assistant-identity {
display: flex;align-items: center;flex-wrap: wrap;margin-block-end: .875rem;
gap: .5rem;
font-size: .8rem;
color: var(--text-light);
}
.message-avatar {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	inline-size: 2rem;
	block-size: 2rem;
	border-radius: .625rem;
	background: var(--grey-200);
	color: var(--text);
}
.assistant-avatar {
;
background: transparent;
color: var(--text);
inline-size: 1.5rem;
block-size: 1.5rem;
}
.model-badge, .run-status {
border-radius: .375rem;color: var(--text-light);font-size: .75rem;overflow-wrap: anywhere;
background: transparent;
padding: 0;
}
.execution {
margin-block-end: 1rem;
border: 0;
border-inline-start: 2px solid var(--grey-200);
border-radius: 0;
padding: .25rem .8rem;
color: var(--text-light);
font-size: .8rem;
}
summary {
	cursor: pointer;
	line-height: 1.6;
	overflow-wrap: anywhere;
}
.model-step {
	margin-block-start: .75rem;
	border-inline-start: 2px solid var(--primary);
	padding-inline-start: .75rem;
}
.model-step header {
	display: flex;
	flex-wrap: wrap;
	gap: .5rem;
	justify-content: space-between;
}
.model-step header span, .step-note {
	color: var(--text-light);
	font-size: .8rem;
}
.reasoning, .tool-step {
	margin-block-start: .75rem;
}
.reasoning p {
	max-block-size: 20rem;
	overflow-y: auto;
	padding: .75rem;
	background: var(--grey-100);
	border-radius: .5rem;
}
pre {
	max-block-size: 20rem;
	white-space: pre-wrap;
	overflow: auto;
	overflow-wrap: anywhere;
	margin-block: .5rem;
	font-size: .8rem;
}
.chat-markdown {
overflow-wrap: anywhere;
font-size: 1rem;
line-height: 1.85;
}
.chat-markdown :deep(pre) {
	overflow-x: auto;
	max-inline-size: 100%;
}
.chat-markdown :deep(table) {
	display: block;
	max-inline-size: 100%;
	overflow-x: auto;
}
.chat-markdown :deep(img) {
	max-inline-size: 100%;
}
.run-error {
	padding: .75rem;
	border-inline-start: 3px solid var(--danger);
	background: var(--grey-100);
	overflow-wrap: anywhere;
}
.run-metrics {
	display: flex;
	flex-wrap: wrap;
	gap: .4rem 1rem;
	font-size: .75rem;
	color: var(--text-light);
	margin-block: .75rem;
}
.request-details {
;
border: 0;
background: transparent;
padding: .25rem 0;
color: var(--text-light);
font-size: .75rem;
}
.request-details code {
	display: block;
	overflow-wrap: anywhere;
}
.message-actions {
display: flex;flex-wrap: wrap;
gap: .5rem;
margin-block-start: .25rem;
}
.message-action {
display: inline-flex;align-items: center;gap: .5rem;min-block-size: 44px;color: var(--text-light);
font-size: .7rem;
padding: .5rem .25rem;
}

.chat-turn:has(.live-run-panel) {
content-visibility: visible;
}
.live-run-panel {
display: flex;flex-wrap: wrap;align-items: center;gap: .75rem;margin-block-end: .8rem;font-size: .8rem;
background: transparent;
border: 0;
border-radius: 0;
padding: .5rem 0;
box-shadow: none;
}
.live-run-panel small {
display: block;
color: var(--text-light);
font-size: .72rem;
margin-block-start: .25rem;
}
.live-counts {
margin-inline-start: auto;font-variant-numeric: tabular-nums;
font-size: .7rem;
}
.working-orbit {
display: inline-block;border: 2px solid color-mix(in srgb, var(--primary) 20%, transparent);border-block-start-color: var(--primary);border-radius: 50%;animation: working-spin .85s linear infinite;flex-shrink: 0;
inline-size: .7rem;
block-size: .7rem;
border-width: 2px;
}
.tool-inflight {
display: flex;
align-items: center;
gap: .5rem;
padding: .7rem;
border-radius: .6rem;
background: var(--grey-100);
}
.tool-draft {
border: 1px dashed var(--grey-300);
padding: .6rem;
border-radius: .6rem;
}
.chat-markdown.is-streaming::after {
content: '';
display: inline-block;
inline-size: .4rem;
block-size: 1rem;
background: var(--primary);
border-radius: .15rem;
animation: cursor-breathe 1s ease-in-out infinite;
}
@keyframes working-spin {
to {
transform: rotate(360deg);
} }
@keyframes cursor-breathe {
50% {
opacity: .2;
} }
@media (prefers-reduced-motion: reduce) {
.working-orbit, .chat-markdown.is-streaming::after {
animation: none;
} }

.user-message p {
margin: 0;
}
</style>
