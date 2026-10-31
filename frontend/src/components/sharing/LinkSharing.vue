<template>
	<section class="sharing-section">
		<h3 class="sharing-title">
			{{ $t('project.share.links.title') }}
		</h3>
		<p class="sharing-description">
			{{ $t('project.share.links.explanation') }}
		</p>

		<div class="sharables-project">
			<XButton
				v-if="!showNewForm"
				variant="secondary"
				icon="plus"
				:shadow="false"
				class="link-share-create"
				@click="showNewForm = true"
			>
				{{ $t('project.share.links.create') }}
			</XButton>

			<form
				v-else
				class="link-share-form"
				@submit.prevent="add(projectId)"
			>
				<div class="link-share-fields">
					<FormField :label="$t('project.share.permission.title')">
						<template #default="{ id }">
							<div class="select">
								<select
									:id="id"
									v-model="draft.permission"
								>
									<option :value="PERMISSIONS.READ">
										{{ $t('project.share.permission.read') }}
									</option>
									<option :value="PERMISSIONS.READ_WRITE">
										{{ $t('project.share.permission.readWrite') }}
									</option>
									<option :value="PERMISSIONS.ADMIN">
										{{ $t('project.share.permission.admin') }}
									</option>
								</select>
							</div>
						</template>
					</FormField>
					<div class="link-share-field">
						<FormField
							id="linkShareName"
							v-model="draft.name"
							:label="$t('project.share.links.name')"
							:placeholder="$t('project.share.links.namePlaceholder')"
							:aria-describedby="nameHelpId"
						/>
						<p
							:id="nameHelpId"
							class="help"
						>
							{{ $t('project.share.links.nameExplanation') }}
						</p>
					</div>
					<div class="link-share-field">
						<FormField
							id="linkSharePassword"
							v-model="draft.password"
							:label="$t('project.share.links.password')"
							type="password"
							:placeholder="$t('user.auth.passwordPlaceholder')"
							autocomplete="new-password"
							:aria-describedby="passwordHelpId"
						/>
						<p
							:id="passwordHelpId"
							class="help"
						>
							{{ $t('project.share.links.passwordExplanation') }}
						</p>
					</div>
				</div>
				<div class="link-share-form-actions">
					<XButton
						variant="tertiary"
						:shadow="false"
						@click="closeForm"
					>
						{{ $t('misc.cancel') }}
					</XButton>
					<XButton
						type="submit"
						icon="plus"
						:shadow="false"
						:loading="isMutating"
						:disabled="isMutating"
					>
						{{ $t('project.share.share') }}
					</XButton>
				</div>
			</form>

			<div
				v-if="linkShares.length > 0"
				class="has-horizontal-overflow"
			>
				<table class="sharing-table">
					<thead>
						<tr>
							<th>
								<span class="is-sr-only">{{ $t('project.share.attributes.link') }}</span>
							</th>
							<th>
								<span class="is-sr-only">{{ $t('project.share.attributes.delete') }}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="s in linkShares"
							:key="s.id"
						>
							<td>
								<div class="link-share-cell">
									<p
										class="link-share-name"
										:class="{'is-unnamed': s.name === ''}"
									>
										{{ s.name !== '' ? s.name : $t('project.share.links.noName') }}
									</p>
									<p class="link-share-meta">
										<span class="link-share-permission">
											<Icon :icon="permissionIcon(s.permission)" />
											{{ permissionLabel(s.permission) }}
										</span>
										<span>
											<i18n-t
												keypath="project.share.links.sharedBy"
												scope="global"
											>
												<strong>{{ getDisplayName(s.shared_by) }}</strong>
											</i18n-t>
										</span>
									</p>
									<div class="link-share-controls">
										<div
											v-if="availableViews.length > 0"
											class="select link-share-view"
										>
											<select
												:value="selectedViews[s.id]"
												:aria-label="$t('project.share.links.view')"
												@change="pickedViews[s.id] = Number(($event.target as HTMLSelectElement).value)"
											>
												<option
													v-for="(view) in availableViews"
													:key="view.id"
													:value="view.id"
												>
													{{ view.title }}
												</option>
											</select>
										</div>
										<div class="link-share-url">
											<FormField
												:model-value="shareLinks[s.id]"
												readonly
												type="text"
												:aria-label="$t('project.share.attributes.link')"
												@focus="selectAll"
											>
												<template #addon>
													<XButton
														v-tooltip="$t('misc.copy')"
														variant="secondary"
														icon="copy"
														icon-only
														:shadow="false"
														@click="copy(shareLinks[s.id])"
													>
														{{ $t('misc.copy') }}
													</XButton>
												</template>
											</FormField>
										</div>
									</div>
								</div>
							</td>
							<td class="actions">
								<XButton
									variant="tertiary"
									danger
									icon="trash-alt"
									:shadow="false"
									:aria-label="$t('project.share.links.remove')"
									@click="
										() => {
											linkIdToDelete = s.id
											showDeleteModal = true
										}
									"
								/>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

		<Modal
			:enabled="showDeleteModal"
			danger
			@close="showDeleteModal = false"
			@submit="remove(projectId)"
		>
			<template #header>
				<span>{{ $t('project.share.links.remove') }}</span>
			</template>

			<template #text>
				<p>{{ $t('project.share.links.removeText') }}</p>
			</template>
		</Modal>
	</section>
