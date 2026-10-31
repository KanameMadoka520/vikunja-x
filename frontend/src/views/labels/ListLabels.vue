<template>
	<div class="labels-page">
		<PageHeader
			:title="$t('label.manage')"
			:description="labels.length > 0 ? $t('label.listDescription') : ''"
		>
			<template #actions>
				<XButton
					:to="{name:'labels.create'}"
					icon="plus"
				>
					{{ $t('label.create.header') }}
				</XButton>
			</template>
		</PageHeader>

		<LoadError
			v-if="labelsQuery.isError.value && labels.length === 0"
			:retry="() => labelsQuery.refetch()"
		/>

		<div
			v-else-if="labelsQuery.isPending.value"
			class="labels-skeleton"
			role="status"
		>
			<span class="is-sr-only">{{ $t('misc.loading') }}</span>
			<div
				v-for="row in 4"
				:key="row"
				class="labels-skeleton__row"
				aria-hidden="true"
			>
				<span class="labels-skeleton__dot" />
				<span class="labels-skeleton__line" />
			</div>
		</div>

		<EmptyState
			v-else-if="labels.length === 0"
			icon="tags"
			:title="$t('label.newCTA')"
		>
			<XButton
				:to="{name:'labels.create'}"
				variant="secondary"
				icon="plus"
				:shadow="false"
			>
				{{ $t('label.create.title') }}
			</XButton>
		</EmptyState>

		<div
			v-else
			class="labels-layout"
			:class="{'is-editing': isLabelEdit}"
		>
			<ul
				class="label-rows"
				:aria-label="$t('label.title')"
			>
				<li
					v-for="label in labels"
					:key="label.id"
					class="label-row"
					:class="{'is-selected': isLabelEdit && labelEditLabel.id === label.id}"
				>
					<span
						class="label-row__dot"
						:style="{backgroundColor: getLabelColor(label) || undefined}"
						aria-hidden="true"
					/>
					<span class="label-row__text">
						<RouterLink
							:to="{name: 'home', query: {labels: label.id}}"
							class="label-row__title"
						>
							{{ label.title }}
						</RouterLink>
						<span
							v-if="descriptionPreview(label)"
							class="label-row__description"
						>{{ descriptionPreview(label) }}</span>
					</span>
					<BaseButton
						v-if="userInfo?.id === label.created_by?.id"
						v-tooltip="$t('label.edit.header')"
						class="label-row__edit"
						:aria-label="$t('label.editNamed', {label: label.title})"
						:aria-pressed="isLabelEdit && labelEditLabel.id === label.id"
						@click="editLabel(label)"
					>
						<Icon icon="pen" />
					</BaseButton>
					<span
						v-else
						class="label-row__owner"
					>{{ $t('label.notEditable') }}</span>
				</li>
			</ul>
			<div
				v-if="isLabelEdit"
				ref="editPanel"
				class="label-editor"
			>
				<Card
					:title="$t('label.edit.header')"
					:show-close="true"
					@close="() => isLabelEdit = false"
				>
					<form @submit.prevent="editLabelSubmit()">
						<FormField
							v-model="labelEditLabel.title"
							:label="$t('label.attributes.title')"
							:placeholder="$t('label.attributes.titlePlaceholder')"
							type="text"
						/>
						<FormField :label="$t('label.attributes.description')">
							<Editor
								v-if="editorActive"
								v-model="labelEditLabel.description"
								:placeholder="$t('label.attributes.description')"
							/>
						</FormField>
						<FormField :label="$t('label.attributes.color')">
							<ColorPicker v-model="labelEditLabel.hex_color" />
						</FormField>
						<div class="label-editor__actions">
							<XButton
								:loading="updateLabelMutation.isPending.value"
								type="submit"
							>
								{{ $t('misc.save') }}
							</XButton>
							<XButton
								variant="tertiary"
								icon="trash-alt"
								class="label-editor__delete"
								:shadow="false"
								@click="showDeleteDialoge(labelEditLabel)"
							>
								{{ $t('task.label.delete.header') }}
							</XButton>
						</div>
					</form>
				</Card>
			</div>
		</div>

		<Modal
			:enabled="showDeleteModal"
			danger
			@close="showDeleteModal = false"
			@submit="deleteLabel(labelToDelete)"
		>
			<template #header>
				<span>{{ $t('task.label.delete.header') }}</span>
			</template>

			<template #text>
				<p>
					{{ $t('task.label.delete.text1') }}<br>
					{{ $t('task.label.delete.text2') }}
				</p>
			</template>
		</Modal>
	</div>
