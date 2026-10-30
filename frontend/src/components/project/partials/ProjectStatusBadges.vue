<template>
	<span
		v-if="isCompleted || isArchived || showActive"
		class="project-status-badges"
	>
		<span
			v-if="isCompleted"
			class="project-status status-completed"
		>
			<Icon
				icon="check"
				class="project-status-icon"
			/>{{ $t('projectStatus.completed') }}
		</span>
		<span
			v-if="isArchived"
			class="project-status status-archived"
		>
			<Icon
				icon="archive"
				class="project-status-icon"
			/>{{ $t('project.archived') }}
		</span>
		<span
			v-if="showActive && !isCompleted && !isArchived"
			class="project-status status-active"
		>{{ $t('projectStatus.active') }}</span>
	</span>
</template>

<script setup lang="ts">
import Icon from '@/components/misc/Icon'

withDefaults(defineProps<{
	isCompleted?: boolean
	isArchived?: boolean
	showActive?: boolean
}>(), {
	isCompleted: false,
	isArchived: false,
	showActive: false,
})
</script>

<style lang="scss" scoped>
.project-status-badges {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: center;
	gap: .25rem;
}

.project-status {
	display: inline-flex;
	align-items: center;
	gap: .25rem;
	padding: .125rem .5rem;
	border: 1px solid transparent;
	border-radius: 999px;
	font-size: .75rem;
	font-weight: 600;
	line-height: 1.4;
	white-space: nowrap;

	&.status-completed {
		background: hsla(var(--success-h), var(--success-s), var(--success-l), .14);
		border-color: hsla(var(--success-h), var(--success-s), var(--success-l), .35);
		color: color-mix(in srgb, var(--success) 42%, var(--text-strong));
	}

	&.status-archived {
		background: var(--grey-100);
		border-color: var(--grey-200);
		color: var(--text-muted);
	}

	&.status-active {
		background: hsla(var(--primary-hsl), .08);
		border-color: hsla(var(--primary-hsl), .25);
		color: var(--primary);
	}
}

.project-status-icon {
	inline-size: .65rem;
	block-size: .65rem;
}
</style>
