<template>
	<span
		class="settings-scope"
		:class="`is-${scope}`"
	>
		<Icon
			:icon="scope === 'site' ? 'server' : 'user'"
			class="settings-scope__icon"
			aria-hidden="true"
		/>
		<span><slot /></span>
	</span>
</template>

<script setup lang="ts">
defineProps<{
	scope: 'account' | 'site'
}>()
</script>

<style lang="scss" scoped>
.settings-scope {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	inline-size: fit-content;
	max-inline-size: 100%;
	margin-block-start: var(--space-2);
	padding: .125rem var(--space-3);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-full);
	background: var(--surface);
	color: var(--text-secondary);
	font-size: var(--text-xs);
	font-weight: var(--weight-medium);
	line-height: var(--leading-normal);

	&.is-site {
		border-color: hsla(var(--warning-h), var(--warning-s), var(--warning-l), .45);
		background: var(--tint-warning);
		color: var(--text-primary);
	}
}

.settings-scope__icon {
	flex-shrink: 0;
	color: var(--text-tertiary);

	.is-site & {
		color: var(--text-secondary);
	}
}
</style>
