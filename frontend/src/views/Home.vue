<template>
	<div class="content workspace">
		<header class="workspace-header">
			<h1 class="workspace-title">
				{{ salutation ?? $t('workspace.title') }}
			</h1>
			<p class="workspace-date">
				<time :datetime="todayIso">{{ todayLabel }}</time>
			</p>
		</header>

		<Message
			v-if="deletionScheduledAt !== null"
			variant="danger"
			class="mbe-4"
		>
			{{
				$t('user.deletion.scheduled', {
					date: formatDisplayDate(deletionScheduledAt),
					dateSince: formatDateSince(deletionScheduledAt),
				})
			}}
			<RouterLink :to="{name: 'user.settings.deletion'}">
				{{ $t('user.deletion.scheduledCancel') }}
			</RouterLink>
		</Message>

		<div class="workspace-layout">
			<div class="workspace-main">
				<div class="workspace-capture">
					<AddTask
						data-tour="home-add"
						@tasksAdded="handleTasksAdded"
					/>
					<p
						ref="captureFeedback"
						class="capture-feedback"
						role="status"
					>
						<template v-if="captured !== null">
							<Icon
								icon="check"
								class="capture-feedback-icon"
							/>
							<i18n-t
								keypath="workspace.capture.added"
								:plural="captured.count"
								tag="span"
								scope="global"
							>
								<template #count>
									{{ captured.count }}
								</template>
								<template #task>
									<RouterLink :to="{name: 'task.detail', params: {id: captured.id}}">
										{{ captured.title }}
									</RouterLink>
								</template>
							</i18n-t>
							<template v-if="capturedHidden">
								<span>{{ $t('workspace.capture.hidden', captured.count) }}</span>
								<BaseButton
									class="capture-feedback-action"
									@click="showAllOpenTasks"
								>
									{{ $t('workspace.capture.showAll') }}
								</BaseButton>
							</template>
						</template>
					</p>
				</div>
				<ImportHint v-if="tasksLoaded" />
				<WorkspaceTasks
					ref="workspaceTasks"
					v-model:view="taskView"
					:label-ids="labelIds"
					@tasksLoaded="tasksLoaded = true"
					@clearLabelFilter="handleClearLabelFilter"
				/>
			</div>
			<aside
				class="workspace-side"
				:aria-label="$t('workspace.sideLabel')"
			>
				<RecentProjects />
				<WorkspaceLinks
					heading-id="workspace-links-heading"
					:heading="$t('workspace.links.heading')"
					:links="links"
				/>
			</aside>
		</div>
	</div>
</template>

<script lang="ts" setup>
import {ref, computed, nextTick, useTemplateRef, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useStorage} from '@vueuse/core'

import BaseButton from '@/components/base/BaseButton.vue'
import Icon from '@/components/misc/Icon'
import Message from '@/components/misc/Message.vue'
import AddTask from '@/components/tasks/AddTask.vue'
import ImportHint from '@/components/home/ImportHint.vue'
import WorkspaceTasks from '@/components/home/workspace/WorkspaceTasks.vue'
import RecentProjects from '@/components/home/workspace/RecentProjects.vue'
import WorkspaceLinks, {type WorkspaceLink} from '@/components/home/workspace/WorkspaceLinks.vue'

import {parseDateOrNull} from '@/helpers/parseDateOrNull'
import {isHiddenFromView, parseWorkspaceTaskView, type WorkspaceTaskView} from '@/helpers/workspaceTasks'
import {formatDateSince, formatDisplayDate} from '@/helpers/time/formatDate'
import {resolveUserTimezone} from '@/helpers/time/userTimezone'
import {useDaytimeSalutation} from '@/composables/useDaytimeSalutation'
import {useGlobalNow} from '@/composables/useGlobalNow'
import {useTitle} from '@/composables/useTitle'

import {useAuthStore} from '@/stores/auth'

const {t, locale} = useI18n({useScope: 'global'})
useTitle(() => t('workspace.title'))

const salutation = useDaytimeSalutation()

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const {now} = useGlobalNow()

const timezone = computed(() => resolveUserTimezone(authStore.settings.timezone))
const todayLabel = computed(() => new Intl.DateTimeFormat(locale.value, {
	weekday: 'long',
	month: 'long',
	day: 'numeric',
	timeZone: timezone.value,
}).format(now.value))
const todayIso = computed(() => new Intl.DateTimeFormat('en-CA', {
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	timeZone: timezone.value,
}).format(now.value))

const tasksLoaded = ref(false)

const storedView = useStorage<string>('workspaceTaskView', 'current')
const taskView = computed<WorkspaceTaskView>({
	get: () => parseWorkspaceTaskView(storedView.value),
	set: value => {
		storedView.value = value
	},
})

interface CapturedTask {
	id?: number
	title?: string
	due_date?: Date | string | null
}

