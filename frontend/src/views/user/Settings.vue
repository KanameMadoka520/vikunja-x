<template>
	<SideNavShell
		:navigation-items="navigationItems"
		:extra-links="extraSettingsLinks"
	/>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {mailSettingsAccessQuery} from '@/client/queries/mailSettings'
import {useI18n} from 'vue-i18n'
import {useTitle} from '@/composables/useTitle'
import {useConfigStore} from '@/stores/config'
import {useAuthStore} from '@/stores/auth'

import SideNavShell, {type SideNavItem} from '@/components/misc/SideNavShell.vue'

const {t} = useI18n({useScope: 'global'})
useTitle(() => t('user.settings.title'))

const mailAccess = useQuery(mailSettingsAccessQuery())
const configStore = useConfigStore()
const authStore = useAuthStore()

const migratorsEnabled = computed(() => configStore.migratorsEnabled)
const isLocalUser = computed(() => authStore.info?.is_local_user)

const navigationItems = computed(() => {
	const items: (SideNavItem & {condition?: boolean})[] = [
		{title: t('bark.title'), icon: 'bell', routeName: 'user.settings.push'},
		{title: t('mailServer.title'), icon: 'cog', routeName: 'user.settings.mail-server', condition: mailAccess.data.value?.can_manage_mail === true},
		{
			title: t('tcymc.text.public_page'),
			icon: 'globe',
			routeName: 'user.settings.showcase',
		},
		{
			title: t('tcymc.text.ai_and_voice'),
			icon: 'robot',
			routeName: 'user.settings.ai',
		},
		{
			title: t('user.settings.general.title'),
			icon: 'cog',
			routeName: 'user.settings.general',
		},
		{
			title: t('user.settings.newPasswordTitle'),
			icon: 'lock',
			routeName: 'user.settings.password-update',
			condition: isLocalUser.value,
		},
		{
			title: t('user.settings.updateEmailTitle'),
			icon: 'user-edit',
			routeName: 'user.settings.email-update',
			condition: isLocalUser.value,
		},
		{
			title: t('user.settings.avatar.title'),
			icon: 'image',
			routeName: 'user.settings.avatar',
		},
		{
			title: t('user.settings.totp.title'),
			icon: 'lock',
			routeName: 'user.settings.totp',
			condition: configStore.totp_enabled && isLocalUser.value,
		},
		{
			title: t('user.export.title'),
			icon: 'download',
			routeName: 'user.settings.data-export',
		},
		{
			title: t('migrate.title'),
			icon: 'cloud-upload-alt',
			routeName: 'migrate.start',
			activeRouteNames: ['migrate.service'],
			condition: migratorsEnabled.value,
		},
		{
			title: t('user.settings.caldav.title'),
			icon: 'calendar',
			routeName: 'user.settings.caldav',
			condition: configStore.caldav_enabled,
		},
		{
			title: 'MCP',
			icon: 'code',
			routeName: 'user.settings.mcp',
		},
		{
			title: t('user.settings.feeds.title'),
			icon: 'rss',
			routeName: 'user.settings.feeds',
		},
		{
			title: t('user.settings.apiTokens.title'),
			icon: 'lock',
			routeName: 'user.settings.apiTokens',
		},
		{
			title: t('user.settings.sessions.title'),
			icon: 'history',
			routeName: 'user.settings.sessions',
		},
		{
			title: t('user.settings.webhooks.title'),
			icon: 'link',
			routeName: 'user.settings.webhooks',
			condition: configStore.webhooks_enabled,
		},
		{
			title: t('user.settings.bots.title'),
			icon: 'robot',
			routeName: 'user.settings.bots',
		},
		{
			title: t('user.deletion.title'),
			icon: 'trash-alt',
			routeName: 'user.settings.deletion',
			condition: configStore.user_deletion_enabled,
		},
	]

	return items.filter(({condition}) => condition !== false)
})

const extraSettingsLinks = computed(() => Object.values(authStore.settings.extra_settings_links ?? {}))
</script>
