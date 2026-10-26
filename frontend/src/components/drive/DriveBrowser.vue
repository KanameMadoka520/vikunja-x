<template>
	<section
		class="drive-browser"
		:aria-label="t('drive.title')"
	>
		<header class="drive-heading">
			<div><h2>{{ picker ? t('drive.choose') : t('drive.title') }}</h2><p>{{ t('drive.subtitle') }}</p></div>
			<XButton
				icon="cloud-upload-alt"
				:loading="upload.isPending.value"
				@click="input?.click()"
			>
				{{ t('drive.upload') }}
			</XButton>
			<input
				ref="input"
				type="file"
				multiple
				hidden
				:accept="images ? 'image/*' : undefined"
				@change="uploadFiles"
			>
		</header>
		<div class="drive-toolbar">
			<input
				v-model="search"
				class="input"
				type="search"
				:placeholder="t('drive.search')"
				:aria-label="t('drive.search')"
			>
			<select
				v-model="category"
				class="input"
				:aria-label="t('drive.category')"
			>
				<option value="">
					{{ t('drive.allCategories') }}
				</option><option
					v-for="c in query.data.value?.categories || []"
					:key="c"
				>
					{{ c }}
				</option>
			</select>
			<label><input
				v-model="pinned"
				type="checkbox"
			> {{ t('drive.pinnedOnly') }}</label>
			<XButton
				v-if="!picker"
				:variant="trash ? 'primary' : 'secondary'"
				icon="trash-alt"
				@click="trash = !trash"
			>
				{{ trash ? t('drive.backToFiles') : t('drive.trash') }}
			</XButton>
		</div>
		<p
			v-if="trash"
			class="drive-note"
		>
			{{ t('drive.trashNote') }}
		</p>
		<p class="drive-summary">
			{{ t('drive.stats', {count: query.data.value?.total ?? 0, size: formatSize(query.data.value?.bytes ?? 0)}) }}
		</p>
		<p
			v-if="query.isPending.value"
			role="status"
		>
			{{ t('misc.loading') }}
		</p>
		<div
			v-else-if="query.isError.value"
			role="alert"
		>
			{{ t('drive.loadError') }} <XButton @click="query.refetch()">
				{{ t('drive.retry') }}
			</XButton>
		</div>
		<p
			v-else-if="!query.data.value?.files?.length"
			class="drive-empty"
		>
			{{ t('drive.empty') }}
		</p>
		<div class="drive-grid">
			<article
				v-for="file in query.data.value?.files || []"
				:key="file.file_id"
				class="drive-card"
			>
				<button
					type="button"
					class="drive-preview"
					:aria-label="`${picker ? t('drive.choose') : t('drive.details')}: ${file.file?.name}`"
					:disabled="busy"
					@click="picker ? emit('select', file) : inspect(file)"
				>
					<DriveThumbnail :file="file" />
				</button>
				<div class="drive-card-body">
					<strong :title="file.file?.name">{{ file.pinned ? '★ ' : '' }}{{ file.file?.name }}</strong>
					<small>{{ formatSize(file.file?.size ?? 0) }}<span v-if="file.category"> · {{ file.category }}</span></small>
					<div class="drive-card-actions">
						<XButton
							v-if="picker"
							variant="secondary"
							:disabled="busy"
							@click="emit('select', file)"
						>
							{{ t('drive.choose') }}
						</XButton>
						<XButton
							v-else
							variant="tertiary"
							@click="inspect(file)"
						>
							{{ t('drive.details') }}
						</XButton>
						<XButton
							v-if="!picker"
							variant="tertiary"
							:loading="change.isPending.value"
							@click="trash && !file.purging ? restore(file) : inspect(file, file.purging ? 'purge' : 'trash')"
						>
							{{ file.purging ? t('drive.retryPurge') : trash ? t('drive.restore') : t('drive.moveToTrash') }}
						</XButton>
					</div>
				</div>
			</article>
		</div>
		<div
			v-if="(query.data.value?.total ?? 0) > 60"
			class="drive-pagination"
		>
			<XButton
				:disabled="page <= 1"
				@click="page--"
			>
				{{ t('drive.previous') }}
			</XButton><span>{{ page }}</span><XButton
				:disabled="page * 60 >= (query.data.value?.total ?? 0)"
				@click="page++"
			>
				{{ t('drive.next') }}
			</XButton>
		</div>
		<Modal
			:enabled="selected !== null"
			:wide="true"
			:aria-label="t('drive.details')"
			@close="closeDetails"
		>
			<div
				v-if="selected"
				class="drive-details"
			>
				<h2>{{ t('drive.details') }}</h2>
				<label>{{ t('drive.name') }}<input
					v-model="name"
					class="input"
					maxlength="255"
					:disabled="trash"
				></label>
				<label>{{ t('drive.category') }}<input
					v-model="editCategory"
					class="input"
					maxlength="120"
					:disabled="trash"
					:placeholder="t('drive.categoryHint')"
					list="drive-categories"
				><datalist id="drive-categories"><option
					v-for="c in query.data.value?.categories || []"
					:key="c"
					:value="c"
				/></datalist></label>
				<label><input
					v-model="editPinned"
					type="checkbox"
					:disabled="trash"
				> {{ t('drive.pin') }}</label>
				<h3>{{ t('drive.usedIn') }}</h3>
				<p
					v-if="usages.isPending.value"
					role="status"
				>
					{{ t('misc.loading') }}
				</p>
				<p
					v-else-if="usages.isError.value"
					role="alert"
				>
					{{ t('drive.loadError') }} <XButton @click="usages.refetch()">
						{{ t('drive.retry') }}
					</XButton>
				</p>
				<ul
					v-else-if="usages.data.value?.length"
					class="drive-usages"
				>
					<li
						v-for="(usage, index) in usages.data.value"
						:key="index"
					>
						<span v-if="usage.restricted">{{ t('drive.restricted') }}</span><RouterLink
							v-else
							:to="usage.url || '/drive'"
							@click="closeDetails"
						>
							{{ t(`drive.kinds.${usage.kind}`) }} · {{ usage.title }}
						</RouterLink>
					</li>
				</ul>
				<p v-else>
					{{ t('drive.unused') }}
				</p>
				<p
					v-if="trash && usages.data.value?.length"
					class="drive-note"
				>
					{{ t('drive.unlinkFirst') }}
				</p>
				<div
					v-if="action !== 'edit'"
					class="drive-confirm"
				>
					<p>{{ action === 'purge' ? t('drive.purgeWarning') : t('drive.trashWarning') }}</p>
					<label v-if="action === 'purge'">{{ t('drive.typeName') }}<input
						v-model="confirmName"
						class="input"
						autocomplete="off"
						:placeholder="selected.file?.name"
					></label>
					<label v-else-if="usages.data.value?.length"><input
						v-model="confirmed"
						type="checkbox"
					> {{ t('drive.confirmUsed') }}</label>
				</div>
				<div class="drive-detail-actions">
					<XButton
						variant="secondary"
						:loading="downloading"
						@click="download(selected)"
					>
						{{ t('drive.download') }}
					</XButton>
					<XButton
						variant="secondary"
						@click="closeDetails"
					>
						{{ t('misc.cancel') }}
					</XButton>
					<XButton
						v-if="action === 'edit' && !trash"
						:loading="change.isPending.value"
						:disabled="!name.trim()"
						@click="apply('edit')"
					>
						{{ t('misc.save') }}
					</XButton>
					<XButton
						v-if="action === 'edit' && trash"
						danger
						:disabled="usages.isPending.value || usages.isError.value || !!usages.data.value?.length"
						@click="action = 'purge'"
					>
						{{ t('drive.purge') }}
					</XButton>
					<XButton
						v-if="action !== 'edit'"
						danger
						:loading="change.isPending.value"
						:disabled="!canConfirm"
						@click="apply(action)"
					>
						{{ action === 'purge' ? t('drive.purge') : t('drive.moveToTrash') }}
					</XButton>
				</div>
			</div>
		</Modal>
	</section>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useQuery, useQueryClient} from '@tanstack/vue-query'
