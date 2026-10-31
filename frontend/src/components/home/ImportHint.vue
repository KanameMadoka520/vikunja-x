<script lang="ts" setup>
import {computed} from 'vue'
import {useConfigStore} from '@/stores/config'
import {useBaseStore} from '@/stores/base'
import {useTasks} from '@/composables/useTasks'
const configStore = useConfigStore()
const baseStore = useBaseStore()
const migratorsEnabled = computed(() => configStore.available_migrators?.length > 0)
const query = useTasks({params: {per_page: 1}}, {enabled: () => migratorsEnabled.value && !baseStore.hasTasks})
const loading = query.isFetching
const show = computed(() => migratorsEnabled.value
	&& !baseStore.hasTasks
	&& query.isSuccess.value
	&& query.tasks.value.length === 0)
</script>

<template>
	<div
		v-if="show && !loading"
		class="import-hint"
	>
		<p class="import-hint__text">
			{{ $t('home.project.importText') }}
		</p>
		<XButton
			:to="{ name: 'migrate.start' }"
			variant="secondary"
			icon="cloud-upload-alt"
			class="import-hint__action"
			:shadow="false"
		>
			{{ $t('home.project.import') }}
		</XButton>
	</div>
</template>

<style lang="scss" scoped>
.import-hint {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-2) var(--space-4);
	padding: var(--space-3) var(--space-4);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	background: var(--surface);
	box-shadow: var(--elevation-1);
}

.content .import-hint__text {
	flex: 1 1 16rem;
	margin: 0;
	color: var(--text-secondary);
	font-size: var(--text-md);
}

.import-hint__action {
	flex: none;
}
</style>
