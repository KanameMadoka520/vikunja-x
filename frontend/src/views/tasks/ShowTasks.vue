<template>
	<div
		ref="page"
		v-cy="'showTasks'"
		class="upcoming is-max-width-desktop has-text-start"
		:aria-busy="loading"
	>
		<PageHeader :title="headerTitle" />
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
				@click="clearLabelFilter"
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
		<div
			v-if="!showAll"
			class="show-tasks-options"
		>
			<DatepickerWithRange
				:model-value="{dateFrom: dateFrom ?? null, dateTo: dateTo ?? null}"
				@update:modelValue="setDate"
			>
				<template #trigger="{toggle}">
					<XButton
						variant="secondary"
						:icon="['far', 'calendar-alt']"
						:shadow="false"
						class="upcoming-range-trigger"
						:aria-label="`${$t('task.show.select')}: ${rangeLabel}`"
						@click.prevent.stop="toggle()"
					>
						{{ rangeLabel }}
					</XButton>
				</template>
			</DatepickerWithRange>
			<FancyCheckbox
				:model-value="showNulls"
				@update:modelValue="setShowNulls"
			>
				{{ $t('task.show.noDates') }}
			</FancyCheckbox>
			<FancyCheckbox
				:model-value="showOverdue"
				@update:modelValue="setShowOverdue"
			>
				{{ $t('task.show.overdue') }}
			</FancyCheckbox>
			<p
				v-if="hasData && total > 0"
				class="upcoming-count"
			>
				{{ $t('workspace.taskCount', total) }}
			</p>
		</div>

		<LoadError
			v-if="taskQuery.isError.value && !hasData"
			:retry="() => taskQuery.refetch()"
		/>

		<div
			v-else-if="!hasData"
			class="upcoming-skeleton"
			role="status"
		>
			<span class="is-sr-only">{{ $t('misc.loading') }}</span>
			<div
				v-for="row in 4"
				:key="row"
				class="upcoming-skeleton__row"
				aria-hidden="true"
			>
				<span class="upcoming-skeleton__box" />
				<span class="upcoming-skeleton__line" />
			</div>
		</div>

		<EmptyState
			v-else-if="tasks.length === 0"
			class="upcoming-empty"
			:icon="['far', 'calendar-check']"
			:title="$t('task.show.noTasks')"
		/>

		<template v-else>
			<!-- Rows stay on screen after a failed background refresh. -->
			<LoadError
				v-if="taskQuery.isError.value"
				class="upcoming-refresh-error"
				:message="$t('workspace.refreshError')"
				:retry="() => taskQuery.refetch()"
			/>
			<Card
				:padding="false"
				class="has-overflow upcoming-card"
				:class="{'is-refreshing': loading}"
				:has-content="false"
			>
				<section
					v-for="group in groups"
					:key="group.key"
					class="task-group"
					:data-group="group.key"
					:aria-labelledby="`upcoming-group-${group.key}`"
				>
					<h2
						:id="`upcoming-group-${group.key}`"
						class="task-group-heading"
					>
						<span>{{ group.label }}</span>
						<span class="task-group-count">{{ group.tasks.length }}</span>
					</h2>
					<ul class="tasks">
						<li
							v-for="task in group.tasks"
							:key="task.id"
						>
							<SingleTaskInProject
								:show-project="true"
								:the-task="task"
								:can-mark-as-done="(projectList.projects[task.project_id]?.max_permission ?? 0) > PERMISSIONS.READ"
								@taskUpdated="updateTasks"
							/>
						</li>
					</ul>
				</section>
			</Card>
			<nav
				v-if="totalPages > 1"
				class="upcoming-pagination"
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
				<span class="upcoming-page-status">
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
		</template>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, useTemplateRef, watch, watchEffect} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'

