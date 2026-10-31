<template>
	<div
		class="project-view-shell loader-container"
		:class="{
			'is-loading': isLoadingProject,
			'is-archived': currentProject.is_archived,
		}"
	>
		<h1 class="project-title-print">
			{{ getProjectTitle(currentProject) }}
		</h1>

		<div
			ref="switchViewContainerRef"
			class="switch-view-container d-print-none"
			:class="{'is-justify-content-flex-end': views.length === 1}"
		>
			<nav
				v-if="views.length > 1"
				ref="switchViewNavRef"
				class="switch-view-nav"
				:aria-label="$t('project.views.switcherLabel')"
			>
				<!-- Dropdown mode when buttons overflow -->
				<Dropdown
					v-if="isOverflowing"
					class="switch-view-dropdown"
				>
					<template #trigger="{ toggleOpen, open }">
						<BaseButton
							class="switch-view switch-view-dropdown-trigger"
							:aria-expanded="open"
							@click="toggleOpen"
						>
							<span class="switch-view-dropdown-label">{{ activeViewTitle }}</span>
							<Icon
								icon="chevron-down"
								class="dropdown-icon"
							/>
						</BaseButton>
					</template>
					<template #default="{ close }">
						<div @click="close">
							<DropdownItem
								v-for="view in views"
								:key="view.id"
								:to="getViewRoute(view)"
								:class="{'is-active': view.id === viewId}"
								:aria-current="view.id === viewId ? 'page' : undefined"
							>
								{{ getViewTitle(view) }}
							</DropdownItem>
						</div>
					</template>
				</Dropdown>

				<!-- Inline buttons, hidden when overflowing but kept in DOM for width measurement -->
				<div
					ref="switchViewRef"
					class="switch-view"
					:class="{'switch-view--hidden': isOverflowing || !overflowChecked}"
					:aria-hidden="isOverflowing || undefined"
				>
					<BaseButton
						v-for="view in views"
						:key="view.id"
						class="switch-view-button"
						:class="{'is-active': view.id === viewId}"
						:to="getViewRoute(view)"
						:aria-current="view.id === viewId ? 'page' : undefined"
						:tabindex="isOverflowing ? -1 : undefined"
					>
						{{ getViewTitle(view) }}
					</BaseButton>
				</div>
			</nav>
			<div class="project-view-actions">
				<ScreenshotPreview />
				<slot name="header" />
			</div>
		</div>

		<div
			v-if="currentProject.is_completed || currentProject.is_archived"
			class="project-view-banners d-print-none"
		>
			<p
				v-if="currentProject.is_completed"
				class="completion-notice"
			>
				<Icon
					icon="check"
					class="completion-notice__icon"
				/>
				<span>{{ $t('projectHistory.completedBadge') }}</span>
				<RouterLink :to="{name: 'projects.history', query: {tab: 'lifecycle', project: projectId}}">
					{{ $t('projectHistory.viewHistory') }}
				</RouterLink>
			</p>
			<Message
				v-if="currentProject.is_archived"
				variant="warning"
				class="archived-notice"
			>
				{{ $t('project.archivedMessage') }}
			</Message>
		</div>

		<slot v-if="!isLoadingProject" />
	</div>
</template>

<script setup lang="ts">
import {computed, ref, watch, nextTick, onMounted} from 'vue'
import {useResizeObserver} from '@vueuse/core'
import {useI18n} from 'vue-i18n'

import ScreenshotPreview from '@/components/project/ScreenshotPreview.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import Dropdown from '@/components/misc/Dropdown.vue'
import DropdownItem from '@/components/misc/DropdownItem.vue'
import Icon from '@/components/misc/Icon'
import Message from '@/components/misc/Message.vue'

import {getProjectTitle} from '@/helpers/getProjectTitle'
import {useTitle} from '@/composables/useTitle'

import {useViewFiltersStore} from '@/stores/viewFilters'
import {useCurrentProject} from '@/composables/useCurrentProject'

import type {ProjectView} from '@/client/generated'
import {normalizeProject} from '@/client/queries/projects'

const props = defineProps<{
	isLoadingProject: boolean,
	projectId: number,
	viewId: number,
}>()

const {t} = useI18n()

const viewFiltersStore = useViewFiltersStore()
const {currentProject: queriedProject} = useCurrentProject()

const switchViewContainerRef = ref<HTMLElement>()
const switchViewNavRef = ref<HTMLElement>()
const switchViewRef = ref<HTMLElement>()
const isOverflowing = ref(false)
const overflowChecked = ref(false)

// The nav takes the row space the actions leave over, so its width does not depend on which switcher shows.
function checkOverflow() {
	if (!switchViewRef.value || !switchViewNavRef.value) {
		return
	}
	const buttonsWidth = switchViewRef.value.scrollWidth
	const availableWidth = switchViewNavRef.value.clientWidth
	isOverflowing.value = buttonsWidth > availableWidth
	overflowChecked.value = true
}

onMounted(() => {
	checkOverflow()
})

useResizeObserver([switchViewContainerRef, switchViewNavRef], () => {
	requestAnimationFrame(() => checkOverflow())
})

