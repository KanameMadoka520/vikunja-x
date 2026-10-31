<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {ChatTurn, ReviewInput} from '@/client/generated'
import {DESTRUCTIVE_TOOLS, toolLabels} from './toolLabels'
const props = defineProps<{turn: ChatTurn; busy: boolean}>()
const emit = defineEmits<{review: [input: ReviewInput]}>()
const {t} = useI18n({useScope: 'global'})
const args = ref('')
const answer = ref('')
const editing = ref(false)
const pending = computed(() => props.turn.result?.pending)
const toolName = computed(() => {
	const tool = pending.value?.tool ?? ''
	return toolLabels(t)[tool] || tool
})
const destructive = computed(() => DESTRUCTIVE_TOOLS.has(pending.value?.tool ?? ''))
const canContinue = computed(() => (props.turn.result?.budget?.round_limit ?? 0) < 200 && (props.turn.result?.budget?.operation_limit ?? 0) < 1000)
const pause = computed(() => props.turn.result?.pause)
watch(() => pending.value?.id, () => {
	args.value = pretty(pending.value?.arguments)
	editing.value = false
}, {immediate: true})
function pretty(value?: string) {
	try { return JSON.stringify(JSON.parse(value ?? ''), null, 2) } catch { return value ?? '' }
}
const valid = computed(() => { try { const parsed = JSON.parse(args.value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) } catch { return false } })
const rows = computed(() => {
	try {
		const before = JSON.parse(pending.value?.before ?? 'null')
		const proposed = JSON.parse(pending.value?.arguments ?? '{}')
		if (!Array.isArray(before)) return []
		return before.flatMap((task: Record<string, unknown>) => {
			const changes = proposed.updates?.find((u: {id: number}) => u.id === task.id)?.changes ?? proposed
			return Object.entries(changes).filter(([field]) => field !== 'id' && field !== 'updates').map(([field, after]) => ({
				id: task.id,
				title: task.title,
				field,
				before: task[pending.value?.tool === 'set_project_completed' && field === 'completed' ? 'is_completed' : field],
				after,
			}))
		})
	} catch { return [] }
})
function display(value: unknown) { return typeof value === 'string' ? value : JSON.stringify(value) ?? '—' }
function decide(decision: ReviewInput['decision']) {
	if (props.busy) return
	emit('review', {turn_id: props.turn.id!, operation_id: pending.value?.id ?? '', decision, arguments: decision === 'edit' ? args.value : '', answer: answer.value})
}
</script>