import {formatDate} from '@/helpers/time/formatDate'
import {setTitle} from '@/helpers/setTitle'
import {parseDateOrNull} from '@/helpers/parseDateOrNull'
import {calendarDay} from '@/helpers/workspaceTasks'
import {resolveUserTimezone} from '@/helpers/time/userTimezone'

import BaseButton from '@/components/base/BaseButton.vue'
import Icon from '@/components/misc/Icon'
import Message from '@/components/misc/Message.vue'
import PageHeader from '@/components/misc/state/PageHeader.vue'
import EmptyState from '@/components/misc/state/EmptyState.vue'
import LoadError from '@/components/misc/state/LoadError.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import SingleTaskInProject from '@/components/tasks/partials/SingleTaskInProject.vue'
import DatepickerWithRange from '@/components/date/DatepickerWithRange.vue'
import XLabel from '@/components/tasks/partials/Label.vue'
import {DATE_RANGES} from '@/components/date/dateRanges'
import {useAuthStore} from '@/stores/auth'
import {useProjects} from '@/composables/useProjects'
import {useLabels} from '@/composables/useLabels'
import type {TaskFilterParams} from '@/client/queries/tasks'
import {useTasks} from '@/composables/useTasks'
import {useGlobalNow} from '@/composables/useGlobalNow'
import {useTaskRowKeyboard} from '@/components/home/workspace/useTaskRowKeyboard'
import type {TaskResponse, TaskScope} from '@/client/queries/tasks'
import {PERMISSIONS} from '@/constants/permissions'

const props = withDefaults(defineProps<{
	dateFrom?: Date | string,
	dateTo?: Date | string,
	showNulls?: boolean,
	showOverdue?: boolean,
	labelIds?: string[],
}>(), {
	showNulls: false,
	showOverdue: false,
	dateFrom: undefined,
	dateTo: undefined,
	labelIds: undefined,
})

const emit = defineEmits<{
	'tasksLoaded': [loaded: true],
	'clearLabelFilter': [],
}>()

const authStore = useAuthStore()
const projectList = useProjects()
const {getLabelById} = useLabels()

const route = useRoute()
const router = useRouter()
const {t, locale} = useI18n({useScope: 'global'})
const {now} = useGlobalNow()
useTaskRowKeyboard(useTemplateRef<HTMLElement>('page'))

const taskScope = ref<TaskScope | null>(null)
const page = ref(1)
watch(taskScope, () => {
	page.value = 1
})
const taskQuery = useTasks(
	() => taskScope.value ?? {},
	{
		enabled: () => authStore.authenticated && taskScope.value !== null,
		page,
		handlesError: true,
		keepPreviousPage: true,
	},
)
const tasks = taskQuery.tasks
const total = taskQuery.total
const totalPages = taskQuery.totalPages
const hasData = computed(() => taskQuery.data.value !== undefined)

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

const showAll = computed(() => typeof props.dateFrom === 'undefined' || typeof props.dateTo === 'undefined')

const filteredLabels = computed(() => {
	if (!props.labelIds || props.labelIds.length === 0) {
		return []
	}
	return props.labelIds
		.map(id => getLabelById(Number(id)))
		.filter(label => label !== null && label !== undefined)
})

const savedFilterIgnored = computed(() => {
	return filteredLabels.value.length > 0
		&& filterIdUsedOnOverview.value
		&& typeof projectList.projects[filterIdUsedOnOverview.value] !== 'undefined'
})

const predefinedRange = computed(() => Object.entries(DATE_RANGES)
	.find(([, value]) => props.dateFrom === value[0] && props.dateTo === value[1])
	?.[0])

