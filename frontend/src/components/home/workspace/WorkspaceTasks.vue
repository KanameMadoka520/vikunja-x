<template>
	<section
		v-cy="'showTasks'"
		class="workspace-tasks show-tasks"
		aria-labelledby="workspace-tasks-heading"
		:aria-busy="taskQuery.isFetching.value"
	>
		<header class="workspace-tasks-header">
			<h2
				id="workspace-tasks-heading"
				class="is-sr-only"
			>
				{{ viewTitle }}
			</h2>
			<SegmentedControl
				v-model="view"
				:options="viewOptions"
				:label="$t('workspace.taskViews')"
			/>
			<p
				v-if="hasData && total > 0"
				class="workspace-tasks-count"
			>
				{{ $t('workspace.taskCount', total) }}
			</p>
		</header>

		<Message
			v-if="filteredLabels.length > 0"
			class="label-filter-info"
		>
			<i18n-t
				keypath="task.show.filterByLabel"
				tag="span"
				class="filter-label-text"
			>
				<template #label>
					<XLabel
						v-for="label in filteredLabels"
						:key="label.id"
						:label="label"
					/>
				</template>
			</i18n-t>
			<BaseButton
				v-tooltip="$t('task.show.clearLabelFilter')"
				class="clear-filter-button"
				:aria-label="$t('task.show.clearLabelFilter')"
				@click="emit('clearLabelFilter')"
			>
				<Icon icon="times" />
			</BaseButton>
		</Message>
		<Message
			v-if="savedFilterIgnored"
			class="mbe-2"
		>
			{{ $t('task.show.savedFilterIgnored') }}
		</Message>

		<div
			v-if="projectsFailed"
			class="workspace-error"
			role="alert"
		>
			<p>{{ $t('workspace.loadError') }}</p>
			<XButton
				variant="secondary"
				icon="arrow-rotate-right"
				@click="projectList.refetch()"
			>
				{{ $t('projectHistory.retry') }}
			</XButton>
		</div>

		<div
			v-else-if="!hasProjects"
			class="workspace-empty"
			data-empty="no-projects"
		>
			<p class="workspace-empty-title">
				{{ $t('workspace.noProjects') }}
			</p>
			<XButton
				:to="{name: 'project.create'}"
				icon="plus"
			>
				{{ $t('project.create.header') }}
			</XButton>
		</div>

		<div
			v-else-if="taskQuery.isError.value && !hasData"
			class="workspace-error"
			role="alert"
		>
			<p>{{ $t('workspace.loadError') }}</p>
			<XButton
				variant="secondary"
				icon="arrow-rotate-right"
				@click="taskQuery.refetch()"
			>
				{{ $t('projectHistory.retry') }}
			</XButton>
		</div>

		<ul
			v-else-if="!hasData"
			class="workspace-skeleton"
			:aria-label="$t('misc.loading')"
		>
			<li
				v-for="row in 4"
				:key="row"
			/>
		</ul>

		<div
			v-else-if="tasks.length === 0"
			class="workspace-empty"
		>
			<p class="workspace-empty-title">
				{{ emptyMessage }}
			</p>
			<RouterLink
				v-if="view !== 'current'"
				:to="{name: 'tasks.range'}"
				class="workspace-empty-link"
			>
				{{ $t('workspace.seeUpcoming') }}
			</RouterLink>
		</div>

		<Card
			v-else
			:padding="false"
			:has-content="false"
			:loading="taskQuery.isFetching.value"
			class="workspace-task-card has-overflow"
		>
			<section
				v-for="group in groups"
				:key="group.key"
				class="task-group"
				:data-group="group.key"
				:aria-labelledby="view === 'current' ? `workspace-group-${group.key}` : undefined"
			>
				<h3
					v-if="view === 'current'"
					:id="`workspace-group-${group.key}`"
					class="task-group-heading"
				>
					<span>{{ groupLabel(group.key) }}</span>
					<span class="task-group-count">{{ group.tasks.length }}</span>
				</h3>
				<ul class="tasks">
					<li
						v-for="task in group.tasks"
						:key="task.id"
					>
						<SingleTaskInProject
							:show-project="true"
							:the-task="task"
							:can-mark-as-done="canMarkAsDone(task)"
							@taskUpdated="refetch"
						/>
					</li>
				</ul>
			</section>
		</Card>

		<footer
			v-if="hasProjects && hasData && tasks.length > 0"
			class="workspace-tasks-footer"
		>
			<nav
				v-if="totalPages > 1"
				class="workspace-pagination"
				:aria-label="$t('workspace.pagination')"
			>
				<XButton
					variant="tertiary"
					:shadow="false"
					:aria-disabled="page <= 1 || undefined"
					@click="goToPage(page - 1)"
				>
					<Icon
						icon="angle-left"
						class="mie-1 is-mirrored-rtl"
					/>
					{{ $t('misc.previous') }}
				</XButton>
				<span class="workspace-page-status">
					{{ $t('workspace.pageStatus', {from: rangeStart, to: rangeEnd, total}) }}
				</span>
				<XButton
					variant="tertiary"
					:shadow="false"
					:aria-disabled="page >= totalPages || undefined"
					@click="goToPage(page + 1)"
				>
					{{ $t('misc.next') }}
					<Icon
						icon="angle-right"
						class="mis-1 is-mirrored-rtl"
					/>
				</XButton>
			</nav>
			<RouterLink
				:to="{name: 'tasks.range'}"
				class="workspace-upcoming-link"
			>
				{{ $t('workspace.seeUpcoming') }}
				<Icon
					icon="angle-right"
					class="is-mirrored-rtl"
				/>
			</RouterLink>
		</footer>
	</section>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'

