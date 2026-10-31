<template>
	<SideNavShell
		:navigation-items="navigationItems"
		:label="$t('admin.title')"
		exact
	/>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTitle} from '@/composables/useTitle'

import SideNavShell, {type SideNavItem} from '@/components/misc/SideNavShell.vue'
import {useConfigStore} from '@/stores/config'
import {PRO_FEATURE} from '@/constants/proFeatures'

const {t} = useI18n({useScope: 'global'})
useTitle(() => t('admin.title'))

const configStore = useConfigStore()

const navigationItems = computed<SideNavItem[]>(() => [
	{
		title: t('navigation.overview'),
		icon: 'tachometer-alt',
		routeName: 'admin.overview',
	},
	{
		title: t('admin.labels.users'),
		icon: 'users',
		routeName: 'admin.users',
	},
	{
		title: t('project.projects'),
		icon: 'layer-group',
		routeName: 'admin.projects',
	},
	...(configStore.isProFeatureEnabled(PRO_FEATURE.USER_INVITES) ? [{
		title: t('admin.inviteLinks.title'),
		icon: 'link' as const,
		routeName: 'admin.inviteLinks',
	}] : []),
])
</script>
