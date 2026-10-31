<template>
	<CreateEdit
		v-if="uploadBackgroundEnabled || unsplashBackgroundEnabled"
		:title="$t('project.background.title')"
		:loading="backgroundMutationLoading || project.isPending.value"
		class="project-background-setting"
		:wide="true"
	>
		<ErrorMessage v-if="project.isError.value" />

		<p>{{ $t('flow.coverNote') }}</p><div
			v-if="cover"
			class="cover-preview"
		>
			<img
				:src="cover"
				:alt="$t('flow.coverPreview')"
			>
		</div>
		<template v-if="canWrite">
			<div
				v-if="uploadBackgroundEnabled"
				class="cover-presets"
			>
				<h3>{{ t('drive.presets') }}</h3><p>{{ t('drive.presetsNote') }}</p>
				<div class="cover-preset-grid">
					<button
						v-for="preset in coverPresets"
						:key="preset.id"
						type="button"
						:style="{background: `linear-gradient(135deg, ${preset.colors.join(',')})`}"
						:disabled="backgroundMutationLoading || presetLoading"
						@click="applyPreset(preset)"
					>
						{{ t(`drive.presetNames.${preset.id}`) }}
					</button>
				</div>
				<XButton
					variant="secondary"
					icon="folder"
					:disabled="backgroundMutationLoading"
					@click="driveOpen = true"
				>
					{{ t('drive.choose') }}
				</XButton>
				<DrivePicker
					v-if="driveOpen"
					images
					:busy="driveCover.isPending.value"
					@close="driveOpen = false"
					@select="chooseCover"
				/>
				<p
					v-if="presetLoading || driveCover.isPending.value"
					role="status"
				>
					{{ t('drive.applying') }}
				</p>
			</div>
			<div
				v-if="uploadBackgroundEnabled"
				class="mbe-4"
			>
				<input
					ref="backgroundUploadInput"
					accept="image/*"
					class="is-hidden"
					type="file"
					@change="uploadBackground"
				>
				<XButton
					:loading="uploadBackgroundMutation.isPending.value"
					variant="primary"
					@click="backgroundUploadInput?.click()"
				>
					{{ $t('project.background.upload') }}
				</XButton>
			</div>
			<template v-if="unsplashBackgroundEnabled">
				<input
					v-model="backgroundSearchInput"
					:class="{'is-loading': searching}"
					class="input is-expanded"
					:placeholder="$t('project.background.searchPlaceholder')"
					type="text"
					@keyup="debounceNewBackgroundSearch()"
				>

				<p class="unsplash-credit">
					<BaseButton
						class="unsplash-credit__link"
						href="https://unsplash.com"
					>
						{{ $t('project.background.poweredByUnsplash') }}
					</BaseButton>
				</p>

				<div
					v-if="backgroundSearchQuery.isError.value"
					class="has-text-centered mbs-4"
				>
					<p class="has-text-danger">
						{{ $t('project.background.searchError') }}
					</p>
					<XButton
						variant="secondary"
						:shadow="false"
						@click="backgroundSearchQuery.refetch()"
					>
						{{ $t('project.background.retry') }}
					</XButton>
				</div>

				<ul class="image-search__result-list">
					<li
						v-for="im in backgroundSearchResult"
						:key="im.id"
						class="image-search__result-item"
					>
						<UnsplashBackgroundThumbnail
							:image="im"
							@select="setBackground(im.id)"
						/>
					</li>
				</ul>
				<XButton
					v-if="backgroundSearchResult.length > 0 && backgroundSearchQuery.hasNextPage.value"
					:disabled="backgroundSearchQuery.isFetchingNextPage.value"
					class="is-load-more-button mbs-4"
					:shadow="false"
					variant="secondary"
					@click="backgroundSearchQuery.fetchNextPage()"
				>
					{{ loadingMore ? $t('misc.loading') : $t('project.background.loadMore') }}
				</XButton>
			</template>
		</template>
		<p v-else-if="project.data.value">
			{{ $t('project.background.noPermission') }}
		</p>

		<template #footer>
			<XButton
				v-if="hasBackground && canWrite"
				:shadow="false"
				variant="tertiary"
				danger
				@click.prevent.stop="removeBackground"
			>
				{{ $t('project.background.remove') }}
			</XButton>
			<XButton
				variant="secondary"
				@click.prevent.stop="goBack()"
			>
				{{ $t('misc.close') }}
			</XButton>
		</template>
	</CreateEdit>