const pageTitle = computed(() => {
	if (typeof predefinedRange.value !== 'undefined') {
		return t(`input.datepickerRange.ranges.${predefinedRange.value}`)
	}

	return showAll.value
		? t('task.show.titleCurrent')
		: t('task.show.fromuntil', {
			from: formatDate(props.dateFrom, 'LL'),
			until: formatDate(props.dateTo, 'LL'),
		})
})
const headerTitle = computed(() => showAll.value ? t('task.show.titleCurrent') : t('navigation.upcoming'))
// The trigger names the active range, so it is visible without opening the picker.
const rangeLabel = computed(() => {
	if (typeof predefinedRange.value !== 'undefined') {
		return t(`input.datepickerRange.ranges.${predefinedRange.value}`)
	}
	return t('input.datepickerRange.fromto', {
		from: formatDate(props.dateFrom, 'll'),
		to: formatDate(props.dateTo, 'll'),
	})
})
const userAuthenticated = computed(() => authStore.authenticated)
const loading = taskQuery.isFetching

const timezone = computed(() => resolveUserTimezone(authStore.settings?.timezone))

interface DayGroup {
	key: string
	label: string
	order: number
	tasks: TaskResponse[]
}

// Same day boundaries as the workspace: calendar days in the user's time zone.
const groups = computed<DayGroup[]>(() => {
	const today = calendarDay(now.value, timezone.value)
	// The day number is a UTC midnight, so format it in UTC to get that calendar date back.
	const dayFormatter = new Intl.DateTimeFormat(locale.value, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	})
	const byKey = new Map<string, DayGroup>()
	for (const task of tasks.value) {
		const due = parseDateOrNull(task.due_date)
		let group: Omit<DayGroup, 'tasks'>
		if (due === null) {
			group = {key: 'none', label: t('workspace.groups.none'), order: Number.POSITIVE_INFINITY}
		} else {
			const day = calendarDay(due, timezone.value)
			if (day < today) {
				group = {key: 'overdue', label: t('workspace.groups.overdue'), order: Number.NEGATIVE_INFINITY}
			} else if (day === today) {
				group = {key: 'today', label: t('input.datepicker.today'), order: day}
			} else if (day === today + 1) {
				group = {key: 'tomorrow', label: t('input.datepicker.tomorrow'), order: day}
			} else {
				const date = new Date(day * 86_400_000)
				group = {key: date.toISOString().slice(0, 10), label: dayFormatter.format(date), order: day}
			}
		}
		const existing = byKey.get(group.key)
		if (existing) {
			existing.tasks.push(task)
		} else {
			byKey.set(group.key, {...group, tasks: [task]})
		}
	}
	return [...byKey.values()].sort((a, b) => a.order - b.order)
})
const filterIdUsedOnOverview = computed(() => authStore.settings?.frontend_settings?.filter_id_used_on_overview)

interface dateStrings {
	dateFrom: Date | string | null,
	dateTo: Date | string | null,
}

function setDate(dates: dateStrings) {
	const from = dates.dateFrom ?? props.dateFrom
	const to = dates.dateTo ?? props.dateTo
	router.push({
		name: route.name as string,
		query: {
			from: from instanceof Date ? from.toISOString() : from,
			to: to instanceof Date ? to.toISOString() : to,
			showOverdue: props.showOverdue ? 'true' : 'false',
			showNulls: props.showNulls ? 'true' : 'false',
		},
	})
}

function setShowOverdue(show: boolean) {
	router.push({
		name: route.name as string,
		query: {
			...route.query,
			showOverdue: show ? 'true' : 'false',
		},
	})
}

function setShowNulls(show: boolean) {
	router.push({
		name: route.name as string,
		query: {
			...route.query,
			showNulls: show ? 'true' : 'false',
		},
	})
}

function clearLabelFilter() {
	emit('clearLabelFilter')
}

