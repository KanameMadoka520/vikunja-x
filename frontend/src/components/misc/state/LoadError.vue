<template>
	<div
		class="load-error"
		role="alert"
	>
		<Icon
			icon="exclamation-circle"
			class="load-error__icon"
			aria-hidden="true"
		/>
		<p class="load-error__message">
			<slot>{{ message || $t('misc.loadError') }}</slot>
		</p>
		<XButton
			v-if="retry"
			variant="secondary"
			class="is-small load-error__retry"
			:shadow="false"
			@click="retry()"
		>
			{{ $t('misc.retry') }}
		</XButton>
	</div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
	message?: string
	retry?: () => unknown
}>(), {
	message: '',
	retry: undefined,
})
</script>

<style lang="scss" scoped>
.load-error {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-2) var(--space-3);
	padding: var(--space-3) var(--space-4);
	border: 1px solid var(--border-subtle);
	border-inline-start: 3px solid var(--danger);
	border-radius: var(--radius-md);
	background: var(--tint-danger);
	color: var(--text-primary);
	font-size: var(--text-md);
}

.load-error__icon {
	color: var(--danger-text);
}

.load-error__message {
	flex: 1 1 14rem;
}
</style>