</template>

<script setup lang="ts">
import {computed, nextTick, ref, useTemplateRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {useQuery} from '@tanstack/vue-query'

import BaseButton from '@/components/base/BaseButton.vue'
import Editor from '@/components/input/AsyncEditor'
import ColorPicker from '@/components/input/ColorPicker.vue'
import FormField from '@/components/input/FormField.vue'
import PageHeader from '@/components/misc/state/PageHeader.vue'
import EmptyState from '@/components/misc/state/EmptyState.vue'
import LoadError from '@/components/misc/state/LoadError.vue'

import {useAuthStore} from '@/stores/auth'

import { useTitle } from '@/composables/useTitle'
import {getLabelColor} from '@/composables/useLabelStyles'
import {
	labelsQuery as labelsQueryOptions,
	type UpdateLabelInput,
	useDeleteLabelMutation,
	useUpdateLabelMutation,
} from '@/client/queries/labels'
import type {Label} from '@/client/generated'

const {t} = useI18n({useScope: 'global'})

const labelEditLabel = ref<Required<UpdateLabelInput>>({id: 0, title: '', description: '', hex_color: ''})
const isLabelEdit = ref(false)
const editorActive = ref(false)
const showDeleteModal = ref(false)
const labelToDelete = ref<Label | undefined>(undefined)

useTitle(() => t('label.title'))

const authStore = useAuthStore()
const userInfo = computed(() => authStore.info)

const labelsQuery = useQuery(labelsQueryOptions())
const labels = computed(() => labelsQuery.data.value ?? [])
const updateLabelMutation = useUpdateLabelMutation()
const deleteLabelMutation = useDeleteLabelMutation()

const editPanel = useTemplateRef<HTMLElement>('editPanel')

// Descriptions are rich text; the row only needs a one-line hint.
const descriptions = computed(() => new Map(labels.value.map(label => [
	label.id,
	label.description
		? (new DOMParser().parseFromString(label.description, 'text/html').body.textContent ?? '').trim()
		: '',
])))

function descriptionPreview(label: Label): string {
	return descriptions.value.get(label.id) ?? ''
}

function deleteLabel(label?: Label) {
	if (!label) {
		return
	}

	showDeleteModal.value = false
	isLabelEdit.value = false
	return deleteLabelMutation.mutateAsync(label)
}

function editLabelSubmit() {
	return updateLabelMutation.mutateAsync(labelEditLabel.value)
}

function editLabel(label: Label) {
	if (typeof label.id === 'undefined' || label.created_by?.id !== userInfo.value?.id) {
		return
	}
	labelEditLabel.value = {
		id: label.id,
		title: label.title ?? '',
		description: label.description ?? '',
		hex_color: label.hex_color ?? '',
	}
	isLabelEdit.value = true

	// This makes the editor trigger its mounted function again which makes it forget every input
	// it currently has in its textarea. This is a counter-hack to a hack inside of vue-easymde
	// which made it impossible to detect change from the outside. Therefore the component would
	// not update if new content from the outside was made available.
	// See https://github.com/NikulinIlya/vue-easymde/issues/3
	editorActive.value = false
	nextTick(() => {
		editorActive.value = true
		// On phones the editor sits below the list; bring it and the keyboard focus to the user.
		editPanel.value?.querySelector<HTMLInputElement>('input')?.focus()
	})
}

function showDeleteDialoge(label: Label) {
	labelToDelete.value = label
	showDeleteModal.value = true
}
</script>

<style lang="scss" scoped>
.labels-page {
	max-inline-size: var(--page-max-width);
	margin-inline: auto;
}

.labels-layout {
	display: grid;
	// An auto track grows to the unwrapped description; minmax(0, …) lets the row ellipsis it.
	grid-template-columns: minmax(0, 1fr);
	gap: var(--space-4);
	align-items: start;

	@media screen and (min-width: $desktop) {
		&.is-editing {
			grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
		}
	}
}

.label-rows {
	margin: 0;
	padding: var(--space-1);
	list-style: none;
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	background: var(--surface);
	box-shadow: var(--elevation-1);
}

.label-row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	min-block-size: 2.5rem;
	padding-block: var(--space-1);
	padding-inline: var(--space-3) var(--space-1);
	border-radius: $radius;

	&:hover,
	&:has(:focus-visible) {
		background: var(--surface-hover);
	}

	&.is-selected {
		background: var(--surface-selected);
	}

	& + & {
		margin-block-start: 1px;
	}

	@media (pointer: coarse) {
		min-block-size: var(--target-min);
	}
}