import {useI18n} from 'vue-i18n'
import {refDebounced} from '@vueuse/core'
import type {DriveEntry} from '@/client/queries/drive'
import type {DriveChangeWritable} from '@/client/generated'
import {driveQuery, driveUsagesQuery, driveBlobQuery, useUploadDriveMutation, useChangeDriveMutation} from '@/client/queries/drive'
import {error} from '@/message'
import Modal from '@/components/misc/Modal.vue'
import DriveThumbnail from './DriveThumbnail.vue'
const props = withDefaults(defineProps<{picker?: boolean, images?: boolean, busy?: boolean}>(), {picker: false, images: false, busy: false})
const emit = defineEmits<{select: [file: DriveEntry]}>()
const {t} = useI18n()
const client = useQueryClient()
const search = ref(''), category = ref(''), pinned = ref(false), trash = ref(false), page = ref(1)
const debouncedSearch = refDebounced(search, 250)
watch([debouncedSearch, category, pinned, trash], () => {page.value = 1})
const query = useQuery(computed(() => driveQuery({page: page.value, search: debouncedSearch.value, category: category.value, pinned: pinned.value, trash: trash.value, images: props.images})))
const upload = useUploadDriveMutation(), change = useChangeDriveMutation()
const input = ref<HTMLInputElement | null>(null)
const selected = ref<DriveEntry | null>(null), name = ref(''), editCategory = ref(''), editPinned = ref(false)
const action = ref<'edit' | 'trash' | 'purge'>('edit'), confirmed = ref(false), confirmName = ref(''), downloading = ref(false)
const usages = useQuery(computed(() => ({...driveUsagesQuery(selected.value?.file_id ?? 0), enabled: selected.value !== null, staleTime: 0})))
const canConfirm = computed(() => !usages.isPending.value && !usages.isError.value && (action.value === 'purge' ? !usages.data.value?.length && confirmName.value === selected.value?.file?.name : !usages.data.value?.length || confirmed.value))
function formatSize(size: number) {return size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KiB` : `${(size / 1048576).toFixed(1)} MiB`}
function inspect(file: DriveEntry, mode: 'edit' | 'trash' | 'purge' = 'edit') {selected.value = file; name.value = file.file?.name ?? ''; editCategory.value = file.category; editPinned.value = file.pinned; action.value = mode; confirmed.value = false; confirmName.value = ''}
function closeDetails() {if (!change.isPending.value) selected.value = null}
async function uploadFiles() {
	for (const file of Array.from(input.value?.files ?? [])) {await upload.mutateAsync(file).catch(() => undefined)}
	if (input.value) input.value.value = ''
}
async function restore(file: DriveEntry) {await change.mutateAsync({id: file.file_id, body: {revision: file.revision, action: 'restore', name: '', category: '', pinned: false, confirm: false, confirm_name: ''}}).catch(() => undefined)}
async function apply(mode: DriveChangeWritable['action']) {
	if (!selected.value) return
	const result = await change.mutateAsync({id: selected.value.file_id, body: {revision: selected.value.revision, action: mode, name: name.value, category: editCategory.value, pinned: editPinned.value, confirm: confirmed.value || mode === 'purge', confirm_name: confirmName.value}}).catch(() => undefined)
	if (result) selected.value = null
	else if (selected.value) {selected.value = query.data.value?.files?.find(f => f.file_id === selected.value?.file_id) ?? null; confirmed.value = false; confirmName.value = ''}
}
async function download(file: DriveEntry) {
	downloading.value = true
	try {const blob = await client.fetchQuery(driveBlobQuery(file.file_id)); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.file?.name ?? 'file'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)} catch (e) {error(e)} finally {downloading.value = false}
}
</script>

<style scoped lang="scss">
.drive-browser {
inline-size: 100%;
min-inline-size: 0;
text-align: start;
}
.drive-heading, .drive-toolbar, .drive-card-actions, .drive-detail-actions, .drive-pagination {
display: flex;
align-items: center;
gap: .75rem;
flex-wrap: wrap;
}
.drive-heading {
justify-content: space-between;
margin-block-end: 1.25rem;
}
.drive-heading h2 {
margin-block-end: .35rem;
}
.drive-heading p, .drive-summary, small {
color: var(--grey-600);
}
.drive-toolbar > .input {
flex: 1 1 12rem;
inline-size: auto;
}
.drive-toolbar label {
white-space: nowrap;
}
.drive-summary {
margin-block: 1rem;
}
.drive-grid {
display: grid;
grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr));
gap: 1rem;
}
.drive-card {
min-inline-size: 0;
overflow: hidden;
border: 1px solid var(--grey-200);
border-radius: 1rem;
background: var(--white);
transition: transform .18s ease, box-shadow .18s ease;
}
.drive-card:hover {
transform: translateY(-2px);
box-shadow: 0 6px 20px rgb(0 0 0 / 8%);
}
.drive-preview {
display: block;
padding: 0;
border: 0;
inline-size: 100%;
block-size: 8.5rem;
background: var(--grey-100);
cursor: pointer;
}
.drive-card-body {
padding: .8rem;
}
.drive-card-body strong {
display: block;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
}
.drive-card-actions {
margin-block-start: .5rem;
gap: .25rem;
}
.drive-card-actions :deep(.button) {
padding-inline: .5rem;
}
.drive-note, .drive-confirm {
padding: 1rem;
background: var(--grey-100);
border-radius: .75rem;
margin-block: 1rem;
}
.drive-empty {
padding: 3rem 1rem;
text-align: center;
color: var(--grey-600);
}
.drive-details {
padding: 1.5rem;
text-align: start;
overflow-wrap: anywhere;
}
.drive-details > label {
display: block;
margin-block: .9rem;
}
.drive-usages {
max-block-size: 12rem;
overflow-y: auto;
padding-inline-start: 1.5rem;
}
.drive-detail-actions, .drive-pagination {
margin-block-start: 1.5rem;
justify-content: flex-end;
}
@media (prefers-reduced-motion: reduce) {
.drive-card {
transition: none;
} .drive-card:hover {
transform: none;
} }
</style>