async function loadPendingTasks(from: Date|string|undefined, to: Date|string|undefined, filterId: number | null | undefined) {
	// FIXME: HACK! This should never happen.
	// Since this route is authentication only, users would get an error message if they access the page unauthenticated.
	// Since this component is mounted as the home page before unauthenticated users get redirected
	// to the login page, they will almost always see the error message.
	if (!userAuthenticated.value) {
		return
	}

	const params: TaskFilterParams = {
		sort_by: ['due_date', 'id'],
		order_by: ['asc', 'desc'],
		filter: 'done = false',
		filter_include_nulls: props.showNulls,
		q: '',
		expand: ['comment_count', 'is_unread'],
	}

	if (!showAll.value) {

		params.filter += ` && due_date < '${to instanceof Date ? to.toISOString() : to}'`

		// NOTE: Ideally we could also show tasks with a start or end date in the specified range, but the api
		//       is not capable (yet) of combining multiple filters with 'and' and 'or'.

		if (!props.showOverdue) {
			params.filter += ` && due_date > '${from instanceof Date ? from.toISOString() : from}'`
		}
	}

	// Add label filtering
	if (props.labelIds && props.labelIds.length > 0) {
		const labelFilter = `labels in ${props.labelIds.join(', ')}`
		params.filter += params.filter ? ` && ${labelFilter}` : labelFilter
	}

	let projectId = null
	if (showAll.value && filterId && typeof projectList.projects[filterId] !== 'undefined'
		&& (!props.labelIds || props.labelIds.length === 0)) {
		projectId = filterId
	}

	taskScope.value = {project: projectId, params: {...params, filter_timezone: authStore.settings.timezone}}
}

watch(taskQuery.data, data => { if (data) emit('tasksLoaded', true) })

function updateTasks() { return taskQuery.refetch() }

// Keep sidebar setting changes from reloading tasks.
watch(
	[
		() => props.dateFrom,
		() => props.dateTo,
		filterIdUsedOnOverview,
		() => props.showOverdue,
		() => props.showNulls,
		() => props.labelIds,
	],
	([from, to, filterId]) => loadPendingTasks(from, to, filterId),
	{immediate: true},
)
watchEffect(() => setTitle(pageTitle.value))
</script>

<style lang="scss" scoped>
.tasks {
	list-style: none;
	margin: 0;
	padding: 0 var(--space-2) var(--space-2);
}

.show-tasks-options {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-2) var(--space-5);
	margin-block-end: var(--space-4);

	:deep(.fancy-checkbox__content) {
		color: var(--text-secondary);
		font-size: var(--text-md);
	}
}

.upcoming-range-trigger {
	max-inline-size: 100%;
}

.upcoming-count {
	margin-inline-start: auto;
	color: var(--text-tertiary);
	font-size: var(--text-md);
	font-variant-numeric: tabular-nums;
}

.upcoming-card {
	transition: opacity var(--motion-base) var(--ease-standard);

	// Background refreshes keep the rows usable; only a quiet hint that something is loading.
	&.is-refreshing {
		opacity: .85;
	}
}

.upcoming-refresh-error {
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

	[data-group="today"] & {
		color: var(--accent-text);
	}
}

.task-group-count {
	font-variant-numeric: tabular-nums;
	font-weight: var(--weight-medium);
}

.upcoming-skeleton {
	display: grid;
	gap: var(--space-1);
	padding: var(--space-3) var(--space-4);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	background: var(--surface);
	box-shadow: var(--elevation-1);
}

.upcoming-skeleton__row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	block-size: 2.25rem;

	&:nth-child(2n + 1) .upcoming-skeleton__line {
		inline-size: 55%;
	}
}

.upcoming-skeleton__box,
.upcoming-skeleton__line {
	border-radius: var(--radius-xs);
	background: var(--surface-active);
}

.upcoming-skeleton__box {
	flex: none;
	inline-size: 1rem;
	block-size: 1rem;
}

.upcoming-skeleton__line {
	inline-size: 75%;
	block-size: .75rem;
}

.upcoming-pagination {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-end;
	gap: var(--space-1) var(--space-2);
	margin-block-start: var(--space-3);
	font-size: var(--text-md);
}

.upcoming-page-status {
	color: var(--text-tertiary);
	font-variant-numeric: tabular-nums;
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
