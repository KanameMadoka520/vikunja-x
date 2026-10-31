<template>
	<Modal
		:overflow="true"
		:loading="isSaving"
		:aria-label="dialogTitle"
		@close="close"
	>
		<Card
			:title="dialogTitle"
			:shadow="false"
			:padding="false"
			:show-close="true"
			class="project-announcement-editor has-text-start"
			@close="close"
		>
			<div class="project-announcement-editor__body">
				<Message
					v-if="conflict"
					variant="warning"
					class="project-announcement-editor__conflict"
				>
					<!-- Only the headline is announced; the latest version can be long. -->
					<p
						class="project-announcement-editor__conflict-title"
						role="alert"
					>
						{{ $t('project.announcement.conflictTitle') }}
					</p>
					<p>{{ $t('project.announcement.conflictText') }}</p>
					<div
						class="project-announcement-editor__latest"
						role="region"
						tabindex="0"
						:aria-label="$t('project.announcement.latestLabel')"
					>
						<template v-if="conflictEmpty">
							<p class="project-announcement-editor__latest-empty">
								{{ $t('project.announcement.conflictEmpty') }}
							</p>
						</template>
						<template v-else>
							<p
								v-if="conflict.title.trim()"
								class="project-announcement-editor__latest-title"
							>
								{{ conflict.title }}
							</p>
							<!-- Only sanitizeAnnouncement() output reaches v-html. -->
							<!-- eslint-disable vue/no-v-html -->
							<div
								v-if="conflictHtml"
								data-user-content
								v-html="conflictHtml"
							/>
							<!-- eslint-enable vue/no-v-html -->
						</template>
					</div>
					<div class="project-announcement-editor__conflict-actions">
						<XButton
							variant="secondary"
							:shadow="false"
							@click="useLatest"
						>
							{{ $t('project.announcement.conflictUseLatest') }}
						</XButton>
						<XButton
							variant="tertiary"
							:shadow="false"
							@click="keepDraft"
						>
							{{ $t('project.announcement.conflictKeepDraft') }}
						</XButton>
					</div>
					<p class="project-announcement-editor__hint">
						{{ $t('project.announcement.conflictKeepHint') }}
					</p>
				</Message>

				<Message
					v-if="blockedError"
					variant="danger"
				>
					{{ $t('project.announcement.saveBlocked') }} {{ blockedError }}
				</Message>

				<FormField
					v-model="title"
					v-focus
					:label="$t('project.announcement.titleLabel')"
					:placeholder="$t('project.announcement.titlePlaceholder')"
					:maxlength="TITLE_MAX_LENGTH"
					type="text"
				/>
				<FormField :label="$t('project.announcement.contentLabel')">
					<Editor
						v-model="content"
						:allow-images="false"
						:allow-task-lists="false"
						class="project-announcement-editor__content"
						:placeholder="$t('project.announcement.contentPlaceholder')"
					/>
				</FormField>
				<p class="project-announcement-editor__hint">
					{{ $t('project.announcement.hint') }}
				</p>
			</div>

			<template #footer>
				<XButton
					v-if="!baseEmpty"
					variant="tertiary"
					danger
					icon="trash-alt"
					class="project-announcement-editor__remove"
					:shadow="false"
					:disabled="isSaving"
					@click="requestClear"
				>
					{{ $t('project.announcement.remove') }}
				</XButton>
				<XButton
					variant="secondary"
					:shadow="false"
					:disabled="isSaving"
					@click="close"
				>
					{{ $t('misc.cancel') }}
				</XButton>
				<!-- While saving, loading soft-disables it: a native disabled would drop the focus. -->
				<XButton
					variant="primary"
					:shadow="false"
					:loading="isSaving && !confirmingClear"
					:disabled="!isSaving && !canSave"
					@click="save"
				>
					{{ $t('misc.save') }}
				</XButton>
			</template>
		</Card>
	</Modal>

	<Modal
		:enabled="confirmingClear"
		:loading="isSaving"
		danger
		@close="confirmingClear = false"
		@submit="submit('', '')"
	>
		<template #header>
			<span>{{ $t('project.announcement.removeTitle') }}</span>
		</template>
		<template #text>
			<p>{{ $t('project.announcement.removeText') }}</p>
		</template>
	</Modal>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'

import Editor from '@/components/input/AsyncEditor'
import FormField from '@/components/input/FormField.vue'
import XButton from '@/components/input/Button.vue'
import Card from '@/components/misc/Card.vue'
import Message from '@/components/misc/Message.vue'
import Modal from '@/components/misc/Modal.vue'

import {ApiError} from '@/client/problem'
import {
	useUpdateProjectAnnouncementMutation,
	type ProjectAnnouncementResponse,
} from '@/client/queries/projectAnnouncements'
import {isRequestContextAbort} from '@/client/requestContext'
import {useProjectAnnouncement} from '@/composables/useProjectAnnouncement'
import {isAnnouncementContentEmpty, sanitizeAnnouncement} from '@/helpers/sanitizeAnnouncement'
import {error, getErrorText} from '@/message'

import {isAnnouncementEmpty} from './announcementState'

const props = defineProps<{
	projectId: number
	// The version the user chose to edit; the draft is seeded from it once and never overwritten by refetches.
	initial: ProjectAnnouncementResponse
}>()

const emit = defineEmits<{
	close: []
}>()

// The server rejects longer titles (models.ProjectAnnouncement, 160 runes).
const TITLE_MAX_LENGTH = 160

const {t} = useI18n({useScope: 'global'})

const {refetch} = useProjectAnnouncement(() => props.projectId)
const update = useUpdateProjectAnnouncementMutation()
const isSaving = computed(() => update.isPending.value)