</template>

<script setup lang="ts">
import {ref, watch, computed, useId} from 'vue'
import {useI18n} from 'vue-i18n'
import {useQuery} from '@tanstack/vue-query'
import type {LinkSharing} from '@/client/generated'
import {linkSharesQuery, createLinkShareDraft, useCreateLinkShareMutation, useDeleteLinkShareMutation} from '@/client/queries/linkShares'
import {PERMISSIONS} from '@/constants/permissions'
import FormField from '@/components/input/FormField.vue'
import {useCopyToClipboard} from '@/composables/useCopyToClipboard'
import {getDisplayName} from '@/helpers/user'
import {useConfigStore} from '@/stores/config'
import {useProjectViews} from '@/composables/useProjectViews'

const props = withDefaults(defineProps<{projectId?: number}>(), {projectId: 0})
const {t} = useI18n({useScope: 'global'})
const sharesQuery = useQuery(computed(() => ({...linkSharesQuery(props.projectId), enabled: props.projectId > 0})))
type VisibleShare = LinkSharing & Required<Pick<LinkSharing, 'id' | 'hash'>>
const linkShares = computed(() => (sharesQuery.data.value ?? []).filter((share): share is VisibleShare => typeof share.id === 'number' && typeof share.hash === 'string'))
const createMutation = useCreateLinkShareMutation()
const deleteMutation = useDeleteLinkShareMutation()
const isMutating = computed(() => createMutation.isPending.value || deleteMutation.isPending.value)
const draft = ref(createLinkShareDraft())
const showDeleteModal = ref(false)
const linkIdToDelete = ref(0)
const showNewForm = ref(false)
const {views: availableViews} = useProjectViews(() => props.projectId)
const copy = useCopyToClipboard()
const pickedViews = ref<Record<number, number>>({})
const configStore = useConfigStore()
const nameHelpId = useId()
const passwordHelpId = useId()

watch(() => props.projectId, () => {
	draft.value = createLinkShareDraft()
	showNewForm.value = false
	showDeleteModal.value = false
}, {flush: 'sync'})

function closeForm() {
	draft.value = createLinkShareDraft()
	showNewForm.value = false
}

async function add(projectId: number) {
	if (projectId <= 0 || isMutating.value) return
	try {
		await createMutation.mutateAsync({projectId, share: draft.value})
	} catch {
		return
	}
	if (props.projectId === projectId) {
		draft.value = createLinkShareDraft()
		showNewForm.value = false
	}
}

function remove(projectId: number) {
	if (isMutating.value) return
	deleteMutation.mutate({projectId, id: linkIdToDelete.value}, {
		onSettled: () => {
			if (props.projectId === projectId) showDeleteModal.value = false
		},
	})
}

