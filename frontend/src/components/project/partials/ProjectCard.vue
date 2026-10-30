<template>
	<div
		class="project-card"
		:class="{
			'has-light-text': Boolean(background),
			'has-background': Boolean(blurHashUrl || background),
			'has-status': hasStatus,
		}"
		:style="{
			'border-inline-start': project.hex_color ? `0.25rem solid ${project.hex_color}` : undefined,
			'background-image': blurHashUrl ? `url(${blurHashUrl})` : undefined,
		}"
	>
		<div
			class="project-background background-fade-in"
			:class="{'is-visible': background}"
			:style="{'background-image': background ? `url(${background})` : undefined}"
		/>
		<span
			v-if="hasStatus"
			class="project-card-status"
		>
			<ProjectStatusBadges
				:is-completed="isCompleted"
				:is-archived="project.is_archived"
			/>
		</span>

		<div class="project-card-text">
			<p
				v-if="parentPath"
				class="project-parent"
			>
				{{ $t('projectList.parentPath', {path: parentPath}) }}
			</p>
			<div
				class="project-title"
				aria-hidden="true"
			>
				<span
					v-if="project.id < -1"
					class="saved-filter-icon icon"
				>
					<Icon icon="filter" />
				</span>
				{{ getProjectTitle(project) }}
			</div>
		</div>
		<BaseButton
			class="project-button"
			:aria-label="project.title"
			:title="textOnlyDescription"
			:to="{
				name: 'project.index',
				params: { projectId: project.id}
			}"
		/>
		<div class="project-actions">
			<BaseButton
				v-if="!project.is_archived && project.id > -1"
				class="favorite"
				:aria-label="project.is_favorite ? $t('project.unfavorite') : $t('project.favorite')"
				:class="{'is-favorite': project.is_favorite}"
				@click.prevent.stop="toggleProjectFavorite"
			>
				<Icon :icon="project.is_favorite ? 'star' : ['far', 'star']" />
			</BaseButton>
			<ProjectSettingsDropdown
				v-if="typeof project.max_permission === 'number' && project.max_permission > PERMISSIONS.READ"
				class="settings-dropdown"
				:project="project"
			/>
		</div>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'
import {usePatchProjectFavoriteMutation, type ProjectResponse} from '@/client/queries/projects'

import BaseButton from '@/components/base/BaseButton.vue'
import ProjectSettingsDropdown from '@/components/project/ProjectSettingsDropdown.vue'
import ProjectStatusBadges from '@/components/project/partials/ProjectStatusBadges.vue'
import {PERMISSIONS} from '@/constants/permissions'

import {useProjectBackground} from '@/composables/useProjectBackground'
import {useProjects} from '@/composables/useProjects'
import {getProjectTitle} from '@/helpers/getProjectTitle'

const props = defineProps<{
	project: ProjectResponse,
}>()

const {background, blurHashUrl} = useProjectBackground(() => props.project)
const projectList = useProjects()

const favoriteMutation = usePatchProjectFavoriteMutation()

async function toggleProjectFavorite() {
	if (props.project.id <= 0 || props.project.is_archived) {
		return
	}
	await favoriteMutation.mutateAsync({id: props.project.id, isFavorite: !props.project.is_favorite})
}

const textOnlyDescription = computed(() => {
	return props.project.description ? props.project.description.replace(/<[^>]*>/g, '') : ''
})

const isCompleted = computed(() => Boolean(props.project.is_completed))
const hasStatus = computed(() => isCompleted.value || props.project.is_archived)

const parentPath = computed(() => {
	if (props.project.parent_project_id <= 0) {
		return ''
	}
	return projectList.getAncestors(props.project)
		.slice(0, -1)
		.map(ancestor => getProjectTitle(ancestor))
		.join(' / ')
})
</script>

