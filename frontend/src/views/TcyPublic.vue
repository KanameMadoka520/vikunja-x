<script setup lang="ts">
import {useI18n} from 'vue-i18n'
const {t} = useI18n({useScope: 'global'})
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {publicShowcaseQuery} from '@/client/queries/tcyShowcase'
import ShowcasePage from '@/components/showcase/ShowcasePage.vue'
import {useTitle} from '@/composables/useTitle'

const route = useRoute()
const query = useQuery(computed(() => publicShowcaseQuery(String(route.params.slug))))
useTitle(() => query.data.value?.title ?? t('tcymc.text.public_schedule'))
</script>

<template>
	<ShowcasePage
		v-if="query.data.value"
		:page="query.data.value"
	/>
	<div
		v-else
		class="public-message"
	>
		<h1>{{ query.isPending.value ? t('tcymc.text.loading_schedule') : t('tcymc.text.page_not_published_or_temporarily_unavailable') }}</h1><p v-if="query.isError.value">
			{{ t('tcymc.text.check_the_link_or_try_again_later') }}
		</p>
	</div>
</template>

<style scoped>
.public-message {
	padding: 4rem 1rem;
	text-align: center;
}
</style>