function permissionIcon(permission?: number) {
	if (permission === PERMISSIONS.ADMIN) return 'lock'
	return permission === PERMISSIONS.READ_WRITE ? 'pen' : 'users'
}

function permissionLabel(permission?: number) {
	if (permission === PERMISSIONS.ADMIN) return t('project.share.permission.admin')
	return permission === PERMISSIONS.READ_WRITE
		? t('project.share.permission.readWrite')
		: t('project.share.permission.read')
}

// A focused read-only link is selected whole, so it can be copied by hand when the clipboard API is unavailable.
function selectAll(event: FocusEvent) {
	(event.target as HTMLInputElement).select()
}

const selectedViews = computed(() => {
	const viewIds = availableViews.value.flatMap(view => view.id === undefined ? [] : [view.id])
	return Object.fromEntries(linkShares.value.map(share => {
		const picked = pickedViews.value[share.id]
		return [share.id, picked !== undefined && viewIds.includes(picked) ? picked : viewIds[0] ?? null]
	}))
})

const shareLinks = computed(() => Object.fromEntries(linkShares.value.map(share => {
	const viewId = selectedViews.value[share.id]
	return [share.id, `${configStore.frontend_url}share/${share.hash}/auth${viewId ? `?view=${viewId}` : ''}`]
})))
</script>

<style lang="scss" scoped>
// The share dialog wraps everything in a Bulma .content card; the root class keeps these rules ahead of it.
.sharing-section {
	display: grid;
	gap: var(--space-3);
	min-inline-size: 0;

	&:not(:first-child) {
		padding-block-start: var(--space-5);
		border-block-start: 1px solid var(--border-subtle);
	}

	.sharing-title {
		margin: 0;
		color: var(--text-primary);
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		line-height: var(--leading-tight);
	}

	.sharing-description,
	.help {
		margin: 0;
	}

	.sharing-description {
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}
}

.sharables-project {
	display: grid;
	gap: var(--space-3);
	min-inline-size: 0;
}

.link-share-create {
	justify-self: start;
}

.link-share-form {
	display: grid;
	gap: var(--space-3);
	padding: var(--space-4);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	background: var(--surface-sunken);

	:deep(.field) {
		margin-block-end: 0;
	}

	.select,
	select {
		inline-size: 100%;
	}
}

.link-share-fields {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
	gap: var(--space-3);
	align-items: start;
}

.link-share-field {
	display: grid;
	gap: var(--space-1);
}

.link-share-form-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: var(--space-2);
}

.sharing-section .sharing-table {
	inline-size: 100%;
	margin: 0;
	border-collapse: collapse;
	background: transparent;

	th {
		padding: 0;
		border: 0;
	}

	td {
		padding: var(--space-3) var(--space-1);
		border: 0;
		border-block-start: 1px solid var(--border-subtle);
		color: var(--text-primary);
		vertical-align: top;
	}

	td.actions {
		inline-size: 1%;
		padding-inline-end: 0;
		text-align: end;
		white-space: nowrap;
	}
}

.link-share-cell {
	display: grid;
	gap: var(--space-2);
	min-inline-size: 0;
}

.sharing-section .link-share-name {
	margin: 0;
	font-weight: var(--weight-semibold);

	&.is-unnamed {
		color: var(--text-tertiary);
		font-style: italic;
		font-weight: var(--weight-regular);
	}
}

.sharing-section .link-share-meta {
	display: flex;
	margin: 0;
	flex-wrap: wrap;
	gap: var(--space-1) var(--space-3);
	color: var(--text-secondary);
	font-size: var(--text-sm);
}

.link-share-permission {
	display: inline-flex;
	align-items: center;
	gap: var(--space-1);
}

.link-share-controls {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
	min-inline-size: 0;

	:deep(.field) {
		margin-block-end: 0;
	}
}

.link-share-view {
	flex: 0 1 10rem;
	min-inline-size: 0;

	select {
		inline-size: 100%;
	}
}

.link-share-url {
	flex: 1 1 14rem;
	min-inline-size: 0;
}
</style>
