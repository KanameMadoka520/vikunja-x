<template>
	<div
		v-if="labels?.length > 0"
		class="label-wrapper"
		:class="{'is-compact': compact}"
	>
		<XLabel
			v-for="label in shownLabels"
			:key="label.id"
			:label="label"
			:compact="compact"
		/>
		<span
			v-if="hiddenLabels.length > 0"
			v-tooltip="hiddenTitles"
			class="tag label-more"
			:class="{'is-compact': compact}"
		>
			<span aria-hidden="true">+{{ hiddenLabels.length }}</span>
			<span class="is-sr-only">{{ hiddenTitles }}</span>
		</span>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'

import type {Label} from '@/client/generated'
import XLabel from '@/components/tasks/partials/Label.vue'

const props = withDefaults(defineProps<{
	labels: Label[],
	// Show at most this many labels and a "+N" chip for the rest.
	max?: number,
	compact?: boolean,
}>(), {
	max: undefined,
	compact: false,
})

const displayLabels = computed(() =>
	Array.from(new Map(props.labels.map(label => [label.id, label])).values())
		.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')),
)

const shownLabels = computed(() => props.max === undefined
	? displayLabels.value
	: displayLabels.value.slice(0, props.max))
const hiddenLabels = computed(() => displayLabels.value.slice(shownLabels.value.length))
const hiddenTitles = computed(() => hiddenLabels.value.map(label => label.title).join(', '))
</script>

<style lang="scss" scoped>
.label-wrapper {
	display: inline-flex;
	flex-wrap: wrap;
	gap: var(--space-1);
	align-items: flex-start;
	min-inline-size: 0;

	:deep(.tag) {
		margin: 0;
	}

	&.is-compact {
		align-items: center;
	}
}

.label-more {
	background: var(--surface-sunken);
	color: var(--text-secondary);
	font-variant-numeric: tabular-nums;

	&.is-compact {
		block-size: 1.25rem;
		padding-inline: var(--space-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-full);
		background: transparent;
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}
}
</style>
