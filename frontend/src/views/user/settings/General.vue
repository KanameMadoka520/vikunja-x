<template>
	<div class="settings-page">
		<PageHeader
			:title="$t('user.settings.general.title')"
			:description="$t('user.settings.general.description')"
		/>
		<!-- The form seeds its draft once, so it may only mount with the account already loaded. -->
		<GeneralSettingsForm
			v-if="identity"
			:key="identity.id"
			:identity="identity"
		/>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'

import GeneralSettingsForm from './GeneralSettingsForm.vue'
import PageHeader from '@/components/misc/state/PageHeader.vue'
import {useAuthStore} from '@/stores/auth'

defineOptions({name: 'UserSettingsGeneral'})

const authStore = useAuthStore()
const identity = computed(() => {
	const session = authStore.session
	if (!session || !authStore.currentAccount) return null
	return {
		id: session.id,
		type: session.type,
	}
})
</script>
