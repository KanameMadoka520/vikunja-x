<template>
	<section
		ref="panel"
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
			class="saved-filter-ignored"
		>
			{{ $t('task.show.savedFilterIgnored') }}
		</Message>

		<LoadError
			v-if="projectsFailed"
			class="workspace-error"
			:message="$t('workspace.loadError')"
			:retry="() => projectList.refetch()"
		/>

		<EmptyState
			v-else-if="!hasProjects"
			class="workspace-empty"
			data-empty="no-projects"
			:title="$t('workspace.noProjects')"
		>
			<XButton
				:to="{name: 'project.create'}"
				icon="plus"
			>
				{{ $t('project.create.header') }}
			</XButton>
		</EmptyState>

		<LoadError
			v-else-if="taskQuery.isError.value && !hasData"
			class="workspace-error"
			:message="$t('workspace.loadError')"
			:retry="() => taskQuery.refetch()"
		/>

		<div
			v-else-if="!hasData"
			class="workspace-skeleton"
			role="status"
		>
			<span class="is-sr-only">{{ $t('misc.loading') }}</span>
			<div
				v-for="row in 4"
				:key="row"
				class="workspace-skeleton__row"
				aria-hidden="true"
			>
				<span class="workspace-skeleton__box" />
				<span class="workspace-skeleton__line" />
			</div>
		</div>

		<EmptyState
			v-else-if="tasks.length === 0"
			class="workspace-empty"
			:title="emptyMessage"
		>
			<RouterLink
				v-if="view !== 'current'"
				:to="{name: 'tasks.range'}"
				class="workspace-empty-link"
			>
				{{ $t('workspace.seeUpcoming') }}
				<Icon
					icon="angle-right"
					class="is-mirrored-rtl"
				/>
			</RouterLink>
		</EmptyState>

		<template v-else>
			<!-- Data stays on screen after a failed background refresh; say so instead of failing silently. -->
			<LoadError
				v-if="taskQuery.isError.value"
				class="workspace-refresh-error"
				:message="$t('workspace.refreshError')"
				:retry="() => taskQuery.refetch()"
			/>
			<Card
				:padding="false"
				:has-content="false"
				class="workspace-task-card has-overflow"
				:class="{'is-refreshing': taskQuery.isFetching.value}"
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
						<span class="task-group-count">{{
							totalPages > 1 ? $t('workspace.groupOnPage', {count: group.tasks.length}) : group.tasks.length
						}}</span>
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
		</template>

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
import {computed, ref, useTemplateRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'

import BaseButton from '@/components/base/BaseButton.vue'
import Icon from '@/components/misc/Icon'
import Message from '@/components/misc/Message.vue'
import EmptyState from '@/components/misc/state/EmptyState.vue'
import LoadError from '@/components/misc/state/LoadError.vue'
import SegmentedControl from '@/components/input/SegmentedControl.vue'
import SingleTaskInProject from '@/components/tasks/partials/SingleTaskInProject.vue'
import XLabel from '@/components/tasks/partials/Label.vue'

import {useAuthStore} from '@/stores/auth'
import {useProjects} from '@/composables/useProjects'
import {useLabels} from '@/composables/useLabels'
import {useTasks} from '@/composables/useTasks'
import {useGlobalNow} from '@/composables/useGlobalNow'
import {useTaskRowKeyboard} from '@/components/home/workspace/useTaskRowKeyboard'
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

useTaskRowKeyboard(useTemplateRef<HTMLElement>('panel'))

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
// Home keeps Bulma's .content on its root; paragraphs in the states here bring their own spacing.
.workspace-tasks.show-tasks :deep(p) {
	margin-block: 0;
}

.workspace-tasks-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-2) var(--space-4);
	margin-block-end: var(--space-3);
}

.workspace-tasks-count {
	color: var(--text-tertiary);
	font-size: var(--text-md);
	font-variant-numeric: tabular-nums;
}

.workspace-task-card {
	margin-block-end: 0;
	transition: opacity var(--motion-base) var(--ease-standard);

	// Background refreshes keep the rows usable; only a quiet hint that something is loading.
	&.is-refreshing {
		opacity: .85;
	}
}

.workspace-refresh-error {
	margin-block-end: var(--space-3);
}

.task-group + .task-group {
	border-block-start: 1px solid var(--border-subtle);
}

.task-group-heading {
	position: sticky;
	inset-block-start: var(--header-height);
	z-index: var(--layer-sticky);
	display: flex;
	align-items: center;
	gap: var(--space-2);
	margin: 0;
	padding: var(--space-3) var(--space-4) var(--space-1);
	background: var(--surface);
	color: var(--text-tertiary);
	font-size: var(--text-sm);
	font-weight: var(--weight-semibold);
	line-height: var(--leading-tight);

	.task-group:first-child & {
		border-start-start-radius: var(--radius-md);
		border-start-end-radius: var(--radius-md);
	}

	[data-group="overdue"] & {
		color: var(--danger-text);
	}
}

.task-group-count {
	color: var(--text-tertiary);
	font-variant-numeric: tabular-nums;
	font-weight: var(--weight-medium);
}

.tasks {
	list-style: none;
	margin: 0;
	padding: 0 var(--space-2) var(--space-2);
}

.workspace-skeleton {
	display: grid;
	gap: var(--space-1);
	padding: var(--space-3) var(--space-4);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	background: var(--surface);
	box-shadow: var(--elevation-1);
}

.workspace-skeleton__row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	block-size: 2.25rem;

	&:nth-child(2n + 1) .workspace-skeleton__line {
		inline-size: 55%;
	}
}

.workspace-skeleton__box,
.workspace-skeleton__line {
	border-radius: var(--radius-xs);
	background: var(--surface-active);
}

.workspace-skeleton__box {
	flex: none;
	inline-size: 1rem;
	block-size: 1rem;
}

.workspace-skeleton__line {
	inline-size: 75%;
	block-size: .75rem;
}

.workspace-tasks-footer {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-2) var(--space-4);
	margin-block-start: var(--space-3);
	font-size: var(--text-md);
}

.workspace-pagination {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-1) var(--space-2);
}

.workspace-page-status {
	color: var(--text-tertiary);
	font-variant-numeric: tabular-nums;
}

.workspace-upcoming-link,
.workspace-empty-link {
	display: inline-flex;
	align-items: center;
	gap: var(--space-2);
	min-block-size: var(--target-min);
	margin-inline-start: auto;
	color: var(--accent-text);
	font-weight: var(--weight-medium);
}

.workspace-empty-link {
	margin-inline-start: 0;
}

.label-filter-info,
.saved-filter-ignored {
	margin-block-end: var(--space-3);
}

.label-filter-info {
	.clear-filter-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-inline-size: var(--target-min);
		min-block-size: var(--target-min);
		margin-inline-start: auto;
		border-radius: $radius;
		color: var(--text-secondary);

		&:hover {
			background: var(--surface-hover);
			color: var(--danger-text);
		}
	}

	:deep(.message) {
		inline-size: 100%;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
}
</style>
