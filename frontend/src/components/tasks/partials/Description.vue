<template>
	<div
		:class="{'d-print-none': isEmpty}"
	>
		<div class="task-section-header">
			<h2 class="task-section-title">
				<span class="icon is-grey">
					<Icon icon="align-left" />
				</span>
				{{ $t('task.attributes.description') }}
				<CustomTransition name="fade">
					<span
						v-if="saveState === 'saving'"
						class="is-small is-inline-flex"
						aria-hidden="true"
					>
						<span class="loader is-inline-block" />
						{{ $t('misc.saving') }}
					</span>
					<span
						v-else-if="saveState === 'saved'"
						class="is-small has-text-success"
						aria-hidden="true"
					>
						<Icon icon="check" />
						{{ $t('misc.saved') }}
					</span>
				</CustomTransition>
			</h2>
			<div
				v-if="stageCount > 0 || canWrite"
				class="task-section-actions description-view-actions d-print-none"
			>
				<XButton
					v-if="stageCount > 0"
					variant="tertiary"
					class="is-small"
					icon="list-check"
					:aria-pressed="showStages"
					@click="showStages = !showStages"
				>
					{{ showStages ? t('stages.fullDescription') : t('stages.title') }}
				</XButton>
				<XButton
					v-if="canWrite"
					variant="tertiary"
					class="is-small"
					icon="plus"
					:aria-disabled="saving || undefined"
					@click="insertStageTemplate"
				>
					{{ t('stages.insertTemplate') }}
				</XButton>
			</div>
		</div>
		<!-- Outside the h2 so the heading keeps a stable accessible name -->
		<span
			class="is-sr-only"
			role="status"
			aria-live="polite"
		>{{ saveStateAnnouncement }}</span>
		<p
			v-if="saveError"
			role="alert"
			class="description-save-error"
		>
			{{ saveError }}
			<XButton
				v-if="canWrite"
				variant="secondary"
				class="is-small"
				:shadow="false"
				:aria-disabled="saving || undefined"
				@click="save"
			>
				{{ t('stages.retry') }}
			</XButton>
		</p>
		<DescriptionStages
			v-if="showStages && stageCount > 0"
			:model-value="description"
			:can-write="canWrite"
			:saving="saving"
			@update:modelValue="saveStageChange"
		/>
		<Editor
			v-show="!showStages || stageCount === 0"
			v-model="description"
			class="tiptap__task-description"
			:is-edit-enabled="canWrite"
			:upload-callback="uploadCallback"
			:drive-task-id="modelValue.id"
			:placeholder="$t('task.description.placeholder')"
			:show-save="true"
			edit-shortcut="KeyE"
			:enable-discard-shortcut="true"
			:enable-mentions="true"
			:project-id="modelValue.project_id"
			:storage-key="descriptionStorageKey"
			@update:modelValue="saveWithDelay"
			@save="save"
		/>
	</div>
</template>

<script setup lang="ts">
import DescriptionStages from './DescriptionStages.vue'
import {descriptionStages, stageTemplate} from '@/helpers/descriptionStages'
import {removeAttachmentImages} from '@/helpers/attachmentImages'
import {getErrorText} from '@/message'
import {ref, computed, watch, onBeforeUnmount} from 'vue'
import {onBeforeRouteLeave} from 'vue-router'
import {useQueryClient} from '@tanstack/vue-query'
import {useI18n} from 'vue-i18n'

import CustomTransition from '@/components/misc/CustomTransition.vue'
import XButton from '@/components/input/Button.vue'
import Editor from '@/components/input/AsyncEditor'

import { clearEditorDraft } from '@/helpers/editorDraftStorage'
import { isEditorContentEmpty } from '@/helpers/editorContentEmpty'
import {generateAttachmentUrl} from '@/helpers/attachments'
import type {Task as ITask} from '@/client/generated'
import {useUploadAttachmentsMutation} from '@/client/queries/attachments'
import {useUpdateTaskMutation} from '@/client/queries/taskMutations'
import {isTaskDeleted} from '@/client/queries/taskCache'

const props = defineProps<{
	modelValue: ITask,
	canWrite: boolean,
}>()

const emit = defineEmits<{
	'update:modelValue': [value: ITask]
}>()

const description = ref<string>('')
const hasChanges = ref(false)
const showStages = ref(false)
const stageCount = computed(() => descriptionStages(description.value).reduce((n, g) => n + g.items.length, 0))
watch(() => props.modelValue.id, () => { showStages.value = descriptionStages(props.modelValue.description ?? '').reduce((n, g) => n + g.items.length, 0) >= 12 }, {immediate: true})
async function saveStageChange(html: string) {
	if (!props.canWrite || saving.value) return
	description.value = html; hasChanges.value = true
	await save()
}
async function insertStageTemplate() {
	if (!props.canWrite || saving.value) return
	showStages.value = false
	await saveStageChange(description.value + stageTemplate(t))
}

watch(
	() => [props.modelValue.id, props.modelValue.description] as const,
	([id, value], previous) => {
		if (id === previous?.[0] && hasChanges.value) return
		description.value = value ?? ''
		hasChanges.value = false
	},
	{immediate: true},
)

watch(() => ({id: props.modelValue.id, ids: (props.modelValue.attachments ?? []).map(a => a.id!)}), (current, previous) => {
	if (!previous || current.id !== previous.id) return
	const removed = previous.ids.filter(id => !current.ids.includes(id))
	description.value = removeAttachmentImages(description.value, current.id!, removed)
})
const saveError = ref('')
const saved = ref(false)
const saving = ref(false)

