<template>
	<div
		v-cy="'projects-list'"
		class="project-list project-overview loader-container"
		:class="{'is-loading': loading}"
	>
		<PageHeader
			class="project-header"
			:title="$t('project.projects')"
			:description="$t('projectList.description')"
		>
			<template #actions>
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
			</template>
		</PageHeader>

		<LoadError
			v-if="loadFailed"
			class="project-list-error"
			:message="$t('projectList.loadError')"
			:retry="() => projectList.refetch()"
		/>

		<EmptyState
			v-else-if="showFirstProjectHint"
			class="project-list-first"
			data-empty="no-projects"
			icon="layer-group"
			:title="$t('projectList.emptyTitle')"
			:description="$t('projectList.emptyText')"
		>
			<XButton
				:to="{name: 'project.create'}"
				icon="plus"
			>
				{{ $t('project.create.header') }}
			</XButton>
		</EmptyState>

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
		<EmptyState
			v-else-if="showNoMatches"
			class="project-list-empty"
			icon="search"
			:title="$t('projectList.noMatches')"
		>
			<XButton
				variant="secondary"
				@click="clearFilters"
			>
				{{ $t('filters.clear') }}
			</XButton>
		</EmptyState>

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
import PageHeader from '@/components/misc/state/PageHeader.vue'
import EmptyState from '@/components/misc/state/EmptyState.vue'
import LoadError from '@/components/misc/state/LoadError.vue'
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
.project-overview {
	max-inline-size: var(--page-max-width);
	margin-inline: auto;
}

.project-header {
	margin-block-end: var(--space-4);
}

.action-buttons {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);

	@media screen and (max-width: $tablet) {
		inline-size: 100%;

		> * {
			flex: 1 1 auto;
		}
	}
}

.project-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-2) var(--space-3);
	margin-block-end: var(--space-4);
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
	inset-inline-start: var(--space-3);
	inline-size: .875rem;
	block-size: .875rem;
	z-index: 1; // Bulma positions .input, which would otherwise paint over the icon
	color: var(--text-tertiary);
	transform: translateY(-50%);
	pointer-events: none;
}

.project-search-input {
	inline-size: 100%;
	min-block-size: var(--control-height);
	padding-inline-start: 2.25rem;
}

.project-status-filter {
	flex: 0 1 auto;
	max-inline-size: 100%;
}

.project-list-error,
.project-list-empty {
	margin-block-end: var(--space-4);
}

.project-list-first {
	max-inline-size: 36rem;
}

.project-list-help {
	margin: 0 0 var(--space-4);
	color: var(--text-tertiary);
	font-size: var(--text-sm);
}

.project-list-other {
	margin-block-start: var(--space-8);
}

.project-list-section-title {
	margin: 0 0 var(--space-3);
	color: var(--text-secondary);
	font-size: var(--text-md);
	font-weight: var(--weight-semibold);
	line-height: var(--leading-tight);
}
</style>
