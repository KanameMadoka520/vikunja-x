<template>
	<header
		:class="{ 'has-background': background, 'menu-active': menuActive }"
		class="navbar d-print-none"
		:style="{'--sidebar-width': sidebarWidthStyle}"
		:inert="drawerOpen"
	>
		<div class="navbar-start">
			<RouterLink
				:to="{ name: 'home' }"
				class="logo-link"
				:aria-label="$t('navigation.home')"
			>
				<Logo
					width="164"
					height="48"
				/>
			</RouterLink>

			<MenuButton class="menu-button" />
		</div>

		<div
			v-if="currentProject?.id"
			class="project-title-wrapper"
		>
			<ColorBubble
				v-if="currentProject.hex_color"
				:color="currentProject.hex_color"
				class="project-title-color"
			/>
			<span class="project-title">
				{{ currentProject.title === '' ? $t('misc.loading') : getProjectTitle(currentProject) }}
			</span>

			<BaseButton
				v-if="!isEditorContentEmpty(currentProject.description)"
				:to="{ name: 'project.info', params: { projectId: currentProject.id } }"
				class="project-title-button"
			>
				<span class="is-sr-only">{{ $t('project.description') }}</span>
				<Icon icon="circle-info" />
			</BaseButton>

			<ProjectSettingsDropdown
				v-if="canWriteCurrentProject && currentProject.id !== -1"
				class="project-title-dropdown"
				:project="currentProject"
			>
				<template #trigger="{ toggleOpen, open }">
					<BaseButton
						class="project-title-button"
						:aria-expanded="open"
						@click="toggleOpen"
					>
						<span class="is-sr-only">{{ $t('project.openSettingsMenu') }}</span>
						<Icon
							icon="ellipsis-h"
							class="icon"
						/>
					</BaseButton>
				</template>
			</ProjectSettingsDropdown>
		</div>

		<div
			v-else-if="pageTitle"
			class="project-title-wrapper"
		>
			<span class="project-title">{{ pageTitle }}</span>
		</div>

		<div class="navbar-end">
			<TimerBadge />
			<OpenQuickActions data-tour="quick-search" />
			<BaseButton
				class="trigger-button guide-help"
				data-tour="guide-help"
				:title="t('tour.open')"
				:aria-label="t('tour.open')"
				@click="tour.show()"
			>
				<Icon :icon="['far', 'circle-question']" />
			</BaseButton>
			<Notifications />
			<Dropdown>
				<template #trigger="{ toggleOpen, open }">
					<BaseButton
						class="username-dropdown-trigger"
						data-tour="account-menu"
						variant="secondary"
						:shadow="false"
						:aria-expanded="open"
						@click="toggleOpen"
					>
						<UserAvatar
							:user="authStore.info"
							:size="56"
							class="avatar"
						/>
						<span class="username">{{ authStore.userDisplayName }}</span>
						<span
							class="dropdown-icon icon is-small"
							:class="{'is-open': open}"
						>
							<Icon icon="chevron-down" />
						</span>
					</BaseButton>
				</template>

				<DropdownItem
					icon="cog"
					:to="{ name: 'user.settings' }"
				>
					{{ $t('user.settings.title') }}
				</DropdownItem>
				<DropdownItem
					v-if="adminPanelEnabled && authStore.info?.is_admin"
					icon="user-edit"
					:to="{ name: 'admin.overview' }"
				>
					{{ $t('admin.title') }}
				</DropdownItem>
				<DropdownItem
					v-if="imprintUrl"
					icon="circle-info"
					:href="imprintUrl"
				>
					{{ $t('navigation.imprint') }}
				</DropdownItem>
				<DropdownItem
					v-if="privacyPolicyUrl"
					icon="lock"
					:href="privacyPolicyUrl"
				>
					{{ $t('navigation.privacy') }}
				</DropdownItem>
				<DropdownItem
					icon="code"
					@click="openDiagnostics"
				>
					{{ t('debug.title') }}<span v-if="diagnostics.length"> ({{ diagnostics.length }})</span>
				</DropdownItem>
				<DropdownItem
					icon="compass"
					@click="tour.show()"
				>
					{{ t('tour.open') }}
				</DropdownItem>
				<DropdownItem
					icon="keyboard"
					@click="baseStore.setKeyboardShortcutsActive(true)"
				>
					{{ $t('keyboardShortcuts.title') }}
				</DropdownItem>
				<DropdownItem
					icon="circle-info"
					:to="{ name: 'about' }"
				>
					{{ $t('about.title') }}
				</DropdownItem>
				<DropdownItem
					icon="sign-out-alt"
					@click="authStore.logout()"
				>
					{{ $t('user.auth.logout') }}
				</DropdownItem>
			</Dropdown>
		</div>
	</header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {diagnostics, openDiagnostics} from '@/helpers/diagnostics'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

