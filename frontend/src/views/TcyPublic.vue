<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {publicShowcaseQuery} from '@/client/queries/tcyShowcase'
import ShowcasePage from '@/components/showcase/ShowcasePage.vue'
import {useTitle} from '@/composables/useTitle'

const route = useRoute()
const query = useQuery(computed(() => publicShowcaseQuery(String(route.params.slug))))
useTitle(() => query.data.value?.title ?? '公开日程')
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
		<h1>{{ query.isPending.value ? '正在加载日程…' : '页面未发布或暂时不可用' }}</h1><p v-if="query.isError.value">
			请确认链接，或稍后再试。
		</p>
	</div>
</template>

<style scoped>
.public-message {
	padding: 4rem 1rem;
	text-align: center;
}
</style>
