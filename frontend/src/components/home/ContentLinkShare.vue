<template>
	<div
		:class="{
			'has-background': background,
			'link-share-is-fullwidth': isFullWidth,
		}"
		:style="backgroundStyle"
		class="link-share-container"
	>
		<div class="link-share-view">
			<header class="link-share-header">
				<Logo
					v-if="logoVisible"
					class="link-share-logo"
				/>
				<Message
					v-if="projectLoadError"
					variant="danger"
					class="link-share-error"
				>
					{{ $t('sharing.projectLoadError') }}
					<XButton
						variant="secondary"
						class="is-small mis-2"
						:shadow="false"
						@click="retryProjectLoad"
					>
						{{ $t('sharing.retry') }}
					</XButton>
				</Message>
				<h1
					v-else
					class="title link-share-title"
				>
					<RouterLink
						v-if="currentProject && projectRoute"
						:to="projectRoute"
					>
						{{ currentProject.title === '' ? $t('misc.loading') : currentProject.title }}
					</RouterLink>
					<template v-else>
						{{ $t('misc.loading') }}
					</template>
				</h1>
			</header>
			<Card
				class="has-text-start view"
				:has-content="false"
			>
				<RouterView />
				<PoweredByLink utm-medium="link_share" />
			</Card>
		</div>
	</div>
</template>

<script lang="ts" setup>
import {computed, ref, watch, onMounted} from 'vue'
import {useRoute} from 'vue-router'

import {useBaseStore} from '@/stores/base'
import {useAuthStore} from '@/stores/auth'
import {useCurrentProject} from '@/composables/useCurrentProject'
import {useRoutineDayRefresh} from '@/composables/useRoutineDayRefresh'
import {ensureProject} from '@/client/queries/projects'

import Logo from '@/components/home/Logo.vue'
import PoweredByLink from './PoweredByLink.vue'
import Card from '@/components/misc/Card.vue'
import Message from '@/components/misc/Message.vue'
import {PROJECT_VIEW_KINDS} from '@/constants/projectView'

const baseStore = useBaseStore()
const authStore = useAuthStore()
const route = useRoute()

const {currentProject} = useCurrentProject()
// One app-level clock re-reads visible routines when a new local day starts or the window regains focus.
useRoutineDayRefresh()
const background = computed(() => baseStore.background)
// link-share.scss paints it on a fixed layer instead of the scrolling container.
const backgroundStyle = computed(() => background.value
	? {'--link-share-background': `url(${JSON.stringify(background.value)})`}
	: undefined)
const logoVisible = computed(() => baseStore.logoVisible)
const projectLoadError = ref(false)

// Ensure project is loaded for link share
async function ensureProjectLoaded() {
	if (!authStore.authLinkShare || !route.params.projectId) {
		return
	}
	
	try {
		projectLoadError.value = false
		
		// Load project if not already loaded
		const projectId = Number(route.params.projectId)
		if (!currentProject.value || currentProject.value.id !== projectId) {
			await ensureProject(projectId)
		}
	} catch (e) {
		console.error('Failed to load project for link share:', e)
		projectLoadError.value = true
	}
}

async function retryProjectLoad() {
	await ensureProjectLoaded()
}

// Watch for route changes and ensure project is loaded
watch(() => route.params.projectId, ensureProjectLoaded, { immediate: true })

onMounted(ensureProjectLoaded)

const projectRoute = computed(() => {
	if (!currentProject.value) return undefined

	const hash = route.hash // Preserve link share hash

	// Default to the first available view or list view
	const projectId = currentProject.value.id
	const firstView = currentProject.value.views[0]
	
	if (firstView) {
		return {
			name: 'project.view',
			params: { projectId, viewId: firstView.id },
			hash,
		}
	}
	
	return {
		name: 'project.index', 
		params: { projectId },
		hash,
	}
})

const isFullWidth = computed(() => {
	const viewId = route.params?.viewId ?? null
	const projectId = route.params?.projectId ?? null
	if (!viewId || !projectId) {
		return false
	}

	const view = currentProject.value?.id === Number(projectId)
		? currentProject.value.views.find(view => view.id === Number(viewId))
		: undefined

	return view?.view_kind === PROJECT_VIEW_KINDS.KANBAN ||
		view?.view_kind === PROJECT_VIEW_KINDS.GANTT
})
</script>

<style lang="scss" scoped>
.link-share-container {
	padding: var(--space-4) var(--page-gutter) var(--space-6);
}

.link-share-view {
	inline-size: 100%;
	max-inline-size: var(--page-max-width);
	margin-inline: auto;

	.link-share-is-fullwidth & {
		max-inline-size: none;
	}
}

.link-share-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-2) var(--space-4);
	margin-block-end: var(--space-4);

	// Over a project picture the title gets a quiet surface instead of a glow.
	.has-background & {
		inline-size: fit-content;
		max-inline-size: 100%;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface) 90%, transparent);
		box-shadow: var(--elevation-1);
	}
}

.link-share-logo :deep(.logo) {
	display: block;
	inline-size: auto;
	block-size: 1.75rem;
	max-inline-size: 8rem;
}

.link-share-header .link-share-title {
	min-inline-size: 0;
	margin: 0;
	color: var(--text-primary);
	font-size: var(--text-xl);
	font-weight: var(--weight-semibold);
	line-height: var(--leading-tight);
	overflow-wrap: anywhere;

	a {
		color: inherit;

		&:hover {
			color: var(--accent-text);
			text-decoration: underline;
			text-underline-offset: .2em;
		}
	}
}

.link-share-error {
	flex: 1 1 100%;
}

.link-share-container.has-background .view {
	background-color: transparent;
	border: none;
}

.link-share-container:not(.has-background) {
	:deep(.loader-container, .gantt-chart-container > .card) {
		box-shadow: none !important;
		border: none;

		.task-add {
			padding: var(--space-4) 0 0;
		}
	}
}
</style>