</template>


<script setup lang="ts">
import DrivePicker from '@/components/drive/DrivePicker.vue'
import {useDriveCoverMutation, type DriveEntry} from '@/client/queries/drive'
import {coverPresets, createCoverPreset, type CoverPreset} from '@/helpers/coverPresets'

import {useProjectBackground} from '@/composables/useProjectBackground'
import {computed, ref, watch} from 'vue'
import {error as showError} from '@/message'
import {useInfiniteQuery, useQuery} from '@tanstack/vue-query'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {useDebounceFn} from '@vueuse/core'

import type {Image} from '@/client/generated'
import {
	unsplashBackgroundSearchQuery,
	useDeleteProjectBackgroundMutation,
	useSetUnsplashProjectBackgroundMutation,
	useUploadProjectBackgroundMutation,
} from '@/client/queries/projectBackgrounds'
import {projectQuery} from '@/client/queries/projects'
import BaseButton from '@/components/base/BaseButton.vue'
import UnsplashBackgroundThumbnail from '@/components/project/partials/UnsplashBackgroundThumbnail.vue'

import {PERMISSIONS} from '@/constants/permissions'

import {useConfigStore} from '@/stores/config'

import {useTitle} from '@/composables/useTitle'
import {useDelayedLoading} from '@/composables/useDelayedLoading'
import {useGoBack} from '@/composables/useGoBack'

import CreateEdit from '@/components/misc/CreateEdit.vue'
import ErrorMessage from '@/components/misc/Error.vue'

defineOptions({name: 'ProjectSettingBackground'})

const SEARCH_DEBOUNCE = 300

const {t} = useI18n({useScope: 'global'})
const route = useRoute()
const goBack = useGoBack()
const configStore = useConfigStore()

useTitle(() => t('project.background.title'))

const unsplashBackgroundEnabled = computed(() => configStore.enabled_background_providers.includes('unsplash'))
const uploadBackgroundEnabled = computed(() => configStore.enabled_background_providers.includes('upload'))
const projectId = computed(() => Number(route.params.projectId))
const project = useQuery(computed(() => projectQuery(projectId.value)))
const {background: cover} = useProjectBackground(() => project.data.value ?? null)
const canWrite = computed(() => project.data.value !== undefined && (project.data.value.max_permission ?? 0) >= PERMISSIONS.READ_WRITE)
const backgroundSearchTerm = ref('')
const backgroundSearchInput = ref('')
const backgroundSearchQuery = useInfiniteQuery(computed(() => ({
	...unsplashBackgroundSearchQuery(backgroundSearchTerm.value),
	enabled: unsplashBackgroundEnabled.value && canWrite.value,
})))
const backgroundSearchResult = computed(() => (backgroundSearchQuery.data.value?.pages.flat() ?? [])
	.filter((image): image is Image & {id: string} => typeof image.id === 'string'))

const hasBackground = computed(() => Boolean(project.data.value?.background_information))

const debounceNewBackgroundSearch = useDebounceFn(() => {
	backgroundSearchTerm.value = backgroundSearchInput.value
}, SEARCH_DEBOUNCE)

const isCurrentProject = (id: number) => projectId.value === id
const setBackgroundMutation = useSetUnsplashProjectBackgroundMutation(isCurrentProject)
const uploadBackgroundMutation = useUploadProjectBackgroundMutation(isCurrentProject)
const deleteBackgroundMutation = useDeleteProjectBackgroundMutation(isCurrentProject)
const backgroundMutationLoading = computed(() =>
	setBackgroundMutation.isPending.value ||
	uploadBackgroundMutation.isPending.value ||
	deleteBackgroundMutation.isPending.value || driveCover.isPending.value || presetLoading.value,
)
const searching = useDelayedLoading(backgroundSearchQuery.isFetching)
const loadingMore = useDelayedLoading(backgroundSearchQuery.isFetchingNextPage)

