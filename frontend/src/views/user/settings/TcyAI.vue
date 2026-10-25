<script setup lang="ts">
import {computed} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {aiSettingsQuery} from '@/client/queries/tcyAi'
import TcyAISettingsForm from '@/components/ai/TcyAISettingsForm.vue'
import {useTitle} from '@/composables/useTitle'

useTitle('AI 与语音')
const settings = useQuery(aiSettingsQuery())
const saved = computed(() => settings.data.value)
</script>

<template>
	<div>
		<p v-if="settings.isPending.value">
			正在加载模型配置…
		</p>
		<TcyAISettingsForm
			v-else-if="saved"
			:key="settings.dataUpdatedAt.value"
			:initial="saved"
		/>
		<p v-else>
			配置加载失败，请刷新页面重试。
		</p>
	</div>
</template>
