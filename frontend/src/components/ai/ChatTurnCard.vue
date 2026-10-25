<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {marked} from 'marked'
import {sanitizeProjectDescription} from '@/helpers/sanitizeProjectDescription'
import BaseButton from '@/components/base/BaseButton.vue'
import type {ChatTurn} from '@/client/generated'

const props = defineProps<{
	turn: ChatTurn
	busy: boolean
}>()
const emit = defineEmits<{
	fork: [id: string]
}>()
const {t} = useI18n({useScope: 'global'})
const copied = ref(false)
const running = computed(() => props.turn.status === 'running')
const result = computed(() => props.turn.result)
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
			<span class="message-avatar"><Icon icon="user" /></span><div><strong>{{ t('tcymc.text.you') }}</strong><p>{{ turn.prompt }}</p></div>
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
			<details
				v-if="result?.steps?.length"
				class="execution"
				:open="running"
			>
				<summary><Icon icon="sitemap" /> {{ t('chat.thinkingAndSteps') }} · {{ t('chat.rounds', {count: result.steps.length}) }} · {{ t('chat.operations', {count: result.actions?.length ?? 0}) }}</summary>
				<section
					v-for="step in result.steps"
					:key="step.round"
					class="model-step"
				>
					<header><strong>{{ t('chat.round', {count: step.round}) }}</strong><span>{{ step.model }} · {{ seconds(step.duration_ms) }}</span></header>
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
						v-for="(action, actionIndex) in (result.actions ?? []).filter(a => a.round === step.round)"
						:key="actionIndex"
						class="tool-step"
					>
						<summary><Icon :icon="action.success ? 'check' : 'exclamation-circle'" /> {{ labels[action.tool ?? ''] || action.tool }} · {{ action.success ? t('tcymc.text.succeeded') : t('tcymc.text.failed') }} · {{ seconds(action.duration_ms) }}</summary>
						<strong>{{ t('chat.arguments') }}</strong><pre>{{ pretty(action.arguments) }}</pre><strong>{{ t('chat.actualResult') }}</strong><pre>{{ pretty(action.result) }}</pre>
					</details>
				</section>
			</details>
			<div
				v-if="answer"
				class="chat-markdown content"
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
			<div
				v-if="!running"
				class="run-metrics"
			>
				<span>{{ t('chat.totalTime') }}: {{ seconds(result?.duration_ms) }}</span><span>{{ t('chat.firstToken') }}: {{ seconds(result?.first_token_ms) }}</span><span>{{ t('chat.firstText') }}: {{ seconds(result?.first_text_ms) }}</span>
				<span v-if="result?.usage?.reported">{{ t('chat.inputTokens') }}: {{ result.usage.input }} · {{ t('chat.outputTokens') }}: {{ result.usage.output }} · {{ t('chat.totalTokens') }}: {{ (result.usage.input ?? 0) + (result.usage.output ?? 0) }}</span>
				<span v-else>{{ t('chat.tokens') }}: {{ t('chat.unavailable') }}</span>
				<span v-if="result?.usage?.reported && result.usage.partial">{{ t('chat.partialUsage') }}</span>
				<span v-if="result?.usage?.cache_reported">{{ t('chat.cacheTokens') }}: {{ result.usage.cached }}</span><span v-if="result?.usage?.reasoning_reported">{{ t('chat.reasoningTokens') }}: {{ result.usage.reasoning }}</span>
			</div>
			<details
				v-if="result?.system_prompt"
				class="request-details"
			>
				<summary>{{ t('chat.requestDetails') }}</summary><p>{{ t('chat.requestedModel') }}: {{ result.requested_model }} · {{ result.protocol }}</p><code>{{ result.endpoint }}</code><pre>{{ result.system_prompt }}</pre><p>{{ t('chat.metricNotes') }}</p>
			</details>
			<div class="message-actions">
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
	margin-block: 1.5rem 2rem;
}
.user-message {
	display: flex;
	gap: .75rem;
	margin-inline-start: 8%;
	padding: 1rem;
	border-radius: 1rem;
	background: var(--grey-100);
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
	margin-block-start: 1rem;
}
.assistant-identity {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: .5rem;
	margin-block-end: .875rem;
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
	background: var(--primary);
	color: var(--primary-invert);
}
.model-badge, .run-status {
	padding: .2rem .5rem;
	border-radius: .375rem;
	background: var(--grey-100);
	color: var(--text-light);
	font-size: .75rem;
	overflow-wrap: anywhere;
}
.execution {
	border: 1px solid var(--grey-200);
	border-radius: .75rem;
	margin-block-end: 1rem;
	padding: .75rem;
	font-size: .85rem;
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
	font-size: .8rem;
	color: var(--text-light);
}
.request-details code {
	display: block;
	overflow-wrap: anywhere;
}
.message-actions {
	display: flex;
	flex-wrap: wrap;
	gap: .75rem;
	margin-block-start: .5rem;
}
.message-action {
	display: inline-flex;
	align-items: center;
	gap: .5rem;
	min-block-size: 44px;
	font-size: .8rem;
	color: var(--text-light);
}
</style>