// A keyed editor takes a snapshot; remote updates must never replace an unsaved draft.
/* eslint-disable vue/no-setup-props-reactivity-loss */
const title = ref(props.initial.title)
const content = ref(props.initial.content)
// The server version the draft builds on: its revision goes with the save, and it decides what "changed" means.
const base = ref<Pick<ProjectAnnouncementResponse, 'title' | 'content' | 'revision'>>({
	title: props.initial.title,
	content: props.initial.content,
	revision: props.initial.revision,
})

/* eslint-enable vue/no-setup-props-reactivity-loss */
const conflict = ref<ProjectAnnouncementResponse | null>(null)
const blockedError = ref('')
const confirmingClear = ref(false)

const dialogTitle = computed(() => isAnnouncementEmpty(props.initial.title, props.initial.content)
	? t('project.announcement.add')
	: t('project.announcement.editLabel'))

// The editor answers an emptied document with markup such as `<p></p>`; that is no content.
function contentToSend(value: string): string {
	return isAnnouncementContentEmpty(value) ? '' : value
}

const draftEmpty = computed(() => isAnnouncementEmpty(title.value, content.value))
const baseEmpty = computed(() => isAnnouncementEmpty(base.value.title, base.value.content))
const changed = computed(() => title.value.trim() !== base.value.title.trim() ||
	contentToSend(content.value) !== contentToSend(base.value.content))
// An open conflict has to be resolved first: saving on the old revision would only fail again.
const canSave = computed(() => !isSaving.value && !conflict.value && changed.value && !(draftEmpty.value && baseEmpty.value))

const conflictEmpty = computed(() => conflict.value !== null && isAnnouncementEmpty(conflict.value.title, conflict.value.content))
const conflictHtml = computed(() => conflict.value ? sanitizeAnnouncement(conflict.value.content) : '')

function close() {
	if (isSaving.value) return
	emit('close')
}

function save() {
	if (!canSave.value) return
	// Saving nothing removes the announcement for everyone, so it is confirmed like the remove button.
	if (draftEmpty.value) {
		confirmingClear.value = true
		return
	}
	submit(title.value.trim(), contentToSend(content.value))
}

function requestClear() {
	if (!isSaving.value) confirmingClear.value = true
}

async function submit(nextTitle: string, nextContent: string) {
	if (isSaving.value) return
	blockedError.value = ''
	try {
		await update.mutateAsync({
			projectId: props.projectId,
			title: nextTitle,
			content: nextContent,
			revision: base.value.revision,
		})
	} catch (cause) {
		confirmingClear.value = false
		if (isRequestContextAbort(cause)) return
		if (cause instanceof ApiError && cause.status === 409) {
			await showLatest()
			return
		}
		// Archived meanwhile (412) or write access lost (403): saving cannot work, but the draft stays copyable.
		if (cause instanceof ApiError && (cause.status === 403 || cause.status === 412)) {
			blockedError.value = getErrorText(cause)
			return
		}
		error(cause)
		return
	}
	emit('close')
}

async function showLatest() {
	const result = await refetch()
	if (result.isError || !result.data) {
		// The draft and its old base stay; saving again retries the whole round.
		if (!isRequestContextAbort(result.error)) error(result.error)
		return
	}
	conflict.value = result.data
}

function useLatest() {
	if (!conflict.value) return
	title.value = conflict.value.title
	content.value = conflict.value.content
	base.value = {...conflict.value}
	conflict.value = null
}

// The next save knowingly replaces the version the user has just seen.
function keepDraft() {
	if (!conflict.value) return
	base.value = {...conflict.value}
	conflict.value = null
}
</script>

<style lang="scss" scoped>
.project-announcement-editor__body {
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
	padding: var(--space-4);

	:deep(.field) {
		margin-block-end: 0;
	}
}

.project-announcement-editor__content {
	min-inline-size: 0;
}

.project-announcement-editor__hint {
	margin: 0;
	color: var(--text-secondary);
	font-size: var(--text-sm);
}

.project-announcement-editor__conflict {
	:deep(.message) {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
}

.project-announcement-editor__conflict-title {
	font-weight: var(--weight-semibold);
}

// The latest version, read-only and bounded so the draft below stays within reach.
.project-announcement-editor__latest {
	max-block-size: 12rem;
	overflow: auto;
	padding: var(--space-2) var(--space-3);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-sm);
	background: var(--surface);
	font-size: var(--text-md);
	overflow-wrap: anywhere;

	&:focus-visible {
		@include focus-ring;
	}

	:deep(:where(p, ul, ol, pre, blockquote, table)) {
		margin-block: 0 var(--space-2);
	}

	:deep(ul) {
		padding-inline-start: 1.5em;
		list-style: disc;
	}

	:deep(ol) {
		padding-inline-start: 1.5em;
		list-style: decimal;
	}

	:deep(a) {
		color: var(--accent-text);
		text-decoration: underline;
	}

	:deep(table) {
		display: block;
		max-inline-size: 100%;
		overflow-x: auto;
	}
}

.project-announcement-editor__latest-title {
	margin-block-end: var(--space-1);
	font-weight: var(--weight-semibold);
}

.project-announcement-editor__latest-empty {
	color: var(--text-secondary);
}

.project-announcement-editor__conflict-actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
}

// Remove sits apart from Cancel and Save, like CreateEdit's tertiary action.
.project-announcement-editor__remove {
	margin-inline-end: auto;
}

@media (pointer: coarse) {
	.project-announcement-editor__conflict-actions .button,
	.card-footer .button {
		min-block-size: var(--target-min);
	}
}

@media screen and (max-width: $tablet) {
	.project-announcement-editor__body {
		padding: var(--space-3);
	}
}
</style>
