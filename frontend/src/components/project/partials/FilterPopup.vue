<template>
	<XButton
		variant="secondary"
		icon="filter"
		class="filter-popup-trigger"
		:class="{'has-filters': hasFilters}"
		aria-haspopup="dialog"
		@click="() => modalOpen = true"
	>
		{{ $t('filters.title') }}
		<span
			v-if="hasFilters"
			class="filter-active-indicator"
		>
			<span
				class="filter-active-dot"
				aria-hidden="true"
			/>
			<span class="is-sr-only">{{ $t('filters.applied') }}</span>
		</span>
	</XButton>
	<Modal
		:enabled="modalOpen"
		:overflow="true"
		variant="hint-modal"
		:aria-label="$t('filters.title')"
		@close="() => modalOpen = false"
	>
		<Filters
			ref="filtersRef"
			v-model="value"
			:has-title="true"
			class="filter-popup"
			:change-immediately="false"
			:filter-from-view="filterFromView"
			show-close
			@close="modalOpen = false"
			@showResults="showResults"
		/>
	</Modal>
</template>

<script setup lang="ts">
import {computed, ref, watch, nextTick} from 'vue'

import Filters from '@/components/project/partials/Filters.vue'

import type {EditableTaskCollection} from '@/types/EditableTaskCollection'
import {type TaskFilterParams} from '@/client/queries/tasks'
import {useProjects} from '@/composables/useProjects'

const props = defineProps<{
	modelValue: TaskFilterParams,
	projectId?: number,
	viewId?: number,
}>()

const emit = defineEmits<{
	'update:modelValue': [value: TaskFilterParams]
}>()

const projectList = useProjects()

const value = ref<EditableTaskCollection>({
	sort_by: [],
	order_by: [],
	filter: '',
	filter_include_nulls: false,
	s: '',
})
const filtersRef = ref()

watch(
	() => props.modelValue,
	(modelValue: TaskFilterParams) => {
		value.value = {
			sort_by: modelValue.sort_by ?? [],
			order_by: modelValue.order_by ?? [],
			filter: modelValue.filter ?? '',
			filter_include_nulls: modelValue.filter_include_nulls ?? false,
			s: modelValue.q ?? '',
		}
	},
	{
		immediate: true,
		deep: true,
	},
)

const hasFilters = computed(() => {
	return value.value.filter !== '' ||
		value.value.s !== ''
})

const modalOpen = ref(false)

// Auto-focus filter input when modal opens
watch(modalOpen, (isOpen) => {
	if (isOpen) {
		nextTick(() => {
			filtersRef.value?.focusFilterInput()
		})
	}
})

function showResults() {
	const {s, ...rest} = value.value
	emit('update:modelValue', {...props.modelValue, ...rest, q: s})
	modalOpen.value = false
}

const filterFromView = computed(() => {
	if (!props.projectId || !props.viewId) {
		return
	}
	
	const project = projectList.projects[props.projectId]
	if (!project) {
		return
	}
	const view = project.views.find(v => v.id === props.viewId)
	return view?.filter?.filter
})
</script>

<style scoped lang="scss">
.filter-popup {
	margin: 0;
}

// The accent border plus the dot (a shape, not only a colour) mark a view whose results are filtered.
.button.filter-popup-trigger.has-filters {
	border-color: var(--accent-text);
	color: var(--accent-text);
}

.filter-active-indicator {
	display: inline-flex;
	align-items: center;
	margin-inline-start: var(--space-1);
}

.filter-active-dot {
	inline-size: .4375rem;
	block-size: .4375rem;
	border-radius: var(--radius-full);
	background: currentColor;
}
</style>
