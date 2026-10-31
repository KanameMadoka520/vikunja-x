<template>
	<div
		class="task"
		:data-is-overdue="(dueDate && dueDate <= new Date()) && !task.done || undefined"
	>
		<span>
			<span
				v-if="showProject && typeof project !== 'undefined'"
				v-tooltip="$t('task.detail.belongsToProject', {project: project.title})"
				class="task-project"
				:class="{'mie-2': task.hex_color !== ''}"
			>
				{{ project.title }}
			</span>

			<ColorBubble
				v-if="task.hex_color !== ''"
				:color="getHexColor(task.hex_color)"
				class="mie-1"
			/>

			<PriorityLabel
				:priority="task.priority ?? 0"
				:done="task.done"
			/>

			<!-- Show any parent tasks to make it clear this task is a sub task of something -->
			<span
				v-if="typeof task.related_tasks?.parenttask !== 'undefined'"
				class="parent-tasks"
			>
				<template v-for="(pt, i) in task.related_tasks.parenttask">
					{{ pt.title }}<template v-if="(i + 1) < (task.related_tasks.parenttask?.length ?? 0)">,&nbsp;</template>
				</template>
				&rsaquo;
			</span>
			{{ task.title }}
		</span>

		<Labels
			v-if="(task.labels?.length ?? 0) > 0"
			class="labels"
			:labels="task.labels ?? []"
			:max="2"
			compact
		/>

		<AssigneeList
			v-if="(task.assignees?.length ?? 0) > 0"
			:assignees="task.assignees ?? []"
			:avatar-size="20"
			:inline="true"
			:show-usernames="false"
			:max="3"
		/>

		<span
			v-if="dueDate"
			v-tooltip="formatDateLong(task.due_date)"
			class="dueDate"
		>
			<Icon
				:icon="['far', 'calendar-alt']"
				aria-hidden="true"
			/>
			<time :datetime="formatISO(task.due_date)">
				{{ $t('task.detail.due', {at: formatDisplayDate(task.due_date)}) }}
			</time>
		</span>

		<span>
			<span
				v-if="(task.attachments?.length ?? 0) > 0"
				class="project-task-icon"
				role="img"
				:aria-label="$t('task.attributes.attachment', (task.attachments?.length ?? 0))"
			>
				<Icon icon="paperclip" />
			</span>
			<span
				v-if="task.description"
				class="project-task-icon is-mirrored-rtl"
				role="img"
				:aria-label="$t('task.attributes.description')"
			>
				<Icon icon="align-left" />
			</span>
			<span
				v-if="(task.repeat_after ?? 0) > 0"
				class="project-task-icon"
				role="img"
				:aria-label="$t('task.attributes.repeat')"
			>
				<Icon icon="history" />
			</span>
		</span>

		<ChecklistSummary
			:task="task"
			compact
		/>

		<progress
			v-if="(task.percent_done ?? 0) > 0"
			class="progress is-small"
			:value="(task.percent_done ?? 0) * 100"
			max="100"
			:aria-label="$t('task.attributes.percentDone')"
		>
			{{ (task.percent_done ?? 0) * 100 }}%
		</progress>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {parseDateOrNull} from '@/helpers/parseDateOrNull'

import {getHexColor} from '@/helpers/task'
import type {Task as ITask} from '@/client/generated'

import PriorityLabel from '@/components/tasks/partials/PriorityLabel.vue'
import Labels from '@/components/tasks/partials/Labels.vue'
import ChecklistSummary from '@/components/tasks/partials/ChecklistSummary.vue'

import ColorBubble from '@/components/misc/ColorBubble.vue'

import {formatDisplayDate, formatISO, formatDateLong} from '@/helpers/time/formatDate'

import {useProjects} from '@/composables/useProjects'
import AssigneeList from '@/components/tasks/partials/AssigneeList.vue'

const props = withDefaults(defineProps<{
	task: ITask,
	showProject?: boolean,
}>(), {
	showProject: false,
})

const projectList = useProjects()

const dueDate = computed(() => parseDateOrNull(props.task.due_date))
const project = computed(() => projectList.projects[props.task.project_id ?? 0])
</script>

<style lang="scss" scoped>
.task {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-1) var(--space-3);
	min-inline-size: 0;
	color: var(--text-primary);
	cursor: pointer;
	overflow-wrap: anywhere;

	.dueDate {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-secondary);
		font-size: var(--text-xs);
		white-space: nowrap;
	}

	&[data-is-overdue] .dueDate {
		color: var(--danger-text);
	}

	.task-project {
		color: var(--text-tertiary);
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	.project-task-icon {
		color: var(--text-tertiary);

		& + .project-task-icon {
			margin-inline-start: var(--space-2);
		}
	}

	.progress {
		inline-size: 2.5rem;
		block-size: 4px;
		margin: 0;
	}

	span.parent-tasks {
		color: var(--text-tertiary);
		margin-inline-start: var(--space-1);
	}
}
</style>
