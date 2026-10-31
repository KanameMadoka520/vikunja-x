<template>
	<CreateEdit
		v-model:loading="loadingModel"
		:title="$t('filters.create.title')"
		:primary-label="$t('filters.create.action')"
		:primary-disabled="showLoading || !titleValid"
		@primary="create"
	>
		<form
			class="filter-new"
			@submit.prevent="create()"
		>
			<p class="filter-new__description">
				{{ $t('filters.create.description') }}
			</p>
			<FormField
				id="Title"
				v-model="filter.title"
				v-focus
				:label="$t('filters.attributes.title')"
				:class="{ 'is-danger': !titleValid }"
				:disabled="showLoading"
				:placeholder="$t('filters.attributes.titlePlaceholder')"
				type="text"
				:error="titleValid ? null : $t('filters.create.titleRequired')"
				@focusout="markTitleTouched"
			/>
			<FormField :label="$t('filters.attributes.description')">
				<Editor
					id="description"
					:key="filter.id"
					v-model="filter.description"
					:class="{ 'disabled': showLoading}"
					:disabled="showLoading"
					:placeholder="$t('filters.attributes.descriptionPlaceholder')"
				/>
			</FormField>
			<FormField :label="$t('filters.title')">
				<Filters
					v-model="filter.filters"
					:class="{ 'disabled': showLoading}"
					:disabled="showLoading"
					class="has-no-shadow has-no-border"
					:has-footer="false"
					:change-immediately="true"
				/>
			</FormField>
			<button
				type="submit"
				class="is-hidden"
				tabindex="-1"
			/>
		</form>
	</CreateEdit>
</template>

<script setup lang="ts">
import {computed, nextTick, ref} from 'vue'
import {useRouter} from 'vue-router'

import Editor from '@/components/input/AsyncEditor'
import CreateEdit from '@/components/misc/CreateEdit.vue'
import FormField from '@/components/input/FormField.vue'
import Filters from '@/components/project/partials/Filters.vue'

import {getProjectIdFromSavedFilterId} from '@/client/queries/projects'
import {useIsAlive} from '@/composables/useIsAlive'
import {useSavedFilterDraft} from '@/composables/useSavedFilter'
import {useDelayedLoading} from '@/composables/useDelayedLoading'
import {useCreateSavedFilterMutation} from '@/client/queries/savedFilters'

const router = useRouter()

const alive = useIsAlive()

const {
	filter,
	validate,
	titleValid,
	markTitleTouched,
} = useSavedFilterDraft()
const createMutation = useCreateSavedFilterMutation(() => alive.value)
const isLoading = createMutation.isPending
const showLoading = useDelayedLoading(isLoading)

// CreateEdit latches loading on click; the prop must toggle back on early return.
const isSubmitting = ref(false)
const loadingModel = computed({
	get: () => isLoading.value || isSubmitting.value,
	set(value: boolean) {
		isSubmitting.value = value
	},
})

async function create() {
	// The hidden submit button (Enter) bypasses CreateEdit's own click latch.
	if (isLoading.value || isSubmitting.value) {
		return
	}
	isSubmitting.value = true
	let created
	try {
		const payload = validate()
		if (!payload) {
			await nextTick()
			return
		}
		created = await createMutation.mutateAsync(payload).catch(() => undefined)
	} finally {
		isSubmitting.value = false
	}
	if (!alive.value) {
		return
	}
	if (created) {
		await router.push({
			name: 'project.index',
			params: {projectId: getProjectIdFromSavedFilterId(created.id)},
		})
	}
}
</script>

<style lang="scss" scoped>
.filter-new__description {
	margin-block-end: var(--space-4);
	color: var(--text-secondary);
	font-size: var(--text-md);
}
</style>
