<script setup lang="ts">
import {useI18n} from 'vue-i18n'
const {t} = useI18n({useScope: 'global'})
import {useQuery} from '@tanstack/vue-query'
import {showcaseSettingsQuery} from '@/client/queries/tcyShowcase'
import ShowcaseEditor from '@/components/showcase/ShowcaseEditor.vue'
import {useTitle} from '@/composables/useTitle'

useTitle(() => t('tcymc.text.public_page'))
const settings = useQuery(showcaseSettingsQuery())
</script>

<template>
	<ShowcaseEditor
		v-if="settings.data.value"
		:key="settings.dataUpdatedAt.value"
		:initial="settings.data.value"
	/>
	<p v-else>
		{{ t('tcymc.text.loading_public_page_settings') }}
	</p>
</template>