const currentProject = computed(() => queriedProject.value ?? normalizeProject({id: 0}))
useTitle(() => currentProject.value?.id ? getProjectTitle(currentProject.value) : '')

const views = computed(() => currentProject.value.views)

const activeViewTitle = computed(() => {
	const activeView = views.value.find((view: ProjectView) => view.id === props.viewId)
	return activeView ? getViewTitle(activeView) : ''
})

// Re-check overflow when views change
watch(views, () => {
	nextTick(() => checkOverflow())
})

function getViewTitle(view: ProjectView) {
	switch (view.title) {
		case 'List':
			return t('project.list.title')
		case 'Gantt':
			return t('project.gantt.title')
		case 'Table':
			return t('project.table.title')
		case 'Kanban':
			return t('project.kanban.title')
	}

	return view.title ?? ''
}

function getViewRoute(view: ProjectView) {
	const viewId = view.id ?? 0
	const storedQuery = viewFiltersStore.getViewQuery(viewId)
	return {
		name: 'project.view',
		params: {projectId: props.projectId, viewId},
		query: storedQuery,
	}
}
</script>

<style lang="scss" scoped>
.switch-view-container {
	position: relative;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-2) var(--space-3);
	min-block-size: var(--control-height);
	margin-block-end: var(--space-4);
}

// Grows into the space the actions leave; wraps onto its own row once that is under 10rem.
.switch-view-nav {
	position: relative;
	display: flex;
	flex: 1 1 10rem;
	min-inline-size: 0;
}

.project-view-actions {
	display: flex;
	flex: 0 1 auto;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-end;
	gap: var(--space-2);
	margin-inline-start: auto;
}

.switch-view {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	max-inline-size: 100%;
	min-block-size: var(--control-height);
	padding: 2px;
	border: 1px solid var(--border-subtle);
	border-radius: $radius;
	background: var(--surface);
	box-shadow: var(--elevation-1);
	font-size: var(--text-sm);
}

// The measuring copy stays nav-wide and clips its buttons: hidden boxes still count as scrollable
// overflow, so unclipped they would scroll the page sideways on phones. scrollWidth still sees them.
.switch-view--hidden {
	position: absolute;
	inset-inline-start: 0;
	overflow: hidden;
	visibility: hidden;
	pointer-events: none;
	white-space: nowrap;
}

.switch-view-button {
	display: inline-flex;
	align-items: center;
	min-block-size: calc(var(--control-height) - 6px);
	padding-inline: var(--space-3);
	border-radius: var(--radius-sm);
	color: var(--text-secondary);
	font-weight: var(--weight-medium);
	white-space: nowrap;

	&:hover {
		background-color: var(--surface-hover);
		color: var(--text-primary);
	}

	&:focus-visible {
		@include focus-ring;
		outline-offset: 0;
	}

	&.is-active {
		background-color: var(--surface-selected);
		color: var(--accent-text);
		font-weight: var(--weight-semibold);
	}
}

.switch-view-dropdown {
	min-inline-size: 0;
	max-inline-size: 100%;
}

.switch-view-dropdown-trigger {
	display: inline-flex;
	align-items: center;
	gap: var(--space-2);
	min-inline-size: 0;
	max-inline-size: 100%;
	min-block-size: var(--control-height);
	padding-inline: var(--space-3);
	border-color: var(--border-default);
	background-color: var(--surface);
	color: var(--accent-text);
	font-weight: var(--weight-semibold);
	cursor: pointer;

	&:hover {
		background-image: linear-gradient(var(--surface-hover), var(--surface-hover));
	}

	&:focus-visible {
		@include focus-ring;
	}
}

.switch-view-dropdown-label {
	min-inline-size: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.dropdown-icon {
	flex-shrink: 0;
	color: var(--text-secondary);
	font-size: var(--text-2xs);
}

.project-view-banners {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
	margin-block-end: var(--space-4);
}

// Same shape as Message (leading status rule over a faint tint), so both notices read as one family.
.completion-notice {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-1) var(--space-2);
	padding: var(--space-2) var(--space-3);
	border: 1px solid var(--border-subtle);
	border-inline-start: 3px solid var(--success);
	border-radius: var(--radius-md);
	background: var(--tint-success);
	color: var(--text-primary);
	font-size: var(--text-md);

	a {
		margin-inline-start: auto;
		color: var(--accent-text);
		font-weight: var(--weight-medium);
	}
}

.completion-notice__icon {
	color: var(--success);
}

.project-title-print {
	position: absolute;
	inline-size: 1px;
	block-size: 1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;

	@media print {
		position: static;
		inline-size: auto;
		block-size: auto;
		overflow: visible;
		clip-path: none;
		margin-block-end: var(--space-2);
		font-size: var(--text-2xl);
		text-align: center;
		white-space: normal;
	}
}

@media screen and (max-width: $tablet) {
	.switch-view-container {
		margin-block-end: var(--space-3);
	}

	.project-view-actions {
		flex: 1 1 auto;
	}
}
</style>
