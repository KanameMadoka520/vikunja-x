<template>
	<div class="control repeat-after-input">
		<div class="repeat-presets">
			<XButton
				variant="secondary"
				class="is-small"
				:shadow="false"
				:disabled="disabled"
				@click="() => setRepeatAfter(1, 'days')"
			>
				{{ $t('task.repeat.everyDay') }}
			</XButton>
			<XButton
				variant="secondary"
				class="is-small"
				:shadow="false"
				:disabled="disabled"
				@click="() => setRepeatAfter(1, 'weeks')"
			>
				{{ $t('task.repeat.everyWeek') }}
			</XButton>
			<XButton
				variant="secondary"
				class="is-small"
				:shadow="false"
				:disabled="disabled"
				@click="() => setRepeatAfter(30, 'days')"
			>
				{{ $t('task.repeat.every30d') }}
			</XButton>
		</div>
		<div class="repeat-row">
			<label
				for="repeatMode"
				class="repeat-label"
			>
				{{ $t('task.repeat.mode') }}
			</label>
			<div class="select">
				<select
					id="repeatMode"
					v-model="task.repeat_mode"
					:disabled="disabled || undefined"
					@change="updateData"
				>
					<option :value="TASK_REPEAT_MODES.REPEAT_MODE_DEFAULT">
						{{ $t('misc.default') }}
					</option>
					<option :value="TASK_REPEAT_MODES.REPEAT_MODE_MONTH">
						{{ $t('task.repeat.monthly') }}
					</option>
					<option :value="TASK_REPEAT_MODES.REPEAT_MODE_FROM_CURRENT_DATE">
						{{ $t('task.repeat.fromCurrentDate') }}
					</option>
				</select>
			</div>
		</div>
		<div
			v-if="task.repeat_mode !== TASK_REPEAT_MODES.REPEAT_MODE_MONTH"
			class="repeat-row"
		>
			<label
				:for="amountId"
				class="repeat-label"
			>
				{{ $t('task.repeat.each') }}
			</label>
			<div class="field has-addons repeat-amount">
				<div class="control">
					<input
						:id="amountId"
						v-model="repeatAfter.amount"
						:disabled="disabled || undefined"
						class="input"
						:placeholder="$t('task.repeat.specifyAmount')"
						type="number"
						min="0"
						@change="updateData"
					>
				</div>
				<div class="control">
					<div class="select">
						<select
							v-model="repeatAfter.type"
							:disabled="disabled || undefined"
							:aria-label="$t('task.reminder.periodUnit')"
							@change="updateData"
						>
							<option value="hours">
								{{ $t('task.repeat.hours') }}
							</option>
							<option value="days">
								{{ $t('task.repeat.days') }}
							</option>
							<option value="weeks">
								{{ $t('task.repeat.weeks') }}
							</option>
						</select>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {ref, reactive, useId, watch} from 'vue'
import {useI18n} from 'vue-i18n'

import {error} from '@/message'

import {TASK_REPEAT_MODES} from '@/types/IRepeatMode'
import type {IRepeatAfter} from '@/types/IRepeatAfter'
import type {Task as ITask} from '@/client/generated'
import {createTaskDraft, parseRepeatAfter, repeatAfterToSeconds} from '@/helpers/task'

const props = withDefaults(defineProps<{
	modelValue: ITask | undefined,
	disabled?: boolean
}>(), {
	disabled: false,
})

const emit = defineEmits<{
	'update:modelValue': [value: ITask | undefined],
}>()

const {t} = useI18n({useScope: 'global'})
const amountId = useId()

const task = ref<ITask>(createTaskDraft())
const repeatAfter = reactive({
	amount: 0,
	type: '',
})

// Only the repeat values reset the inputs: an unrelated live update must not wipe an amount being typed.
watch(
	[
		() => props.modelValue?.id,
		() => props.modelValue?.repeat_after,
		() => props.modelValue?.repeat_mode,
	],
	() => {
		const value = props.modelValue
		if (!value) return
		task.value = {...value}
		if (typeof value.repeat_after !== 'undefined') {
			Object.assign(repeatAfter, parseRepeatAfter(value.repeat_after))
		}
	},
	{immediate: true},
)

function updateData() {
	if (!task.value || 
		(task.value.repeat_mode === TASK_REPEAT_MODES.REPEAT_MODE_DEFAULT && repeatAfter.amount === 0) ||
		(task.value.repeat_mode === TASK_REPEAT_MODES.REPEAT_MODE_FROM_CURRENT_DATE && repeatAfter.amount === 0)
	) {
		return
	}

	if (task.value.repeat_mode === TASK_REPEAT_MODES.REPEAT_MODE_DEFAULT && repeatAfter.amount < 0) {
		error({message: t('task.repeat.invalidAmount')})
		return
	}

	task.value.repeat_after = repeatAfterToSeconds(repeatAfter as IRepeatAfter)
	emit('update:modelValue', {
		...props.modelValue,
		repeat_after: task.value.repeat_after,
		repeat_mode: task.value.repeat_mode,
	})
}

function setRepeatAfter(amount: number, type: IRepeatAfter['type']) {
	Object.assign(repeatAfter, { amount, type})
	updateData()
}
</script>

<style lang="scss" scoped>
.repeat-after-input {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
}

.repeat-presets {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-1);
}

.repeat-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-1) var(--space-3);
}

.repeat-label {
	min-inline-size: 6rem;
	color: var(--text-secondary);
	font-size: var(--text-sm);
}

.repeat-amount {
	margin-block-end: 0;

	.input {
		inline-size: 6rem;
		min-inline-size: 3rem;
	}
}
</style>
