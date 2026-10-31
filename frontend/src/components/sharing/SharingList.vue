<template>
	<section class="sharing-section">
		<h3 class="sharing-title">
			{{ $t('project.share.userTeam.shared', {type: typeNames}) }}
		</h3>
		<div
			v-if="userIsAdmin"
			class="field has-addons sharing-add"
		>
			<p
				class="control is-expanded"
				:class="{ 'is-loading': showSearchLoading }"
			>
				<Multiselect
					v-model="selected"
					:loading="searchLoading"
					:placeholder="$t('misc.searchPlaceholder')"
					:aria-label="$t('project.share.userTeam.search', {type: typeName})"
					:search-results="unsharedCandidates"
					:label="searchLabel"
					@search="search = $event"
				>
					<template #searchResult="{option}">
						<slot
							name="candidate"
							:candidate="option"
						/>
					</template>
				</Multiselect>
			</p>
			<p class="control">
				<XButton
					:loading="isMutating"
					:aria-disabled="!selected || isMutating || undefined"
					@click="addSelected()"
				>
					{{ $t('project.share.share') }}
				</XButton>
			</p>
		</div>

		<div
			v-if="identifiedShares.length > 0"
			class="has-horizontal-overflow"
		>
			<table
				class="sharing-table"
				:class="{'is-admin': userIsAdmin}"
			>
				<thead>
					<tr>
						<th>
							<span class="is-sr-only">{{ $t('admin.users.nameLabel') }}</span>
						</th>
						<th class="type">
							<span class="is-sr-only">{{ $t('project.share.permission.title') }}</span>
						</th>
						<th v-if="userIsAdmin">
							<span class="is-sr-only">{{ $t('project.views.actions') }}</span>
						</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="share in identifiedShares"
						:key="share.id"
					>
						<slot
							name="share"
							:share="share"
						/>
						<td class="type">
							<span class="sharing-permission">
								<Icon :icon="permissionIcon(share.permission)" />
								{{ permissionLabel(share.permission) }}
							</span>
						</td>
						<td
							v-if="userIsAdmin"
							class="actions"
						>
							<div class="sharing-row-actions">
								<div class="select">
									<select
										v-model="selectedPermission[share.id]"
										:aria-disabled="isMutating || undefined"
										:aria-label="$t('project.share.userTeam.permissionFor', {sharable: shareName(share)})"
										@change="changePermission(share)"
									>
										<option
											:selected="share.permission === PERMISSIONS.READ"
											:value="PERMISSIONS.READ"
										>
											{{ $t('project.share.permission.read') }}
										</option>
										<option
											:selected="share.permission === PERMISSIONS.READ_WRITE"
											:value="PERMISSIONS.READ_WRITE"
										>
											{{ $t('project.share.permission.readWrite') }}
										</option>
										<option
											:selected="share.permission === PERMISSIONS.ADMIN"
											:value="PERMISSIONS.ADMIN"
										>
											{{ $t('project.share.permission.admin') }}
										</option>
									</select>
								</div>
								<XButton
									variant="tertiary"
									danger
									icon="trash-alt"
									:shadow="false"
									:aria-label="$t('project.share.userTeam.remove', {type: typeName})"
									@click="shareToDelete = share"
								/>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<p
			v-else
			class="sharing-empty"
		>
			{{ $t('project.share.userTeam.notShared', {type: typeNames}) }}
		</p>

		<Modal
			:enabled="shareToDelete !== null"
			danger
			@close="shareToDelete = null"
			@submit="removeShare()"
		>
			<template #header>
				<span>{{
					$t('project.share.userTeam.removeHeader', {type: typeName, sharable: $t('project.share.userTeam.sharable')})
				}}</span>
			</template>
			<template #text>
				<p>{{ $t('project.share.userTeam.removeText', {type: typeName, sharable: $t('project.share.userTeam.sharable')}) }}</p>
				<ProjectAccessCleanupList :intro="$t('project.share.userTeam.removeCleanupText')" />
			</template>
		</Modal>
	</section>
</template>