import { PERMISSIONS as Permissions } from '@/constants/permissions'
import { PRO_FEATURE } from '@/constants/proFeatures'

import ProjectSettingsDropdown from '@/components/project/ProjectSettingsDropdown.vue'
import Dropdown from '@/components/misc/Dropdown.vue'
import DropdownItem from '@/components/misc/DropdownItem.vue'
import Notifications from '@/components/notifications/Notifications.vue'
import TimerBadge from '@/components/time-tracking/TimerBadge.vue'
import Logo from '@/components/home/Logo.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import ColorBubble from '@/components/misc/ColorBubble.vue'
import MenuButton from '@/components/home/MenuButton.vue'
import OpenQuickActions from '@/components/misc/OpenQuickActions.vue'
import UserAvatar from '@/components/misc/UserAvatar.vue'

import { getProjectTitle } from '@/helpers/getProjectTitle'
import { isEditorContentEmpty } from '@/helpers/editorContentEmpty'

import { useBaseStore } from '@/stores/base'
import {useGuidedTourStore} from '@/stores/guidedTour'
import { useConfigStore } from '@/stores/config'
import { useAuthStore } from '@/stores/auth'
import {useCurrentProject} from '@/composables/useCurrentProject'
import {useSidebarResize} from '@/composables/useSidebarResize'

const baseStore = useBaseStore()
const tour = useGuidedTourStore()
const {currentProject} = useCurrentProject()
const background = computed(() => baseStore.background)
const canWriteCurrentProject = computed(() =>
	currentProject.value?.max_permission !== null &&
	currentProject.value?.max_permission !== undefined &&
	currentProject.value.max_permission > Permissions.READ,
)
const menuActive = computed(() => baseStore.menuActive)
// The start cluster follows the sidebar width so the title lines up with the content edge.
const {sidebarWidthStyle, isMobile} = useSidebarResize()
const drawerOpen = computed(() => isMobile.value && menuActive.value)

// Standalone pages (no project) surface their route's title in the header.
const route = useRoute()
const { t } = useI18n()
const pageTitle = computed(() => {
	const title = route.meta.title as string | undefined
	return title ? t(title) : ''
})

const authStore = useAuthStore()

const configStore = useConfigStore()
const imprintUrl = computed(() => configStore.legal.imprint_url)
const privacyPolicyUrl = computed(() => configStore.legal.privacy_policy_url)
const adminPanelEnabled = computed(() => configStore.isProFeatureEnabled(PRO_FEATURE.ADMIN_PANEL))
</script>

<style lang="scss" scoped>
.navbar {
	--navbar-button-size: var(--control-height);
	--navbar-icon-size: 1.0625rem;

	position: fixed;
	inset-block-start: 0;
	inset-inline: 0;
	z-index: var(--layer-header);

	display: flex;
	align-items: center;
	gap: var(--space-2);
	block-size: var(--header-height);
	padding-inline: var(--space-3) var(--space-2);

	background: var(--surface-app);
	border-block-end: 1px solid var(--border-subtle);

	// Over a project picture the bar turns into a translucent surface instead of an opaque grey band.
	&.has-background {
		background: color-mix(in srgb, var(--surface-app) 78%, transparent);
		backdrop-filter: blur(12px) saturate(140%);
	}

	@media screen and (min-width: $tablet) {
		padding-inline: var(--space-4) var(--space-3);
	}

	// Phones: every control keeps a 36px target and the title gets the remaining room.
	@media screen and (width <= 480px) {
		--navbar-button-size: 2.25rem;

		gap: var(--space-1);
		padding-inline: var(--space-1);
	}

	// FIXME: notifications should provide a slot for the icon instead, so that we can style it as we want
	:deep(.trigger-button) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		min-inline-size: var(--navbar-button-size);
		block-size: var(--navbar-button-size);
		border-radius: $radius;
		color: var(--text-secondary);
		font-size: var(--navbar-icon-size);
		transition:
			background-color var(--motion-fast) var(--ease-standard),
			color var(--motion-fast) var(--ease-standard);

		&:hover {
			background-color: var(--surface-hover);
			color: var(--text-primary);
		}

		&[aria-expanded="true"] {
			background-color: var(--surface-active);
			color: var(--text-primary);
		}
	}
}

