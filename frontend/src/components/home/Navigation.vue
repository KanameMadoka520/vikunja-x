<template>
	<aside
		:class="{'is-active': baseStore.menuActive, 'is-resizing': isResizing}"
		class="menu-container"
		:style="{'--sidebar-width': sidebarWidthStyle}"
	>
		<nav
			class="menu top-menu"
			:aria-label="$t('navigation.main')"
		>
			<RouterLink
				:to="{name: 'home'}"
				class="logo"
				:aria-label="$t('navigation.home')"
			>
				<Logo
					width="164"
					height="48"
				/>
			</RouterLink>
			<menu
				class="menu-list other-menu-items"
				:aria-label="t('navigation.groups.daily')"
			>
				<li>
					<RouterLink
						v-shortcut="SHORTCUTS.navigation.overview"
						data-tour="nav-overview"
						:to="{ name: 'home'}"
					>
						<span class="menu-item-icon icon">
							<Icon icon="house" />
						</span>
						{{ t('workspace.title') }}
					</RouterLink>
				</li>
				<li>
					<RouterLink
						v-shortcut="SHORTCUTS.navigation.upcoming"
						data-tour="nav-upcoming"
						:to="{ name: 'tasks.range'}"
					>
						<span class="menu-item-icon icon">
							<Icon :icon="['far', 'calendar-alt']" />
						</span>
						{{ t('navigation.upcoming') }}
					</RouterLink>
				</li>
				<li>
					<RouterLink
						v-shortcut="SHORTCUTS.navigation.projects"
						data-tour="nav-projects"
						:to="{ name: 'projects.index'}"
					>
						<span class="menu-item-icon icon">
							<Icon icon="layer-group" />
						</span>
						{{ t('project.projects') }}
					</RouterLink>
				</li>
				<li>
					<RouterLink
						data-tour="nav-ai"
						:to="{name: 'tcy-ai'}"
					>
						<span class="menu-item-icon icon"><AronaAvatar size="small" /></span>{{ t('tcymc.text.ai_task_assistant') }}
					</RouterLink>
				</li>
			</menu>

			<p
				id="nav-group-records"
				class="menu-label nav-group-label"
			>
				{{ t('navigation.groups.records') }}
			</p>
			<menu
				class="menu-list other-menu-items"
				aria-labelledby="nav-group-records"
			>
				<li>
					<RouterLink :to="{name: 'projects.history'}">
						<span class="menu-item-icon icon"><Icon :icon="['far', 'calendar-check']" /></span>{{ t('projectHistory.title') }}
					</RouterLink>
				</li>
				<li>
					<RouterLink :to="{name: 'drive'}">
						<span class="menu-item-icon icon"><Icon icon="folder" /></span>{{ t('drive.title') }}
					</RouterLink>
				</li>
				<li v-if="timeTrackingEnabled">
					<RouterLink :to="{ name: 'time-tracking'}">
						<span class="menu-item-icon icon">
							<Icon :icon="['far', 'clock']" />
						</span>
						{{ t('timeTracking.title') }}
					</RouterLink>
				</li>
			</menu>

			<p
				id="nav-group-organize"
				class="menu-label nav-group-label"
			>
				{{ t('navigation.groups.organize') }}
			</p>
			<menu
				class="menu-list other-menu-items"
				aria-labelledby="nav-group-organize"
			>
				<li>
					<RouterLink
						v-shortcut="SHORTCUTS.navigation.labels"
						:to="{ name: 'labels.index'}"
					>
						<span class="menu-item-icon icon">
							<Icon icon="tags" />
						</span>
						{{ t('label.title') }}
					</RouterLink>
				</li>
				<li>
					<RouterLink
						v-shortcut="SHORTCUTS.navigation.teams"
						data-tour="nav-teams"
						:to="{ name: 'teams.index'}"
					>
						<span class="menu-item-icon icon">
							<Icon icon="users" />
						</span>
						{{ t('team.title') }}
					</RouterLink>
				</li>
			</menu>
		</nav>

		<Loading
			v-if="projectList.isLoading"
			variant="small"
		/>
		<template v-else>
			<nav
				v-if="favoriteProjects.length"
				class="menu"
				:aria-label="$t('project.pseudo.favorites.title')"
			>
				<ProjectsNavigation
					:model-value="favoriteProjects"
					:can-edit-order="false"
					:can-collapse="false"
				/>
			</nav>
			
			<nav
				v-if="savedFilterProjects.length"
				class="menu"
				:aria-label="$t('navigation.savedFilters')"
			>
				<ProjectsNavigation
					:model-value="savedFilterProjects"
					:can-edit-order="false"
					:can-collapse="false"
				/>
			</nav>

			<nav
				class="menu"
				:aria-label="$t('project.projects')"
			>
				<ProjectsNavigation
					:model-value="projects"
					:can-edit-order="true"
					:can-collapse="true"
				/>
			</nav>
		</template>

		<div class="mbs-auto">
			<TcyBrand /><PoweredByLink utm-medium="navigation" /><SystemStatus />
		</div>

		<div
			v-if="!isMobile"
			class="resize-handle"
			@mousedown="startResize"
			@touchstart="startResize"
		/>
	</aside>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
