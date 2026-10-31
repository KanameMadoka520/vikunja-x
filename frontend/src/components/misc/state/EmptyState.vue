<template>
	<div class="empty-state">
		<Icon
			v-if="icon"
			:icon="icon"
			class="empty-state__icon"
			aria-hidden="true"
		/>
		<p class="empty-state__title">
			<slot name="title">
				{{ title }}
			</slot>
		</p>
		<p
			v-if="description || $slots.description"
			class="empty-state__description"
		>
			<slot name="description">
				{{ description }}
			</slot>
		</p>
		<div
			v-if="$slots.default"
			class="empty-state__actions"
		>
			<slot />
		</div>
	</div>
</template>

<script setup lang="ts">
import type {IconProp} from '@fortawesome/fontawesome-svg-core'

defineProps<{
	title?: string
	description?: string
	icon?: IconProp
}>()
</script>

<style lang="scss" scoped>
.empty-state {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--space-2);
	padding: var(--space-5);
	border: 1px dashed var(--border-default);
	border-radius: var(--radius-md);
	background: var(--surface);
	color: var(--text-secondary);
}

.empty-state__icon {
	color: var(--text-tertiary);
	font-size: var(--text-lg);
}

.empty-state__title {
	color: var(--text-primary);
	font-weight: var(--weight-semibold);
}

.empty-state__description {
	font-size: var(--text-md);
	max-inline-size: 60ch;
}

.empty-state__actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
	margin-block-start: var(--space-1);
}
</style>