.navbar-start {
	display: flex;
	align-items: center;
	flex-shrink: 0;
	gap: var(--space-2);

	// With the sidebar open the title starts at the content edge.
	@media screen and (min-width: $tablet) {
		.menu-active & {
			inline-size: calc(var(--sidebar-width) - var(--space-4));
		}
	}
}

.logo-link {
	display: none;

	@media screen and (min-width: $tablet) {
		display: flex;
		align-items: center;
		border-radius: $radius;

		:deep(.logo) {
			block-size: 1.75rem;
			inline-size: auto;
		}
	}
}

.menu-button {
	flex: 0 0 auto;

	@media screen and (min-width: $tablet) {
		margin-inline-start: auto;
	}
}

.project-title-wrapper {
	display: flex;
	align-items: center;
	flex: 1 1 auto;
	gap: var(--space-1);
	// lets the title truncate inside the flex row
	min-inline-size: 0;

	@media screen and (min-width: $tablet) {
		.menu-active & {
			padding-inline-start: calc(var(--page-gutter) - var(--space-2));
		}
	}
}

.project-title-color {
	inline-size: .625rem;
	block-size: .625rem;
	margin-inline-end: var(--space-1);
}

.project-title {
	min-inline-size: 0;
	overflow: hidden;
	color: var(--text-primary);
	font-size: var(--text-base);
	font-weight: var(--weight-semibold);
	line-height: var(--leading-tight);
	text-overflow: ellipsis;
	white-space: nowrap;

	@media screen and (min-width: $tablet) {
		font-size: var(--text-lg);
	}

	// Phones wrap a long title onto a second line instead of cutting it after a few letters.
	@media screen and (width <= 480px) {
		display: -webkit-box;
		font-size: var(--text-md);
		line-height: 1.2;
		white-space: normal;
		overflow-wrap: anywhere;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}
}

.project-title-dropdown {
	display: flex;
	flex-shrink: 0;
}

.project-title-button {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	inline-size: var(--navbar-button-size);
	block-size: var(--navbar-button-size);
	border-radius: $radius;
	color: var(--text-secondary);
	font-size: var(--navbar-icon-size);

	&:hover {
		background-color: var(--surface-hover);
		color: var(--text-primary);
	}

	@media screen and (width <= 480px) {
		inline-size: 1.75rem;
	}
}

.navbar-end {
	display: flex;
	align-items: center;
	flex: 0 0 auto;
	gap: var(--space-1);
	margin-inline-start: auto;

	@media screen and (width <= 480px) {
		gap: 0;
	}

	// A running timer keeps its elapsed time and stop button but shrinks on phones.
	:deep(.timer-badge) {
		block-size: var(--navbar-button-size);
		font-size: var(--text-md);

		@media screen and (width <= 480px) {
			gap: 0;
			font-size: var(--text-xs);

			.timer-badge__elapsed {
				padding-inline: var(--space-1) 0;
			}

			.timer-badge__stop {
				padding-inline: var(--space-1);
			}
		}
	}
}

.username-dropdown-trigger {
	display: inline-flex;
	align-items: center;
	gap: var(--space-2);
	block-size: var(--navbar-button-size);
	padding-inline: var(--space-1);
	border-radius: $radius;
	color: var(--text-primary);
	font-size: var(--text-md);
	font-weight: var(--weight-medium);

	&:hover,
	&[aria-expanded="true"] {
		background-color: var(--surface-hover);
	}

	:deep(.avatar) {
		margin-inline-end: 0;
	}

	@media screen and (width >= 1024px) {
		padding-inline: var(--space-1) var(--space-2);
	}
}

.username {
	display: none;
	max-inline-size: 10rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;

	@media screen and (width >= 1024px) {
		display: inline;
	}
}

.dropdown-icon {
	display: none;
	color: var(--text-secondary);
	font-size: var(--text-xs);
	transition: transform var(--motion-fast) var(--ease-standard);

	&.is-open {
		transform: rotate(180deg);
	}

	@media screen and (width >= 1024px) {
		display: inline-flex;
	}
}

.avatar {
	flex-shrink: 0;
	inline-size: 1.75rem;
	block-size: 1.75rem;
	border-radius: var(--radius-full);
	vertical-align: middle;
}
</style>