<style lang="scss" scoped>
.project-card {
	--project-card-padding: 1rem;
	--project-card-action-size: 2rem;
	--project-title-lines: 3;
	background: var(--white);
	padding: var(--project-card-padding);
	border-radius: $radius;
	box-shadow: var(--shadow-sm);
	transition: box-shadow $transition;
	position: relative;
	min-inline-size: 0;

	display: flex;
	flex-direction: column;
	gap: .5rem;

	&:hover {
		box-shadow: var(--shadow-md);
	}

	&:active,
	&:focus {
		box-shadow: var(--shadow-xs) !important;
	}

	> * {
		// so the elements are on top of the background
		position: relative;
	}

	&.has-status {
		--project-title-lines: 2;
	}

	// Always-visible touch actions would collide with a third title line.
	@media (pointer: coarse) {
		--project-card-action-size: 2.75rem;
		--project-title-lines: 2;
	}

	@media screen and (width <= 30rem) {
		--project-card-padding: .75rem;
		--project-title-lines: 2;
	}
}

.has-background,
.project-background {
	background-size: cover;
	background-repeat: no-repeat;
	background-position: center;
}

// Clip here instead of on the card so the settings dropdown can overflow it.
.project-background {
	border-radius: inherit;
}

.project-background,
.project-button {
	position: absolute;
	inset-block-start: 0;
	inset-inline-end: 0;
	inset-block-end: 0;
	inset-inline-start: 0;
}

.project-card-status {
	align-self: flex-start;
	max-inline-size: calc(100% - 2 * var(--project-card-action-size));
	border-radius: 999px;
}

// The tinted badges are translucent and would be unreadable on a photo.
.has-background .project-card-status {
	background: var(--white);
}

.project-card-text {
	display: flex;
	flex-direction: column;
	gap: .125rem;
	min-block-size: 0;
	margin-block-start: auto;
}

.project-parent {
	margin: 0;
	overflow: hidden;
	color: var(--text-muted);
	font-size: .75rem;
	line-height: 1.4;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.project-title {
	font-family: $vikunja-font;
	font-weight: 400;
	font-size: 1.5rem;
	line-height: 1.25;
	color: var(--text);
	min-block-size: 0;
	margin-block-end: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	word-break: break-word;

	display: -webkit-box;
	-webkit-line-clamp: var(--project-title-lines);
	-webkit-box-orient: vertical;

	@media screen and (width <= 30rem) {
		font-size: 1.25rem;
	}
}

.has-light-text .project-title {
	color: var(--grey-100);
}

.has-background .project-title,
.has-background .project-parent {
	text-shadow:
		0 0 10px var(--black),
		1px 1px 5px var(--grey-700),
		-1px -1px 5px var(--grey-700);
	color: var(--white);
}

.project-actions {
	position: absolute;
	// Centre the action icons on the first badge row instead of the hit area's corner.
	inset-block-start: max(.25rem, calc(var(--project-card-padding) + .75rem - var(--project-card-action-size) / 2));
	inset-inline-end: max(.25rem, calc(var(--project-card-padding) + .5rem - var(--project-card-action-size) / 2));
	display: flex;
	align-items: center;
}

.favorite,
.settings-dropdown :deep(.dropdown-trigger) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: var(--project-card-action-size);
	min-block-size: var(--project-card-action-size);
	border-radius: $radius;
}

.favorite,
.settings-dropdown {
	transition: opacity $transition, color $transition;
	opacity: 1;

	&:hover {
		color: var(--warning);
	}

	&.is-favorite {
		opacity: 1;
		color: var(--warning);
	}
}

@media(hover: hover) and (pointer: fine) {
	.project-card .favorite,
	.project-card .settings-dropdown {
		opacity: 0;
	}

	// Keyboard users reach the actions by tabbing into the card.
	.project-card:hover .favorite,
	.project-card:hover .settings-dropdown,
	.project-card:focus-within .favorite,
	.project-card:focus-within .settings-dropdown,
	.project-card .favorite.is-favorite,
	.settings-dropdown:has([aria-expanded="true"]) {
		opacity: 1;
	}
}

.background-fade-in {
	opacity: 0;
	transition: opacity $transition;
	transition-delay: $transition-duration * 2; // To fake an appearing background

	&.is-visible {
		opacity: 1;
	}
}

.saved-filter-icon {
	color: var(--text-muted);
	font-size: .75em;
}

@media (prefers-reduced-motion: reduce) {
	.project-card,
	.favorite,
	.settings-dropdown,
	.background-fade-in {
		transition: none;
	}
}
</style>
