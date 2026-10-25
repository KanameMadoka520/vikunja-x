<script setup lang="ts">
import {useI18n} from 'vue-i18n'
const {t} = useI18n({useScope: 'global'})
import {computed} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {aiSettingsQuery} from '@/client/queries/tcyAi'
import TcyAISettingsForm from '@/components/ai/TcyAISettingsForm.vue'
import {useTitle} from '@/composables/useTitle'

useTitle(() => t('tcymc.text.ai_and_voice'))
const settings = useQuery(aiSettingsQuery())
const saved = computed(() => settings.data.value)
</script>

<template>
	<div>
		<p v-if="settings.isPending.value">
			{{ t('tcymc.text.loading_model_settings') }}
		</p>
		<TcyAISettingsForm
			v-else-if="saved"
			:key="settings.dataUpdatedAt.value"
			:initial="saved"
		/>
		<p v-else>
			{{ t('tcymc.text.could_not_load_settings_refresh_the_page_to') }}
		</p>
	</div>
</template>
