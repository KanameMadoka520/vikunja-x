<template>
	<div
		v-if="isDone"
		class="is-done"
		:class="{ 'is-done--small': variant === 'small' }"
	>
		{{ $t('task.attributes.done') }}
	</div>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{
	isDone?: boolean
	variant?: 'default' | 'small'
}>(), {
	isDone: false,
	variant: 'default',
})
</script>


<style lang="scss" scoped>
.is-done {
	background: var(--success);
	color: var(--text-on-success);
	padding: var(--space-1) var(--space-2);
	font-size: var(--text-sm);
	font-weight: var(--weight-semibold);
	line-height: var(--leading-tight);
	border-radius: var(--radius-sm);
	text-align: center;
}

.is-done--small {
	padding: 2px var(--space-1);
	font-size: var(--text-xs);
}
</style>
