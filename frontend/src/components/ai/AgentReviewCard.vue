<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {ChatTurn, ReviewInput} from '@/client/generated'
const props = defineProps<{turn: ChatTurn; busy: boolean}>()
const emit = defineEmits<{review: [input: ReviewInput]}>()
const {t} = useI18n({useScope: 'global'})
const args = ref('')
const answer = ref('')
const editing = ref(false)
const pending = computed(() => props.turn.result?.pending)
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
			return Object.entries(changes).filter(([field]) => field !== 'id' && field !== 'updates').map(([field, after]) => ({id: task.id, title: task.title, field, before: task[field], after}))
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
		:aria-label="t('agent.reviewTitle')"
	>
		<template v-if="pause === 'review' && pending">
			<h3><Icon icon="eye" /> {{ t('agent.reviewTitle') }}</h3>
			<p>{{ t('agent.reviewDescription') }}</p>
			<p><strong>{{ pending.tool }}</strong> · {{ t('agent.targets', {count: pending.units}) }}</p>
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
	padding: 1rem;
	border: 1px solid var(--primary);
	border-radius: .75rem;
	background: var(--grey-50);
	margin-block: 1rem;
	overflow-wrap: anywhere;
}
h3 {
	font-size: 1rem;
	margin-block: 0 .5rem;
}
p, label, details {
	margin-block: .75rem;
}
label {
	display: block;
}
.review-actions {
	display: flex;
	flex-wrap: wrap;
	gap: .5rem;
	margin-block-start: .75rem;
}
.change-table {
	overflow-x: auto;
	max-inline-size: 100%;
}
table {
	inline-size: 100%;
	font-size: .8rem;
	border-collapse: collapse;
}
th, td {
	text-align: start;
	border-block-end: 1px solid var(--grey-200);
	padding: .5rem;
	min-inline-size: 6rem;
	max-inline-size: 20rem;
	overflow-wrap: anywhere;
	white-space: pre-wrap;
}
pre {
	white-space: pre-wrap;
	max-block-size: 20rem;
	overflow: auto;
	font-size: .8rem;
}
.argument-editor {
	font-family: monospace;
}
</style>