import BaseButton from '@/components/base/BaseButton.vue'
import Icon from '@/components/misc/Icon'
import Message from '@/components/misc/Message.vue'
import SegmentedControl from '@/components/input/SegmentedControl.vue'
import SingleTaskInProject from '@/components/tasks/partials/SingleTaskInProject.vue'
import XLabel from '@/components/tasks/partials/Label.vue'

import {useAuthStore} from '@/stores/auth'
import {useProjects} from '@/composables/useProjects'
import {useLabels} from '@/composables/useLabels'
import {useTasks} from '@/composables/useTasks'
import {useGlobalNow} from '@/composables/useGlobalNow'
import {resolveUserTimezone} from '@/helpers/time/userTimezone'
import {PERMISSIONS} from '@/constants/permissions'
import type {TaskResponse} from '@/client/queries/tasks'
import {
	buildWorkspaceTaskScope,
	calendarDay,
	groupTasksByDue,
	type DueGroup,
	type WorkspaceTaskView,
} from '@/helpers/workspaceTasks'

const props = defineProps<{
	labelIds?: string[]
}>()

const emit = defineEmits<{
	'tasksLoaded': [loaded: true],
	'clearLabelFilter': [],
}>()

const {t} = useI18n({useScope: 'global'})
const authStore = useAuthStore()
const projectList = useProjects()
const {getLabelById} = useLabels()
const {now} = useGlobalNow()

const view = defineModel<WorkspaceTaskView>('view', {required: true})

const viewOptions = computed(() => [
	{
		value: 'current' as const,
		label: t('workspace.views.current'),
	},
	{
		value: 'today' as const,
		label: t('input.datepicker.today'),
	},
	{
		value: 'overdue' as const,
		label: t('workspace.groups.overdue'),
	},
])
const viewTitle = computed(() => {
	switch (view.value) {
		case 'today':
			return t('input.datepicker.today')
		case 'overdue':
			return t('workspace.groups.overdue')
		default:
			return t('task.show.titleCurrent')
	}
})
const emptyMessage = computed(() => {
	switch (view.value) {
		case 'today':
			return t('workspace.emptyToday')
		case 'overdue':
			return t('workspace.emptyOverdue')
		default:
			return t('task.show.noTasks')
	}
})

const timezone = computed(() => resolveUserTimezone(authStore.settings.timezone))
const labelIds = computed(() => props.labelIds ?? [])
const savedFilterId = computed(() => {
	const id = authStore.settings?.frontend_settings?.filter_id_used_on_overview
	return id && typeof projectList.projects[id] !== 'undefined' ? id : null
})

const scope = computed(() => buildWorkspaceTaskScope({
	view: view.value,
	timezone: timezone.value,
	labelIds: labelIds.value,
	savedFilterId: savedFilterId.value,
}))

const page = ref(1)
watch(scope, () => {
	page.value = 1
})

const projectsFailed = computed(() => projectList.isError && projectList.projectsArray.length === 0)
const hasProjects = computed(() => projectList.isLoading || projectList.hasRealProjects)

const taskQuery = useTasks(scope, {
	enabled: () => authStore.authenticated && projectList.hasRealProjects,
	page,
	handlesError: true,
	keepPreviousPage: true,
})
const tasks = taskQuery.tasks
const total = taskQuery.total
const totalPages = taskQuery.totalPages
const hasData = computed(() => taskQuery.data.value !== undefined)

// Without real projects the task query never runs, but the page is still "loaded"
// for hints such as the import offer.
const settled = computed(() => taskQuery.data.value !== undefined
	|| (!projectList.isLoading && !projectList.isError && !projectList.hasRealProjects))
watch(settled, isSettled => {
	if (isSettled) emit('tasksLoaded', true)
}, {immediate: true})

watch(totalPages, pages => {
	if (pages > 0 && page.value > pages) page.value = pages
})

// While the next page loads, the previous one stays on screen; so does its range.
const shownPage = ref(1)
watch(() => taskQuery.isPlaceholderData.value ? undefined : taskQuery.data.value, data => {
	if (data !== undefined) shownPage.value = page.value
}, {immediate: true})

