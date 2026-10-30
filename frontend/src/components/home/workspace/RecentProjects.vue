<template>
	<section
		v-if="projects.length > 0"
		class="workspace-side-section recent-projects"
		aria-labelledby="recent-projects-heading"
	>
		<h2
			id="recent-projects-heading"
			class="workspace-side-heading"
		>
			{{ $t('home.lastViewed') }}
		</h2>
		<ul class="recent-project-list">
			<li
				v-for="project in projects"
				:key="project.id"
				:data-project-id="project.id"
			>
				<RouterLink
					:to="{name: 'project.index', params: {projectId: project.id}}"
					class="recent-project-link"
				>
					<span
						class="recent-project-marker"
						aria-hidden="true"
					>
						<Icon
							v-if="project.id < -1"
							icon="filter"
						/>
						<Icon
							v-else-if="project.id === -1"
							icon="star"
						/>
						<ColorBubble
							v-else-if="project.hex_color !== ''"
							:color="project.hex_color"
						/>
						<span
							v-else
							class="recent-project-dot"
						/>
					</span>
					<span class="recent-project-title">{{ getProjectTitle(project) }}</span>
					<ProjectStatusBadges
						:is-completed="Boolean(project.is_completed)"
						:is-archived="project.is_archived"
					/>
				</RouterLink>
			</li>
		</ul>
	</section>
</template>

<script setup lang="ts">
import {computed} from 'vue'

import ColorBubble from '@/components/misc/ColorBubble.vue'
import Icon from '@/components/misc/Icon'
import ProjectStatusBadges from '@/components/project/partials/ProjectStatusBadges.vue'

import {getHistory} from '@/modules/projectHistory'
import {getProjectTitle} from '@/helpers/getProjectTitle'
import {useProjects} from '@/composables/useProjects'
import {useAuthStore} from '@/stores/auth'

const authStore = useAuthStore()
const projectList = useProjects()

const projects = computed(() => {
	// Without this guard the list resolves projects right after logout.
	if (!authStore.authenticated || authStore.settings.frontend_settings.show_last_viewed === false) {
		return []
	}
	return getHistory()
		.map(entry => projectList.projects[entry.id])
		.filter(project => Boolean(project))
})
</script>

<style lang="scss" scoped>
.recent-project-list {
	margin: 0;
	padding: 0;
	list-style: none;
}

.recent-project-link {
	display: flex;
	align-items: center;
	gap: .625rem;
	min-block-size: 2.5rem;
	padding: .375rem .5rem;
	border-radius: $radius-large;
	color: var(--text);

	&:hover {
		background: var(--grey-100);
		color: var(--text-strong);
	}

	@media (pointer: coarse) {
		min-block-size: 2.75rem;
	}
}

.recent-project-marker {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	inline-size: 1rem;
	color: var(--grey-400);

	:deep(.color-bubble) {
		margin: 0;
	}

	svg {
		inline-size: .8rem;
		block-size: .8rem;
	}
}

.recent-project-dot {
	inline-size: .5rem;
	block-size: .5rem;
	border-radius: 50%;
	background: var(--grey-300);
}

.recent-project-title {
	flex: 1;
	min-inline-size: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
