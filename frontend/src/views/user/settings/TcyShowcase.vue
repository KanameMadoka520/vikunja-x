<script setup lang="ts">
import {useQuery} from '@tanstack/vue-query'
import {showcaseSettingsQuery} from '@/client/queries/tcyShowcase'
import ShowcaseEditor from '@/components/showcase/ShowcaseEditor.vue'
import {useTitle} from '@/composables/useTitle'

useTitle('公开主页')
const settings = useQuery(showcaseSettingsQuery())
</script>

<template>
	<ShowcaseEditor
		v-if="settings.data.value"
		:key="settings.dataUpdatedAt.value"
		:initial="settings.data.value"
	/>
	<p v-else>
		正在加载公开主页设置…
	</p>
</template>