const workspaceTasks = useTemplateRef<InstanceType<typeof WorkspaceTasks>>('workspaceTasks')
const captureFeedback = useTemplateRef<HTMLElement>('captureFeedback')

// AddTask clears its input on success; without this a capture that falls outside
// the selected view would look like it vanished. It stays across view switches,
// because the link may be the only way back to a task on a later page.
const captured = ref<{
	id: number
	title: string
	count: number
	dueDates: CapturedTask['due_date'][]
} | null>(null)

const capturedHidden = computed(() => captured.value !== null
	&& captured.value.dueDates.every(due => isHiddenFromView(due, taskView.value, now.value, timezone.value)))

function handleTasksAdded(tasks: CapturedTask[]) {
	const first = tasks.find(task => typeof task.id === 'number')
	if (first === undefined) return
	captured.value = {
		id: first.id as number,
		title: first.title ?? '',
		count: tasks.length,
		dueDates: tasks.map(task => task.due_date),
	}
	// The create mutation refetches before quick add attaches labels and assignees,
	// so a capture matching a label or saved filter only by those would be missed.
	workspaceTasks.value?.refresh()
}

// The button disappears with the view change; keep keyboard focus on the result.
async function showAllOpenTasks() {
	taskView.value = 'current'
	await nextTick()
	captureFeedback.value?.querySelector<HTMLElement>('a')?.focus()
}

const deletionScheduledAt = computed(() => parseDateOrNull(authStore.info?.deletion_scheduled_at))

// Labels arrive from the label list's "show tasks" link.
const labelIds = computed(() => {
	const labelsParam = route.query.labels
	if (!labelsParam) {
		return undefined
	}
	return Array.isArray(labelsParam) ? labelsParam.filter((id): id is string => id !== null) : [labelsParam]
})

// "Show tasks" on a label means all of its open tasks; a remembered Today or Overdue
// choice would silently hide most of them. The chips stay usable afterwards.
watch(() => labelIds.value?.join(','), ids => {
	if (ids) taskView.value = 'current'
}, {immediate: true})

function handleClearLabelFilter() {
	const query = {...route.query}
	delete query.labels
	router.push({
		name: route.name as string,
		query,
	})
}

const links = computed<WorkspaceLink[]>(() => [
	{
		id: 'arona',
		to: {name: 'tcy-ai'},
		title: t('tcymc.text.ai_task_assistant'),
		description: t('workspace.links.aronaHint'),
		arona: true,
	},
	{
		id: 'upcoming',
		to: {name: 'tasks.range'},
		title: t('navigation.upcoming'),
		description: t('workspace.links.upcomingHint'),
		icon: ['far', 'calendar-alt'],
	},
	{
		id: 'history',
		to: {name: 'projects.history'},
		title: t('projectHistory.title'),
		description: t('workspace.links.historyHint'),
		icon: ['far', 'calendar-check'],
	},
])
</script>

<style scoped lang="scss">
.workspace {
	container-type: inline-size;
	max-inline-size: 72rem;
	margin-inline: auto;
}

.workspace-header {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: .25rem 1rem;
	margin-block-end: 1.25rem;
}

// .content h1 brings Bulma's large margins; the workspace keeps one compact heading row.
.content .workspace-title {
	margin: 0;
	color: var(--text-strong);
	font-size: 1.75rem;
	font-weight: 600;
	line-height: 1.25;
	overflow-wrap: anywhere;

	@media screen and (max-width: $tablet) {
		font-size: 1.375rem;
	}
}

.content .workspace-date {
	margin: 0;
	color: var(--text-muted);
	font-size: .9375rem;
}

.workspace-layout {
	display: grid;
	gap: 1.5rem;
	align-items: start;
}

@container (min-width: 52rem) {
	.workspace-layout {
		grid-template-columns: minmax(0, 1fr) minmax(15rem, 18rem);
		gap: 2rem;
	}

	.workspace-side {
		position: sticky;
		inset-block-start: 1rem;
	}
}

.workspace-main {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	min-inline-size: 0;

	:deep(.task-add) {
		margin-block-end: 0;
	}
}

.capture-feedback {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: .25rem .5rem;
	margin: .5rem 0 0;
	color: var(--text-muted);
	font-size: .875rem;

	// Collapsed, not display: none, so the live region exists before its first
	// message and screen readers announce it.
	&:empty {
		margin: 0;
	}
}

.capture-feedback-icon {
	color: var(--success);
}

.capture-feedback-action {
	color: var(--primary);
	font-weight: 600;
	text-decoration: underline;
	text-underline-offset: .15em;
}

.workspace-side {
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
	min-inline-size: 0;

	:deep(.workspace-side-heading) {
		margin: 0 0 .5rem;
		padding-inline: .5rem;
		color: var(--text-muted);
		font-size: .8125rem;
		font-weight: 600;
		letter-spacing: .02em;
	}
}
</style>