const {t} = useI18n({useScope: 'global'})
import {computed} from 'vue'
import {useEventListener} from '@vueuse/core'
import AronaAvatar from '@/components/ai/AronaAvatar.vue'
import SystemStatus from '@/components/home/SystemStatus.vue'
import TcyBrand from '@/components/home/TcyBrand.vue'

import {SHORTCUTS} from '@/constants/shortcuts'
import PoweredByLink from '@/components/home/PoweredByLink.vue'
import Logo from '@/components/home/Logo.vue'
import Loading from '@/components/misc/Loading.vue'

import {useBaseStore} from '@/stores/base'
import {useProjects} from '@/composables/useProjects'
import {useConfigStore} from '@/stores/config'
import {PRO_FEATURE} from '@/constants/proFeatures'
import ProjectsNavigation from '@/components/home/ProjectsNavigation.vue'
import {useSidebarResize} from '@/composables/useSidebarResize'

const baseStore = useBaseStore()
const projectList = useProjects()
const configStore = useConfigStore()

const timeTrackingEnabled = computed(() => configStore.isProFeatureEnabled(PRO_FEATURE.TIME_TRACKING))

const {sidebarWidthStyle, isResizing, startResize, isMobile} = useSidebarResize()

// The mobile drawer is modal-like; Escape closes it unless a dialog on top owns the key.
useEventListener(document, 'keydown', (event: KeyboardEvent) => {
	if (event.key !== 'Escape' || event.defaultPrevented || !isMobile.value || !baseStore.menuActive) return
	if (document.querySelector('dialog[open]')) return
	baseStore.setMenuActive(false)
	document.querySelector<HTMLElement>('.menu-show-button')?.focus()
})

const projects = computed(() => projectList.notArchivedRootProjects)
const favoriteProjects = computed(() => projectList.favoriteProjects)
const savedFilterProjects = computed(() => projectList.savedFilterProjects)
</script>

<style lang="scss" scoped>
.logo {
	display: block;

	padding-inline-start: 1rem;
	margin-inline-end: 1rem;
	margin-block-end: 1rem;

	@media screen and (min-width: $tablet) {
		display: none;
	}
}

.menu-container {
	--sidebar-width: #{$navbar-width};

	display: flex;
	flex-direction: column;
	background: var(--site-background);
	color: $vikunja-nav-color;
	padding: 1rem 0;
	// Hidden once the slide-out finishes so off-screen links leave the tab order;
	// shortcuts still reach them through programmatic click().
	visibility: hidden;
	transition: transform $transition-duration ease-in, visibility 0s linear $transition-duration;
	position: fixed;
	inset-block-start: $navbar-height;
	inset-block-end: 0;
	inset-inline-start: 0;
	transform: translateX(-100%);
	inline-size: var(--sidebar-width);
	overflow-y: auto;

	[dir="rtl"] & {
		transform: translateX(100%);
	}

	@media screen and (max-width: $tablet) {
		inset-block-start: 0;
		inline-size: 70vw;
		z-index: 20;
	}

	&.is-active {
		visibility: visible;
		transform: translateX(0);
		transition: transform $transition-duration ease-out, visibility 0s;
	}

	&.is-resizing {
		transition: none;
	}

	@media (prefers-reduced-motion: reduce) {
		&,
		&.is-active {
			transition: none;
		}
	}
}

.resize-handle {
	position: absolute;
	inset-block-start: 0;
	inset-block-end: 0;
	inset-inline-end: 0;
	inline-size: 4px;
	cursor: ew-resize;
	background: transparent;
	transition: background-color $transition-duration ease;
	touch-action: none;

	&:hover,
	&:active {
		background-color: var(--primary);
	}
}

.top-menu .menu-list {
	li {
		font-weight: 600;
		font-family: $vikunja-font;
	}

	.list-menu-link,
	li > a {
		padding-inline-start: 2rem;
		display: inline-block;

		.icon {
			padding-block-end: .25rem;
		}
	}
}

.menu + .menu {
	padding-block-start: math.div($navbar-padding, 2);
}

.nav-group-label {
	margin: 1rem 0 .25rem;
	padding-inline: 2rem 1rem;
	color: var(--text-muted);
	font-size: .75rem;
	font-weight: 600;
	letter-spacing: .04em;
	text-transform: uppercase;
}

// Fine pointers get a denser list; touch keeps the 44px rows from navigation.scss.
@media (hover: hover) and (pointer: fine) {
	.top-menu .menu-list.other-menu-items li {
		block-size: 40px;
	}
}
</style>
