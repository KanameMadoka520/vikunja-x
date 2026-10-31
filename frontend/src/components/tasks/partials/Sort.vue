<template>
	<BaseButton
		class="sort"
		:class="{'is-sorted': order === 'asc' || order === 'desc'}"
		:aria-label="label ? $t('project.table.sortBy', {column: label}) : $t('project.list.sort')"
	>
		<span
			v-if="$slots.default"
			class="sort__label"
		>
			<slot />
		</span>
		<Icon
			v-if="order === 'asc'"
			icon="sort-up"
			class="sort__icon"
		/>
		<Icon
			v-else-if="order === 'desc'"
			icon="sort-up"
			rotation="180"
			class="sort__icon"
		/>
		<Icon
			v-else
			icon="sort"
			class="sort__icon"
		/>
	</BaseButton>
</template>

<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'

withDefaults(defineProps<{
	order?: 'asc' | 'desc' | 'none'
	label?: string
}>(), {
	order: 'none',
	label: undefined,
})
</script>

<style lang="scss" scoped>
.sort {
	display: inline-flex;
	align-items: center;
	gap: var(--space-1);
	border-radius: var(--radius-xs);
	color: inherit;
	font: inherit;

	&:hover .sort__icon {
		color: var(--text-secondary);
	}

	&:focus-visible {
		@include focus-ring;
	}
}

.sort__icon {
	color: var(--text-tertiary);
	font-size: .85em;
}

.is-sorted .sort__icon {
	color: var(--accent-text);
}
</style>
