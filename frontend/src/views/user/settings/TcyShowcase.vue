<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {useQuery} from '@tanstack/vue-query'
import {showcaseSettingsQuery} from '@/client/queries/tcyShowcase'
import ShowcaseEditor from '@/components/showcase/ShowcaseEditor.vue'
import {useTitle} from '@/composables/useTitle'

const {t} = useI18n({useScope: 'global'})
useTitle(() => `${t('tcymc.text.public_page')} - ${t('user.settings.title')}`)
const settings = useQuery(showcaseSettingsQuery())
</script>

<template>
	<!-- Mounted once: the editor seeds its draft from the first response, so refetches after
	save/publish only refresh the publication status instead of remounting over the draft. -->
	<ShowcaseEditor
		v-if="settings.data.value"
		:initial="settings.data.value"
	/>
	<p
		v-else
		class="settings-loading"
		role="status"
	>
		{{ t('tcymc.text.loading_public_page_settings') }}
	</p>
</template>

<style lang="scss" scoped>
.settings-loading {
	color: var(--text-secondary);
}
</style>
