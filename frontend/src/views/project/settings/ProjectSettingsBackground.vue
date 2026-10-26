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
import {computed, ref} from 'vue'
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
	deleteBackgroundMutation.isPending.value,
)
const searching = useDelayedLoading(backgroundSearchQuery.isFetching)
const loadingMore = useDelayedLoading(backgroundSearchQuery.isFetchingNextPage)

async function setBackground(backgroundId: string) {
	if (setBackgroundMutation.isPending.value) {
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
	if (!file) {
		return
	}

	await uploadBackgroundMutation.mutateAsync({projectId: projectId.value, file}).catch(() => undefined)
}

async function removeBackground() {
	const id = projectId.value
	const updated = await deleteBackgroundMutation.mutateAsync({projectId: id}).catch(() => undefined)
	if (updated && isCurrentProject(id)) {
		goBack()
	}
}
const driveOpen = ref(false), presetLoading = ref(false)
const driveCover = useDriveCoverMutation()
async function chooseCover(file: DriveEntry) {
	const result = await driveCover.mutateAsync({file, projectId: projectId.value}).catch(() => undefined)
	if (result) driveOpen.value = false
}
async function applyPreset(preset: CoverPreset) {
	if (presetLoading.value) return
	presetLoading.value = true
	try {const file = await createCoverPreset(preset); await uploadBackgroundMutation.mutateAsync({projectId: projectId.value, file}).catch(() => undefined)} finally {presetLoading.value = false}
}
</script>

<style lang="scss" scoped>
.cover-presets {
margin-block-end: 1.5rem;
}
.cover-preset-grid {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
gap: .75rem;
margin-block: 1rem;
}
.cover-preset-grid button {
block-size: 5rem;
border: 0;
border-radius: .75rem;
color: white;
font-weight: 600;
text-shadow: 0 1px 3px #000000;
cursor: pointer;
}

.cover-preview img {
display: block;
inline-size: min(24rem, 100%);
block-size: 10rem;
object-fit: cover;
border-radius: 1rem;
margin-block-end: 1rem;
}
.unsplash-credit {
	text-align: end;
	font-size: .8rem;
}

.unsplash-credit__link {
	color: var(--grey-800);
}

.image-search__result-list {
	--items-per-row: 1;
	margin: 1rem 0 0;
	display: grid;
	gap: 1rem;
	grid-template-columns: repeat(var(--items-per-row), 1fr);

	@media screen and (min-width: $mobile) {
		--items-per-row: 2;
	}
	@media screen and (min-width: $tablet) {
		--items-per-row: 4;
	}
	@media screen and (min-width: $tablet) {
		--items-per-row: 5;
	}
}

.image-search__result-item {
	margin-block-start: 0;
// FIXME: removes padding from .content
	aspect-ratio: 16 / 10;
	display: flex;
}

.is-load-more-button {
	margin: 1rem auto 0 !important;
	display: block;
	inline-size: 200px;
}
</style>