async function setBackground(backgroundId: string) {
	if (backgroundMutationLoading.value) {
		return
	}

	await setBackgroundMutation.mutateAsync({
		imageId: backgroundId,
		projectId: projectId.value,
	}).catch(() => undefined)
}

const backgroundUploadInput = ref<HTMLInputElement | null>(null)
async function uploadBackground() {
	const file = backgroundUploadInput.value?.files?.[0]
	if (!file || backgroundMutationLoading.value) {
		return
	}

	await uploadBackgroundMutation.mutateAsync({projectId: projectId.value, file}).catch(() => undefined)
	if (backgroundUploadInput.value) backgroundUploadInput.value.value = ''
}

async function removeBackground() {
	if (backgroundMutationLoading.value) return
	const id = projectId.value
	const updated = await deleteBackgroundMutation.mutateAsync({projectId: id}).catch(() => undefined)
	if (updated && isCurrentProject(id)) {
		goBack()
	}
}
const driveOpen = ref(false), presetLoading = ref(false)
const driveCover = useDriveCoverMutation()
watch(projectId, () => {driveOpen.value = false})
async function chooseCover(file: DriveEntry) {
	if (backgroundMutationLoading.value) return
	const result = await driveCover.mutateAsync({file, projectId: projectId.value}).catch(() => undefined)
	if (result) driveOpen.value = false
}
async function applyPreset(preset: CoverPreset) {
	if (backgroundMutationLoading.value) return
	const targetId = projectId.value
	presetLoading.value = true
	try {
		const file = await createCoverPreset(preset)
		if (!isCurrentProject(targetId)) return
		await uploadBackgroundMutation.mutateAsync({projectId: targetId, file}).catch(() => undefined)
	} catch (error) {
		if (isCurrentProject(targetId)) showError(error)
	} finally {presetLoading.value = false}
}
</script>

<style lang="scss" scoped>
.cover-presets {
	margin-block-end: var(--space-6);

	h3 {
		margin-block-end: var(--space-1);
		font-size: var(--text-lg);
	}

	p {
		color: var(--text-secondary);
		font-size: var(--text-md);
	}
}

.cover-preset-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
	gap: var(--space-3);
	margin-block: var(--space-4);
}

// Labels sit on the preset gradients themselves, so they keep fixed light text with a shadow.
.cover-preset-grid button {
	block-size: 4.5rem;
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	color: var(--text-on-accent);
	font-weight: var(--weight-semibold);
	text-shadow: 0 1px 3px hsla(220, 30%, 6%, .7);
	cursor: pointer;

	&:hover {
		box-shadow: var(--elevation-2);
	}

	&:focus-visible {
		@include focus-ring;
	}

	&[disabled] {
		cursor: not-allowed;
		opacity: .6;
	}
}

.cover-preview img {
	display: block;
	inline-size: min(24rem, 100%);
	block-size: 10rem;
	margin-block-end: var(--space-4);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-lg);
	object-fit: cover;
}

.unsplash-credit {
	text-align: end;
	font-size: var(--text-sm);
}

.unsplash-credit__link {
	color: var(--text-secondary);
}

.image-search__result-list {
	--items-per-row: 1;

	display: grid;
	grid-template-columns: repeat(var(--items-per-row), 1fr);
	gap: var(--space-3);
	margin: var(--space-4) 0 0;

	@media screen and (min-width: $mobile) {
		--items-per-row: 2;
	}

	@media screen and (min-width: $tablet) {
		--items-per-row: 4;
	}

	@media screen and (min-width: $desktop) {
		--items-per-row: 5;
	}
}

.image-search__result-item {
	display: flex;
	aspect-ratio: 16 / 10;
	margin-block-start: 0; // removes the spacing .content adds between list items
	overflow: hidden;
	border-radius: var(--radius-md);
}

.is-load-more-button {
	display: block;
	inline-size: 200px;
	margin: var(--space-4) auto 0 !important;
}
</style>
