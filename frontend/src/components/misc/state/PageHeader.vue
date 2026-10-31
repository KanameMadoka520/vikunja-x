<template>
	<header class="page-header">
		<div class="page-header__text">
			<h1 class="page-header__title">
				<slot name="title">
					{{ title }}
				</slot>
			</h1>
			<p
				v-if="description || $slots.description"
				class="page-header__description"
			>
				<slot name="description">
					{{ description }}
				</slot>
			</p>
		</div>
		<div
			v-if="$slots.actions"
			class="page-header__actions"
		>
			<slot name="actions" />
		</div>
	</header>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
	title?: string
	description?: string
}>(), {
	title: '',
	description: '',
})
</script>

<style lang="scss" scoped>
.page-header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	justify-content: space-between;
	gap: var(--space-3) var(--space-4);
	margin-block-end: var(--space-5);
}

.page-header__text {
	min-inline-size: 0;
	flex: 1 1 18rem;
}

.page-header__title {
	margin: 0;
	font-size: var(--text-2xl);
	line-height: var(--leading-tight);
	overflow-wrap: anywhere;

	@media screen and (max-width: $tablet) {
		font-size: var(--text-xl);
	}
}

.page-header__description {
	margin-block-start: var(--space-1);
	color: var(--text-secondary);
	font-size: var(--text-md);
	max-inline-size: 70ch;
}

.page-header__actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-2);
}
</style>