.label-row__dot {
	flex: none;
	inline-size: .625rem;
	block-size: .625rem;
	border-radius: var(--radius-full);
	background-color: var(--text-tertiary);
	box-shadow: 0 0 0 1px var(--border-default);
}

.label-row__text {
	display: flex;
	flex: 1;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0 var(--space-3);
	min-inline-size: 0;
}

.label-row__title {
	color: var(--text-primary);
	font-weight: var(--weight-medium);
	overflow-wrap: anywhere;

	&:hover {
		color: var(--accent-text);
		text-decoration: underline;
		text-underline-offset: .2em;
	}
}

.label-row__description {
	flex: 1 1 12rem;
	min-inline-size: 0;
	overflow: hidden;
	color: var(--text-tertiary);
	font-size: var(--text-sm);
	text-overflow: ellipsis;
	white-space: nowrap;
}

.label-row__edit {
	display: inline-flex;
	flex: none;
	align-items: center;
	justify-content: center;
	inline-size: var(--control-height-sm);
	block-size: var(--control-height-sm);
	border-radius: $radius;
	color: var(--text-secondary);

	&:hover,
	&[aria-pressed="true"] {
		background: var(--surface-active);
		color: var(--text-primary);
	}

	@media (pointer: coarse) {
		inline-size: var(--target-min);
		block-size: var(--target-min);
	}
}

.label-row__owner {
	flex: none;
	padding-inline-end: var(--space-2);
	color: var(--text-tertiary);
	font-size: var(--text-xs);
}

.label-editor {
	min-inline-size: 0;

	@media screen and (min-width: $desktop) {
		position: sticky;
		inset-block-start: calc(var(--header-height) + var(--space-4));
	}

	:deep(.card) {
		margin-block-end: 0;
	}
}

.label-editor__actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-2);
	margin-block-start: var(--space-4);
}

// Out-ranks the tertiary button's inherited colour.
.label-editor__actions .button.label-editor__delete {
	color: var(--danger-text);
}

.labels-skeleton {
	display: grid;
	gap: var(--space-1);
	padding: var(--space-2) var(--space-3);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	background: var(--surface);
}

.labels-skeleton__row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	block-size: 2.5rem;

	&:nth-child(2n) .labels-skeleton__line {
		inline-size: 30%;
	}
}

.labels-skeleton__dot,
.labels-skeleton__line {
	background: var(--surface-active);
}

.labels-skeleton__dot {
	inline-size: .625rem;
	block-size: .625rem;
	border-radius: var(--radius-full);
}

.labels-skeleton__line {
	inline-size: 45%;
	block-size: .75rem;
	border-radius: var(--radius-xs);
}
</style>
