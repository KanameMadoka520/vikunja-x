<template>
	<span
		v-if="checklist.total > 0"
		class="checklist-summary"
		:class="{'is-compact': compact}"
	>
		<svg
			width="12"
			height="12"
			:class="{'is-all-done': allDone}"
			aria-hidden="true"
			focusable="false"
		>
			<circle
				stroke-width="2"
				fill="transparent"
				cx="50%"
				cy="50%"
				r="5"
			/>
			<circle
				stroke-width="2"
				stroke-dasharray="31"
				:stroke-dashoffset="checklistCircleDone"
				stroke-linecap="round"
				fill="transparent"
				cx="50%"
				cy="50%"
				r="5"
			/>
		</svg>
		<template v-if="compact">
			<span aria-hidden="true">{{ checklist.checked }}/{{ checklist.total }}</span>
			<span class="is-sr-only">{{ label }}</span>
		</template>
		<span v-else>{{ label }}</span>
	</span>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import { useI18n } from 'vue-i18n'

import {getChecklistStatistics} from '@/helpers/checklistFromText'
import type {Task as ITask} from '@/client/generated'

const props = withDefaults(defineProps<{
	task: ITask
	// Dense rows show "1/2"; the full sentence stays available to screen readers.
	compact?: boolean
}>(), {
	compact: false,
})

const checklist = computed(() => getChecklistStatistics((props.task.description ?? '')))

const checklistCircleDone = computed(() => {
	const r = 5
	const c = Math.PI * (r * 2)

	const progress = checklist.value.checked / checklist.value.total * 100

	return ((100 - progress) / 100) * c
})

const allDone = computed(() => checklist.value.total === checklist.value.checked)

const {t} = useI18n({useScope: 'global'})
const label = computed(() => {
	return allDone.value
		? t('task.checklistAllDone', {...checklist.value})
		: t('task.checklistTotal', {...checklist.value})
})
</script>

<style scoped lang="scss">
.checklist-summary {
	color: var(--text-tertiary);
	display: inline-flex;
	align-items: center;
	gap: var(--space-1);
	padding-inline-start: var(--space-2);
	font-size: var(--text-md);
	white-space: nowrap;

	&.is-compact {
		padding-inline-start: 0;
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}
}

svg {
	flex-shrink: 0;
	transform: rotate(-90deg);
}

circle {
	stroke: var(--border-strong);

	&:last-child {
		stroke: var(--primary);
	}
}

svg.is-all-done circle {
	&:last-child {
		stroke: var(--success);
	}
}
</style>