<script setup lang="ts" generic="Candidate extends Record<string, unknown> & {id?: number}, Share extends {id?: number, permission?: number}">
import {computed, ref, watch, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {normalizeSharePermission} from '@/client/queries/projectShares'
import {PERMISSIONS, type Permission} from '@/constants/permissions'
import {useDelayedLoading} from '@/composables/useDelayedLoading'
import Multiselect from '@/components/input/Multiselect.vue'
import ProjectAccessCleanupList from '@/components/sharing/ProjectAccessCleanupList.vue'

type Identified<T extends {id?: number}> = T & {id: number}

const props = defineProps<{
	projectId: number
	userIsAdmin: boolean
	shares: Share[]
	candidates: Candidate[]
	searchLoading: boolean
	searchLabel: string
	isMutating: boolean
	typeName: string
	typeNames: string
	shareName: (share: Identified<Share>) => string
	add: (projectId: number, candidate: Identified<Candidate>) => Promise<unknown>
	updatePermission: (projectId: number, share: Identified<Share>, permission: Permission) => Promise<unknown>
	remove: (projectId: number, share: Identified<Share>) => Promise<unknown>
}>()

const {t} = useI18n({useScope: 'global'})
const showSearchLoading = useDelayedLoading(() => props.searchLoading)

const search = defineModel<string>('search', {required: true})

defineSlots<{
	candidate(props: {candidate: Identified<Candidate>}): unknown
	share(props: {share: Identified<Share>}): unknown
}>()

function hasId<T extends {id?: number}>(item: T): item is Identified<T> {
	return typeof item.id === 'number'
}

const identifiedShares = computed(() => props.shares.filter(hasId))
const unsharedCandidates = computed(() => props.candidates.filter(hasId).filter(candidate => !identifiedShares.value.some(share => share.id === candidate.id)))
const selected = ref(null) as Ref<Identified<Candidate> | null>
const selectedPermission = ref<Record<number, Permission>>({})
const shareToDelete = ref(null) as Ref<Identified<Share> | null>

watch(identifiedShares, shares => {
	selectedPermission.value = Object.fromEntries(shares.map(share => [share.id, normalizeSharePermission(share.permission)]))
}, {immediate: true})
watch(() => props.projectId, () => {
	selected.value = null
	search.value = ''
	shareToDelete.value = null
})

async function addSelected() {
	const candidate = selected.value
	const projectId = props.projectId
	if (!candidate || props.isMutating) return
	try {
		await props.add(projectId, candidate)
	} catch {
		return
	}
	if (props.projectId === projectId && selected.value === candidate) {
		selected.value = null
		search.value = ''
	}
}

async function changePermission(share: Identified<Share>) {
	const projectId = props.projectId
	if (!props.isMutating) {
		await props.updatePermission(projectId, share, normalizeSharePermission(selectedPermission.value[share.id])).catch(() => {})
	}
	if (props.projectId === projectId) {
		selectedPermission.value[share.id] = normalizeSharePermission(identifiedShares.value.find(item => item.id === share.id)?.permission)
	}
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

async function removeShare() {
	const share = shareToDelete.value
	if (!share || props.isMutating) return
	await props.remove(props.projectId, share).catch(() => {})
	if (shareToDelete.value === share) shareToDelete.value = null
}
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

	.sharing-add {
		margin: 0;
	}

	.sharing-empty {
		margin: 0;
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}
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
		padding: var(--space-2) var(--space-1);
		border: 0;
		border-block-start: 1px solid var(--border-subtle);
		color: var(--text-primary);
		vertical-align: middle;
	}

	td.type {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	td.actions {
		inline-size: 1%;
		padding-inline-end: 0;
		white-space: nowrap;
	}

	// The permission select already shows the level to admins; phones keep the row to one line.
	@media screen and (width <= 480px) {
		&.is-admin .type {
			display: none;
		}
	}
}

.sharing-permission {
	display: inline-flex;
	align-items: center;
	gap: var(--space-1);
}

.sharing-row-actions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: var(--space-1);
}
</style>
