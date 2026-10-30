<template>
	<div
		v-cy="'projects-list'"
		class="project-list loader-container"
		:class="{'is-loading': loading}"
	>
		<header class="project-header">
			<h1 class="project-list-title">
				{{ $t('project.projects') }}
			</h1>

			<div class="action-buttons">
				<XButton
					:to="{name: 'filters.create'}"
					variant="secondary"
					icon="filter"
				>
					{{ $t('filters.create.title') }}
				</XButton>
				<XButton
					v-cy="'new-project'"
					:to="{name: 'project.create'}"
					icon="plus"
				>
					{{ $t('project.create.header') }}
				</XButton>
			</div>
		</header>

		<div
			v-if="loadFailed"
			class="project-list-empty project-list-error"
			role="alert"
		>
			<p>{{ $t('projectList.loadError') }}</p>
			<XButton
				variant="secondary"
				icon="arrow-rotate-right"
				@click="projectList.refetch()"
			>
				{{ $t('projectHistory.retry') }}
			</XButton>
		</div>

		<div
			v-else-if="showFirstProjectHint"
			class="project-list-first"
			data-empty="no-projects"
		>
			<p class="project-list-first-title">
				{{ $t('projectList.emptyTitle') }}
			</p>
			<p>{{ $t('projectList.emptyText') }}</p>
			<XButton
				:to="{name: 'project.create'}"
				icon="plus"
			>
				{{ $t('project.create.header') }}
			</XButton>
		</div>

		<div
			v-else
			class="project-toolbar"
		>
			<div class="project-search">
				<label
					class="is-sr-only"
					:for="searchId"
				>
					{{ $t('projectHistory.search') }}
				</label>
				<Icon
					icon="search"
					class="project-search-icon"
				/>
				<input
					:id="searchId"
					v-model="search"
					class="input project-search-input"
					type="search"
					maxlength="250"
					autocomplete="off"
					:placeholder="$t('projectList.searchPlaceholder')"
				>
			</div>
			<SegmentedControl
				v-model="status"
				class="project-status-filter"
				:options="statusOptions"
				:label="$t('projectStatus.filterLabel')"
			/>
		</div>

		<p
			v-if="overlapCount > 0 && !loadFailed"
			class="project-list-help"
		>
			{{ $t('projectList.overlapHint', overlapCount) }}
		</p>

		<p
			class="is-sr-only"
			role="status"
		>
			{{ resultAnnouncement }}
		</p>

		<ProjectCardGrid
			v-if="sections.projects.length > 0"
			:projects="sections.projects"
			show-archived
		/>
		<div
			v-else-if="showNoMatches"
			class="project-list-empty"
		>
			<p>{{ $t('projectList.noMatches') }}</p>
			<XButton
				variant="secondary"
				@click="clearFilters"
			>
				{{ $t('filters.clear') }}
			</XButton>
		</div>

		<section
			v-if="sections.others.length > 0"
			class="project-list-other"
			:aria-labelledby="otherHeadingId"
		>
			<h2
				:id="otherHeadingId"
				class="project-list-section-title"
			>
				{{ $t('projectList.otherSection') }}
			</h2>
			<ProjectCardGrid
				:projects="sections.others"
				show-archived
			/>
		</section>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, useId, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useStorage} from '@vueuse/core'

import Icon from '@/components/misc/Icon'
import SegmentedControl from '@/components/input/SegmentedControl.vue'
import ProjectCardGrid from '@/components/project/partials/ProjectCardGrid.vue'

import {useTitle} from '@/composables/useTitle'
import {useProjects} from '@/composables/useProjects'
import {useDelayedLoading} from '@/composables/useDelayedLoading'
import {getProjectTitle} from '@/helpers/getProjectTitle'
import {
	LEGACY_SHOW_ARCHIVED_STORAGE_KEY,
	PROJECT_LIST_STATUS_STORAGE_KEY,
	PROJECT_STATUS_FILTERS,
	countProjectsByStatus,
	resolveStoredProjectStatus,
	splitProjectList,
	type ProjectStatusFilter,
} from '@/helpers/projectStatus'

const {t} = useI18n({useScope: 'global'})
const projectList = useProjects()

useTitle(() => t('project.projects'))

const searchId = useId()
const otherHeadingId = useId()

const storedStatus = useStorage<string | null>(PROJECT_LIST_STATUS_STORAGE_KEY, null)
// Storage can throw (privacy modes, quota); losing the old preference is harmless.
function readLegacyShowArchived(): string | null {
	try {
		return localStorage.getItem(LEGACY_SHOW_ARCHIVED_STORAGE_KEY)
	} catch {
		return null
	}
}
const legacyShowArchived = readLegacyShowArchived()
const status = computed<ProjectStatusFilter>({
	get: () => resolveStoredProjectStatus(storedStatus.value, legacyShowArchived),
	set: value => {
		storedStatus.value = value
	},
})
const search = ref('')