const queryClient = useQueryClient()
const updateTask = useUpdateTaskMutation()

const {t} = useI18n({useScope: 'global'})

const changeTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const savedTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const dwellTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

// Saves resolve faster than "Saving…" can be read, and aria-live coalesces it away, so hold it a floor.
const MIN_SAVING_DWELL = 500
const dwelling = ref(false)

watch(saving, isSaving => {
	if (!isSaving) {
		return
	}

	dwelling.value = true
	if (dwellTimeout.value !== null) {
		clearTimeout(dwellTimeout.value)
	}
	dwellTimeout.value = setTimeout(() => {
		dwelling.value = false
	}, MIN_SAVING_DWELL)
})

const saveState = computed(() => {
	if (saving.value || dwelling.value) {
		return 'saving'
	}

	if (saved.value) {
		return 'saved'
	}

	return ''
})

// Runs from when "Saved!" reaches the screen, not from the response the floor may have delayed.
watch(saveState, state => {
	if (savedTimeout.value !== null) {
		clearTimeout(savedTimeout.value)
	}

	if (state !== 'saved') {
		return
	}

	savedTimeout.value = setTimeout(() => {
		saved.value = false
	}, 2000)
})

const saveStateAnnouncement = computed(() => {
	if (saveState.value === 'saving') {
		return t('misc.saving')
	}

	if (saveState.value === 'saved') {
		return t('misc.saved')
	}

	return ''
})

const descriptionStorageKey = computed(() => `task-description-${props.modelValue.id}`)

const isEmpty = computed(() => isEditorContentEmpty(description.value))

async function saveWithDelay() {
	if (description.value === props.modelValue.description) {
		hasChanges.value = false
		if (changeTimeout.value !== null) {
			clearTimeout(changeTimeout.value)
		}
		return
	}

	hasChanges.value = true
	if (changeTimeout.value !== null) {
		clearTimeout(changeTimeout.value)
	}

	changeTimeout.value = setTimeout(async () => {
		await save()
	}, 5000)
}

onBeforeUnmount(async () => {
	await save() // Save before unmounting to handle modal race condition
	if (changeTimeout.value !== null) {
		clearTimeout(changeTimeout.value)
	}
	if (savedTimeout.value !== null) {
		clearTimeout(savedTimeout.value)
	}
	if (dwellTimeout.value !== null) {
		clearTimeout(dwellTimeout.value)
	}
})

onBeforeRouteLeave(async () => { const ok = await save(); return ok && (!hasChanges.value || await save()) })

let pendingSave: Promise<boolean> | undefined
async function save(): Promise<boolean> {
	if (pendingSave) {
		const ok = await pendingSave
		return ok && hasChanges.value ? save() : ok
	}
	if (!hasChanges.value) return true
	const taskId = props.modelValue.id!
	// Deleted elsewhere: the detail shows its notice, and a save could only answer 404.
	if (isTaskDeleted(queryClient, taskId)) {
		hasChanges.value = false
		return true
	}
	const submitted = description.value
	const storageKey = descriptionStorageKey.value
	if (changeTimeout.value !== null) clearTimeout(changeTimeout.value)
	saved.value = false
	saving.value = true
	saveError.value = ''
	pendingSave = (async () => {
		try {
			const updated = await updateTask.mutateAsync({id: taskId, description: submitted})
			if (props.modelValue.id !== taskId) return true
			if (description.value === submitted) {
				description.value = updated.description ?? ''
				hasChanges.value = false
				clearEditorDraft(storageKey)
				saved.value = true
			}
			emit('update:modelValue', updated)
			return true
		} catch (error) {
			if (props.modelValue.id === taskId) {
				if ((error as {status?: number})?.status === 404) { hasChanges.value = false; return true }
				hasChanges.value = true
				saveError.value = getErrorText(error)
			}
			return false
		} finally { saving.value = false }
	})()
	try { return await pendingSave } finally {pendingSave = undefined}
}

// the editor toasts the rejection itself, a mutation toast would duplicate it
const uploadAttachments = useUploadAttachmentsMutation(() => false)

function uploadCallback(files: File[] | FileList): Promise<string[]> {
	const taskId = props.modelValue.id!
	return Promise.all(Array.from(files).map(async file => {
		const result = await uploadAttachments.mutateAsync({
			taskId,
			files: [file],
		})
		const [uploaded] = result.success ?? []
		// forwarded verbatim: the editor's toast translates the error code, which a rewrapped message would lose
		if (uploaded?.id === undefined) throw result.errors?.[0] ?? new Error('Attachment upload returned no file')
		return generateAttachmentUrl(taskId, uploaded.id)
	}))
}
</script>

<style lang="scss" scoped>
.description-save-error {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-2) var(--space-3);
	margin-block-end: var(--space-3);
	padding: var(--space-2) var(--space-3);
	border-inline-start: 3px solid var(--danger);
	border-radius: var(--radius-sm);
	background: var(--tint-danger);
	color: var(--text-primary);
	font-size: var(--text-md);
}

.task-section-title .loader {
	inline-size: .75rem;
	block-size: .75rem;
}

@media print {
	.tiptap__task-description {
		display: block !important;
	}
}
</style>
