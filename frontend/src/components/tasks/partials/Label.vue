<script setup lang="ts">
import type {Label} from '@/client/generated'
import {getLabelColor, useLabelStyles} from '@/composables/useLabelStyles'

withDefaults(defineProps<{
	label: Label
	// Dense rows show a neutral chip with the label colour as a dot instead of a filled tag.
	compact?: boolean
}>(), {
	compact: false,
})

const {getLabelStyles} = useLabelStyles()
</script>

<template>
	<span
		:key="label.id"
		:style="compact ? undefined : getLabelStyles(label)"
		class="tag"
		:class="{'is-compact': compact}"
	>
		<span
			v-if="compact"
			class="label-dot"
			:style="{backgroundColor: getLabelColor(label) || undefined}"
			aria-hidden="true"
		/>
		<span class="label-title">{{ label.title }}</span>
	</span>
</template>

<style lang="scss" scoped>
.tag.is-compact {
	gap: var(--space-1);
	max-inline-size: 9rem;
	block-size: 1.25rem;
	padding-inline: var(--space-2);
	border: 1px solid var(--border-default);
	border-radius: var(--radius-full);
	background: transparent;
	color: var(--text-secondary);
	font-size: var(--text-xs);
	font-weight: var(--weight-medium);
	line-height: 1;
}

.label-dot {
	flex-shrink: 0;
	inline-size: .5rem;
	block-size: .5rem;
	border-radius: var(--radius-full);
	background-color: var(--text-tertiary);
}

.is-compact .label-title {
	min-inline-size: 0;
	overflow: hidden;
	text-overflow: ellipsis;
}
</style>
