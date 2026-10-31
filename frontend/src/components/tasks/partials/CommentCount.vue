<template>
	<span
		v-if="task.comment_count && task.comment_count > 0"
		v-tooltip="tooltip"
		class="comment-count"
		:class="{'is-unread': task.is_unread}"
		role="img"
		:aria-label="tooltip"
	>
		<Icon :icon="['far', 'comments']" />
		<span class="comment-count-badge">{{ task.comment_count }}</span>
		<span
			v-if="task.is_unread"
			class="unread-indicator"
		/>
	</span>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'

import type {Task as ITask} from '@/client/generated'

const props = defineProps<{
	task: ITask
}>()

const {t} = useI18n({useScope: 'global'})

const tooltip = computed(() => t('task.attributes.comment', props.task.comment_count ?? 0))
</script>

<style scoped lang="scss">
.comment-count {
	display: inline-flex;
	align-items: center;
	gap: var(--space-1);
	font-size: var(--text-md);
	color: var(--text-tertiary);

	.comment-count-badge {
		font-weight: var(--weight-semibold);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	&:hover {
		color: var(--accent-text);
	}

	&.is-unread {
		font-weight: var(--weight-semibold);
		color: var(--accent-text);

		.unread-indicator {
			display: inline-block;
			inline-size: .375rem;
			block-size: .375rem;
			background-color: var(--primary);
			border-radius: var(--radius-full);
			margin-inline-start: .125rem;
		}
	}
}
</style>