const perPage = computed(() => taskQuery.data.value?.per_page ?? tasks.value.length)
const rangeStart = computed(() => (shownPage.value - 1) * perPage.value + 1)
const rangeEnd = computed(() => rangeStart.value + tasks.value.length - 1)

function goToPage(next: number) {
	if (next < 1 || next > totalPages.value) return
	page.value = next
}

const groups = computed(() => groupTasksByDue(tasks.value, now.value, timezone.value))

// The datemath in the query key never changes, so a page left open overnight has to
// refetch itself when the local day rolls over.
const today = computed(() => calendarDay(now.value, timezone.value))
watch(today, (current, previous) => {
	if (previous !== undefined && current !== previous && view.value !== 'current') {
		taskQuery.refetch()
	}
})

function groupLabel(key: DueGroup): string {
	switch (key) {
		case 'overdue':
			return t('workspace.groups.overdue')
		case 'today':
			return t('input.datepicker.today')
		case 'tomorrow':
			return t('input.datepicker.tomorrow')
		case 'week':
			return t('workspace.groups.week')
		case 'later':
			return t('workspace.groups.later')
		case 'none':
			return t('workspace.groups.none')
	}
}

function canMarkAsDone(task: TaskResponse) {
	return (projectList.projects[task.project_id]?.max_permission ?? 0) > PERMISSIONS.READ
}

function refetch() {
	return taskQuery.refetch()
}

defineExpose({
	// For writes that finish after the create mutation's own refetch, such as the
	// labels and assignees quick add attaches afterwards.
	refresh: () => projectList.hasRealProjects ? refetch() : undefined,
})

const filteredLabels = computed(() => labelIds.value
	.map(id => getLabelById(Number(id)))
	.filter(label => label !== null && label !== undefined))

const savedFilterIgnored = computed(() => filteredLabels.value.length > 0
	&& view.value === 'current'
	&& savedFilterId.value !== null)
</script>

<style lang="scss" scoped>
.workspace-tasks-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: .5rem 1rem;
	margin-block-end: .75rem;
}

.workspace-tasks-count {
	margin: 0;
	color: var(--text-muted);
	font-size: .875rem;
	font-variant-numeric: tabular-nums;
}

.workspace-task-card {
	margin-block-end: 0;
}

.task-group + .task-group {
	border-block-start: 1px solid var(--grey-100);
}

.task-group-heading {
	display: flex;
	align-items: center;
	gap: .5rem;
	margin: 0;
	padding: .75rem 1rem .25rem;
	color: var(--text-muted);
	font-size: .8125rem;
	font-weight: 600;
	letter-spacing: .02em;

	[data-group="overdue"] & {
		color: var(--danger-text, var(--danger));
	}
}

.task-group-count {
	font-variant-numeric: tabular-nums;
	font-weight: 500;
	opacity: .85;
}

.tasks {
	list-style: none;
	margin: 0;
	padding: 0 .5rem .5rem;
}

.workspace-skeleton {
	display: grid;
	gap: .5rem;
	margin: 0;
	padding: 1rem;
	list-style: none;
	border-radius: $radius-large;
	background: var(--white);
	box-shadow: var(--shadow-sm);

	li {
		block-size: 1.75rem;
		border-radius: $radius;
		background: var(--grey-100);

		&:nth-child(2n) {
			inline-size: 80%;
		}
	}
}

.workspace-empty,
.workspace-error {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: .75rem;
	padding: 1.25rem;
	border: 1px dashed var(--grey-300);
	border-radius: $radius-large;
	color: var(--text-muted);

	p {
		margin: 0;
	}
}

.workspace-error {
	border-style: solid;
	border-color: hsla(var(--danger-h), var(--danger-s), var(--danger-l), .4);
	color: var(--text);
}

.workspace-empty-title {
	color: var(--text);
	font-weight: 500;
}

.workspace-tasks-footer {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: .5rem 1rem;
	margin-block-start: .75rem;
	font-size: .875rem;
}

.workspace-pagination {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: .25rem .5rem;
}

.workspace-page-status {
	color: var(--text-muted);
	font-variant-numeric: tabular-nums;
}

.workspace-upcoming-link,
.workspace-empty-link {
	display: inline-flex;
	align-items: center;
	gap: .375rem;
	min-block-size: 2rem;
	margin-inline-start: auto;
	font-weight: 500;

	@media (pointer: coarse) {
		min-block-size: 2.75rem;
	}
}

.workspace-empty-link {
	margin-inline-start: 0;
}

.label-filter-info {
	margin-block-end: 1rem;

	.clear-filter-button {
		margin-inline-start: auto;
		padding: .25rem .5rem;

		&:hover {
			color: var(--danger);
		}
	}

	:deep(.message.info) {
		inline-size: 100%;
		display: flex;
		align-items: center;
		gap: .5rem;
	}
}
</style>
