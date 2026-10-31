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
	gap: var(--space-1);
}

// Text stays in the normal colour for contrast; the icon and the tint carry the status.
.project-status {
	display: inline-flex;
	align-items: center;
	gap: var(--space-1);
	padding: 1px var(--space-2);
	border: 1px solid transparent;
	border-radius: var(--radius-full);
	color: var(--text-primary);
	font-size: var(--text-xs);
	font-weight: var(--weight-semibold);
	line-height: var(--leading-normal);
	white-space: nowrap;

	&.status-completed {
		border-color: hsla(var(--success-h), var(--success-s), var(--success-l), .35);
		background: var(--tint-success);

		.project-status-icon {
			color: var(--success);
		}
	}

	&.status-archived {
		border-color: var(--border-default);
		background: var(--surface-active);
		color: var(--text-secondary);
	}

	&.status-active {
		border-color: hsla(var(--primary-hsl), .25);
		background: var(--tint-info);
		color: var(--accent-text);
	}
}

.project-status-icon {
	inline-size: .625rem;
	block-size: .625rem;
}
</style>
