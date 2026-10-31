<script lang="ts" setup>
import {useI18n} from 'vue-i18n'
import Card from '@/components/misc/Card.vue'
import PageHeader from '@/components/misc/state/PageHeader.vue'
import WebhookManager from '@/components/misc/WebhookManager.vue'
import {useTitle} from '@/composables/useTitle'

defineOptions({name: 'UserSettingsWebhooks'})
const {t} = useI18n({useScope: 'global'})
useTitle(() => `${t('user.settings.webhooks.title')} - ${t('user.settings.title')}`)
</script>

<template>
	<div class="settings-page">
		<PageHeader
			:title="$t('user.settings.webhooks.title')"
			:description="$t('user.settings.webhooks.description')"
		/>
		<Card>
			<WebhookManager :scope="{kind: 'user'}" />
		</Card>
	</div>
</template>