<template>
	<section
		v-if="pause"
		class="agent-review"
		:class="{'is-destructive': pause === 'review' && destructive}"
		:aria-label="t('agent.reviewTitle')"
	>
		<template v-if="pause === 'review' && pending">
			<h3><Icon icon="eye" /> {{ t('agent.reviewTitle') }}</h3>
			<p class="review-description">
				{{ t('agent.reviewDescription') }}
			</p>
			<p class="review-target">
				<strong :title="pending.tool">{{ toolName }}</strong> · {{ t('agent.targets', {count: pending.units}) }}
			</p>
			<p
				v-if="destructive"
				class="destructive-warning"
			>
				<Icon icon="exclamation-circle" />{{ t('agent.destructiveWarning') }}
			</p>
			<div
				v-if="rows.length"
				class="change-table"
			>
				<table>
					<thead><tr><th>{{ t('agent.task') }}</th><th>{{ t('agent.field') }}</th><th>{{ t('agent.before') }}</th><th>{{ t('agent.after') }}</th></tr></thead><tbody>
						<tr
							v-for="(row, index) in rows"
							:key="index"
						>
							<td>#{{ row.id }} {{ row.title }}</td><td>{{ t(`agent.fields.${row.field}`, row.field) }}</td><td>{{ display(row.before) }}</td><td>{{ display(row.after) }}</td>
						</tr>
					</tbody>
				</table>
			</div>
			<details v-else>
				<summary>{{ t('agent.exactArguments') }}</summary><pre>{{ pretty(pending.arguments) }}</pre>
			</details>
			<details><summary>{{ t('agent.snapshot') }}</summary><pre>{{ pretty(pending.before) }}</pre></details>
			<label v-if="editing">{{ t('agent.editArguments') }}<textarea
				v-model="args"
				class="textarea argument-editor"
				rows="10"
				maxlength="64000"
				spellcheck="false"
			/></label>
			<p v-if="editing && !valid">
				{{ t('agent.invalidJSON') }}
			</p>
			<div class="review-actions">
				<XButton
					v-if="!editing"
					icon="check"
					:disabled="busy"
					@click="decide('approve')"
				>
					{{ t('agent.approve') }}
				</XButton>
				<XButton
					v-if="editing"
					:disabled="busy || !valid"
					@click="decide('edit')"
				>
					{{ t('agent.updatePreview') }}
				</XButton>
				<XButton
					variant="secondary"
					:disabled="busy"
					@click="editing = !editing"
				>
					{{ editing ? t('misc.cancel') : t('agent.edit') }}
				</XButton>
				<XButton
					variant="secondary"
					class="reject-button"
					danger
					:disabled="busy"
					@click="decide('reject')"
				>
					{{ t('agent.reject') }}
				</XButton>
			</div>
		</template>
		<template v-else-if="pause === 'question'">
			<h3>{{ t('agent.questionTitle') }}</h3><p>{{ turn.result?.question }}</p>
			<div class="review-actions">
				<XButton
					v-for="choice in turn.result?.choices"
					:key="choice"
					variant="secondary"
					:disabled="busy"
					@click="answer = choice"
				>
					{{ choice }}
				</XButton>
			</div>
			<label>{{ t('agent.answer') }}<textarea
				v-model="answer"
				class="textarea"
				maxlength="12000"
				rows="3"
			/></label>
			<XButton
				:disabled="busy || !answer.trim()"
				@click="decide('answer')"
			>
				{{ t('agent.sendAnswer') }}
			</XButton>
		</template>
		<template v-else-if="pause === 'budget'">
			<h3>{{ t('agent.budgetPaused') }}</h3><p>{{ t('agent.budgetExplanation') }}</p>
			<p>{{ t('agent.budgetProgress', {rounds: turn.result?.budget?.rounds, roundLimit: turn.result?.budget?.round_limit, operations: turn.result?.budget?.operations, operationLimit: turn.result?.budget?.operation_limit}) }}</p>
			<p v-if="!canContinue">
				{{ t('agent.overallLimit') }}
			</p>
			<XButton
				:disabled="busy || !canContinue"
				@click="decide('continue')"
			>
				{{ t('agent.continue') }}
			</XButton>
		</template>
	</section>
</template>

<style scoped lang="scss">
.agent-review {
	margin-block: var(--space-3);
	padding: var(--space-3) var(--space-4);
	border: 1px solid var(--border-default);
	border-inline-start: 3px solid var(--primary);
	border-radius: var(--radius-md);
	background: var(--surface);
	box-shadow: var(--elevation-1);
	color: var(--text-primary);
	font-size: var(--text-md);
	overflow-wrap: anywhere;

	&.is-destructive {
		border-inline-start-color: var(--danger);
	}
}

h3 {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	margin-block: 0 var(--space-2);
	color: var(--text-primary);
	font-size: var(--text-base);
	font-weight: var(--weight-semibold);

	svg {
		color: var(--text-tertiary);
	}
}

p,
label,
details {
	margin-block: var(--space-2);
}

.review-description {
	color: var(--text-secondary);
	font-size: var(--text-sm);
}

.destructive-warning {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	padding: var(--space-2) var(--space-3);
	border-radius: var(--radius-sm);
	background: var(--tint-danger);
	color: var(--text-primary);
	font-size: var(--text-sm);

	svg {
		flex-shrink: 0;
		color: var(--danger-text);
	}
}

label {
	display: block;
	color: var(--text-secondary);
	font-size: var(--text-sm);
	font-weight: var(--weight-semibold);
}

summary {
	color: var(--text-secondary);
	font-size: var(--text-sm);
	cursor: pointer;
}

.review-actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
	margin-block-start: var(--space-3);
}

.change-table {
	max-inline-size: 100%;
	overflow-x: auto;
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-sm);
}

table {
	inline-size: 100%;
	border-collapse: collapse;
	font-size: var(--text-sm);
}

th,
td {
	min-inline-size: 6rem;
	max-inline-size: 20rem;
	padding: var(--space-2);
	border-block-end: 1px solid var(--border-subtle);
	text-align: start;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

th {
	background: var(--surface-sunken);
	color: var(--text-secondary);
	font-weight: var(--weight-semibold);
}

tbody tr:last-child td {
	border-block-end: 0;
}

pre {
	max-block-size: 20rem;
	overflow: auto;
	white-space: pre-wrap;
	font-family: var(--font-mono);
	font-size: var(--text-xs);
}

.argument-editor {
	font-family: var(--font-mono);
	font-size: var(--text-sm);
}
</style>