const STATUS_LABEL_KEYS: Record<ProjectStatusFilter, string> = {
	active: 'projectStatus.active',
	completed: 'projectStatus.completed',
	archived: 'project.archived',
	all: 'projectList.statusAll',
}

const statusCounts = computed(() => countProjectsByStatus(projectList.projectsArray))
// No count until the list has loaded: a zero would be a claim, not a placeholder.
const statusOptions = computed(() => PROJECT_STATUS_FILTERS.map(value => ({
	value,
	label: t(STATUS_LABEL_KEYS[value]),
	count: projectList.isLoading ? undefined : statusCounts.value[value],
})))

const sections = computed(() => splitProjectList(
	projectList.projectsArray,
	status.value,
	search.value,
	getProjectTitle,
))

const loading = useDelayedLoading(() => projectList.isLoading)

const loadFailed = computed(() => projectList.isError && projectList.projectsArray.length === 0)
const showFirstProjectHint = computed(() => !projectList.isLoading
	&& !loadFailed.value
	&& statusCounts.value.all === 0
	&& search.value.trim() === '')
const showNoMatches = computed(() => !projectList.isLoading
	&& !loadFailed.value
	&& (statusCounts.value.all > 0 || search.value.trim() !== ''))

// Completion and archive are independent, so the chip counts overlap; say so only
// when it actually happens.
const overlapCount = computed(() => projectList.projectsArray
	.filter(project => project.id > 0 && project.is_completed && project.is_archived)
	.length)

// Only filter changes are announced; the initial load is not news to anyone.
const announceResults = ref(false)
watch([search, status], () => {
	announceResults.value = true
})
const resultAnnouncement = computed(() => {
	const count = sections.value.projects.length
	return announceResults.value
		? t('projectList.resultCount', {count}, count)
		: ''
})

function clearFilters() {
	search.value = ''
	status.value = 'all'
}
</script>

<style lang="scss" scoped>
.project-header {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	align-items: center;
	gap: .75rem 1rem;
	margin-block-end: 1rem;
}

.project-list-title {
	margin: 0;
	color: var(--text-strong);
	font-size: 1.5rem;
	font-weight: 700;
	line-height: 1.25;
}

.action-buttons {
	display: flex;
	flex-wrap: wrap;
	gap: .5rem;

	@media screen and (width <= 30rem) {
		inline-size: 100%;

		> * {
			flex: 1 1 auto;
		}
	}
}

.action-buttons .button,
.project-list-empty .button {
	@media (pointer: coarse) {
		min-block-size: 2.75rem;
	}
}

.project-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: .75rem 1rem;
	margin-block-end: 1rem;
}

.project-search {
	position: relative;
	flex: 1 1 16rem;
	min-inline-size: 0;
	max-inline-size: 28rem;

	@media screen and (max-width: $tablet) {
		max-inline-size: none;
	}
}

.project-search-icon {
	position: absolute;
	inset-block-start: 50%;
	inset-inline-start: .75rem;
	inline-size: .875rem;
	block-size: .875rem;
	z-index: 1; // Bulma positions .input, which would otherwise paint over the icon
	color: var(--text-muted);
	transform: translateY(-50%);
	pointer-events: none;
}

.project-search-input {
	inline-size: 100%;
	padding-inline-start: 2.25rem;

	@media (pointer: coarse) {
		min-block-size: 2.75rem;
	}
}

.project-status-filter {
	flex: 0 1 auto;
}

.project-list-empty {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: .75rem 1rem;
	padding: 1.5rem 1rem;
	border: 1px dashed var(--grey-200);
	border-radius: $radius;
	color: var(--text-muted);

	p {
		margin: 0;
	}
}

.project-list-error {
	border-style: solid;
	border-color: hsla(var(--danger-h), var(--danger-s), var(--danger-l), .4);
	color: var(--text);
}

.project-list-first {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: .5rem;
	max-inline-size: 36rem;
	padding: 1.5rem 0;
	color: var(--text-muted);

	p {
		margin: 0;
	}

	.button {
		margin-block-start: .5rem;
	}
}

.project-list-first-title {
	color: var(--text-strong);
	font-size: 1.125rem;
	font-weight: 600;
}

.project-list-help {
	margin: -.25rem 0 1rem;
	color: var(--text-muted);
	font-size: .8125rem;
}

.project-list-other {
	margin-block-start: 2rem;
}

.project-list-section-title {
	margin: 0 0 .75rem;
	color: var(--text-muted);
	font-size: .875rem;
	font-weight: 600;
	line-height: 1.4;
}
</style>
