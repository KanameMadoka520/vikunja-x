<template>
	<div
		class="edit-team is-max-width-desktop"
		:aria-busy="isFetching"
	>
		<LoadError
			v-if="isError && !team"
			:retry="() => refetch()"
		/>

		<EditTeamForm
			v-if="team && userIsAdmin && !team.external_id"
			:key="team.id"
			:team="team"
			:loading="teamLoading"
			:members-loading="membersLoading"
			@save="save"
		/>

		<Card
			class="is-fullwidth has-overflow team-members"
			:title="$t('team.edit.members')"
			:padding="false"
		>
			<form
				v-if="userIsAdmin && !team?.external_id"
				class="team-members__add"
				@submit.prevent="addUser"
			>
				<div class="field has-addons">
					<div class="control is-expanded">
						<Multiselect
							v-model="newMember"
							:loading="usersLoading"
							:placeholder="$t('team.edit.search')"
							:search-results="foundUsers"
							label="username"
							@search="findUser"
						>
							<template #searchResult="{option: user}">
								<User
									:avatar-size="24"
									:user="user"
									class="m-0"
								/>
							</template>
						</Multiselect>
					</div>
					<div class="control">
						<XButton
							icon="plus"
							:loading="addMemberMutation.isPending.value"
							@click="addUser"
						>
							{{ $t('team.edit.addUser') }}
						</XButton>
					</div>
				</div>
				<p
					v-if="showMustSelectUserError"
					class="help is-danger"
				>
					{{ $t('team.edit.mustSelectUser') }}
				</p>
			</form>
			<div
				v-if="!team && isPending"
				class="team-members__skeleton"
				role="status"
			>
				<span class="is-sr-only">{{ $t('misc.loading') }}</span>
				<span
					v-for="row in 3"
					:key="row"
					class="team-members__skeleton-row"
					aria-hidden="true"
				/>
			</div>
			<div
				v-else
				class="has-horizontal-overflow"
			>
				<table class="table has-actions is-hoverable is-fullwidth team-members__table">
					<thead>
						<tr>
							<th scope="col">
								{{ $t('misc.user') }}
							</th>
							<th scope="col">
								{{ $t('team.edit.role') }}
							</th>
							<th
								v-if="userIsAdmin"
								scope="col"
								class="actions"
							>
								<span class="is-sr-only">{{ $t('misc.actions') }}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="m in sortedMembers"
							:key="m.id"
						>
							<td>
								<span class="team-member">
									<User
										:avatar-size="24"
										:user="m"
										class="m-0"
									/>
									<span
										v-if="m.id === userInfo?.id"
										class="team-member__you"
									>{{ $t('tcymc.you') }}</span>
								</span>
							</td>
							<td class="type">
								<template v-if="m.admin">
									<span class="icon is-small">
										<Icon icon="lock" />
									</span>
									{{ $t('team.attributes.admin') }}
								</template>
								<template v-else>
									<span class="icon is-small">
										<Icon icon="user" />
									</span>
									{{ $t('team.attributes.member') }}
								</template>
							</td>
							<td
								v-if="userIsAdmin"
								class="actions"
							>
								<template v-if="m.id !== userInfo?.id">
									<XButton
										variant="secondary"
										class="is-small"
										:shadow="false"
										:loading="isTogglingMember(m)"
										:disabled="isRemovingMember(m) || undefined"
										@click="() => toggleUserType(m)"
									>
										{{ m.admin ? $t('team.edit.makeMember') : $t('team.edit.makeAdmin') }}
									</XButton>
									<XButton
										variant="tertiary"
										class="is-small team-member__remove"
										:shadow="false"
										:loading="isRemovingMember(m)"
										icon="trash-alt"
										:aria-label="$t('team.edit.deleteUser.header')"
										@click="() => {memberToDelete = m; showUserDeleteModal = true}"
									/>
								</template>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</Card>

		<section
			v-if="team && !team.external_id"
			class="team-danger-zone"
			aria-labelledby="team-danger-zone-heading"
		>
			<h2
				id="team-danger-zone-heading"
				class="team-danger-zone__title"
			>
				{{ $t('team.edit.dangerZone') }}
			</h2>
			<div class="team-danger-zone__actions">
				<XButton
					variant="secondary"
					icon="sign-out-alt"
					:shadow="false"
					class="team-danger-zone__leave"
					@click="showLeaveModal = true"
				>
					{{ $t('team.edit.leave.title') }}
				</XButton>
				<XButton
					v-if="userIsAdmin"
					danger
					icon="trash-alt"
					:shadow="false"
					:loading="deleteMutation.isPending.value"
					@click="showDeleteModal = true"
				>
					{{ $t('team.edit.delete.header') }}
				</XButton>
			</div>
		</section>

		<!-- Leave team modal -->
		<Modal
			v-if="showLeaveModal"
			danger
			@close="showLeaveModal = false"
			@submit="leave()"
		>
			<template #header>
				<span>{{ $t('team.edit.leave.title') }}</span>
			</template>

			<template #text>
				<p>
					{{ $t('team.edit.leave.text1') }}<br>
					{{ $t('team.edit.leave.text2') }}
				</p>
				<ProjectAccessCleanupList
					:intro="$t('team.edit.leave.cleanupText')"
					perspective="self"
				/>
			</template>
		</Modal>

		<!-- Team delete modal -->
		<Modal
			:enabled="showDeleteModal"
			danger
			@close="showDeleteModal = false"
			@submit="deleteTeam()"
		>
			<template #header>
				<span>{{ $t('team.edit.delete.header') }}</span>
			</template>

			<template #text>
				<p>
					{{ $t('team.edit.delete.text1') }}<br>
					{{ $t('team.edit.delete.text2') }}
				</p>
				<ProjectAccessCleanupList :intro="$t('team.edit.delete.cleanupText')" />
			</template>
		</Modal>

		<!-- User delete modal -->
		<Modal
			:enabled="showUserDeleteModal"
			danger
			@close="showUserDeleteModal = false"
			@submit="deleteMember()"
		>
			<template #header>
				<span>{{ $t('team.edit.deleteUser.header') }}</span>
			</template>

			<template #text>
				<p>
					{{ $t('team.edit.deleteUser.text1') }}<br>
					{{ $t('team.edit.deleteUser.text2') }}
				</p>
				<ProjectAccessCleanupList :intro="$t('team.edit.deleteUser.cleanupText')" />
			</template>
		</Modal>
	</div>
</template>

<script lang="ts" setup>
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import Multiselect from '@/components/input/Multiselect.vue'
import User from '@/components/misc/User.vue'
import ProjectAccessCleanupList from '@/components/sharing/ProjectAccessCleanupList.vue'
import EditTeamForm from '@/components/teams/EditTeamForm.vue'
import LoadError from '@/components/misc/state/LoadError.vue'
import {getDisplayName} from '@/helpers/user'
import {useUpdateTeamMutation, useDeleteTeamMutation, useAddTeamMemberMutation, useRemoveTeamMemberMutation, useLeaveTeamMutation, useToggleTeamMemberAdminMutation} from '@/client/queries/teams'
import {useTeam} from '@/composables/useTeams'
import {useUserSearch} from '@/composables/useUserSearch'
import {PERMISSIONS} from '@/constants/permissions'
import {useTitle} from '@/composables/useTitle'
import {useAuthStore} from '@/stores/auth'
import type {User as ApiUser, TeamUser, TeamWritable} from '@/client/generated'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const {t} = useI18n({useScope: 'global'})
const teamId = computed(() => Number(route.params.id))
const {data: team, isFetching, isPending, isError, refetch} = useTeam(teamId)

const userIsAdmin = computed(() => (team.value?.max_permission ?? PERMISSIONS.READ) === PERMISSIONS.ADMIN)
const userInfo = computed(() => authStore.info)
const sortedMembers = computed(() => [...(team.value?.members ?? [])].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b), undefined, {sensitivity: 'base'})))
const updateMutation = useUpdateTeamMutation()
const deleteMutation = useDeleteTeamMutation()
const addMemberMutation = useAddTeamMemberMutation()
const removeMemberMutation = useRemoveTeamMemberMutation()
const leaveMutation = useLeaveTeamMutation()
const toggleAdminMutation = useToggleTeamMemberAdminMutation()
const teamLoading = computed(() => updateMutation.isPending.value || deleteMutation.isPending.value)
const membersLoading = computed(() => addMemberMutation.isPending.value || removeMemberMutation.isPending.value || toggleAdminMutation.isPending.value)
const userSearch = ref('')
const {users: userResults, isFetching: usersLoading} = useUserSearch(userSearch)
const foundUsers = computed(() => userResults.value.filter(u => u.id !== userInfo.value?.id && !team.value?.members?.some(member => member.id === u.id)))
const memberToDelete = ref<TeamUser>()
const newMember = ref<ApiUser | null>(null)
const showDeleteModal = ref(false)
const showUserDeleteModal = ref(false)
const showLeaveModal = ref(false)
const showMustSelectUserError = ref(false)
const title = computed(() => t('team.edit.title', {team: team.value?.name ?? ''}))
useTitle(title)

function save(draft: Required<TeamWritable>) {
	updateMutation.mutate({id: teamId.value, team: draft})
}

async function deleteTeam() {
	try {
		await deleteMutation.mutateAsync(teamId.value)
	} catch {
		return
	} finally {
		showDeleteModal.value = false
	}
	await router.push({name: 'teams.index'})
}

function deleteMember() {
	if (!memberToDelete.value?.username) return
	removeMemberMutation.mutate({teamId: teamId.value, username: memberToDelete.value.username}, {
		onSettled: () => {
			showUserDeleteModal.value = false
		},
	})
}

async function addUser() {
	showMustSelectUserError.value = !newMember.value?.username
	if (!newMember.value?.username) return
	try {
		await addMemberMutation.mutateAsync({teamId: teamId.value, username: newMember.value.username})
	} catch {
		return
	}
	newMember.value = null
	userSearch.value = ''
}

// Only the row being changed shows a spinner.
function isTogglingMember(member: TeamUser) {
	return toggleAdminMutation.isPending.value && toggleAdminMutation.variables.value?.username === member.username
}

function isRemovingMember(member: TeamUser) {
	return removeMemberMutation.isPending.value && removeMemberMutation.variables.value?.username === member.username
}

function toggleUserType(member: TeamUser) {
	if (!member.username) return
	toggleAdminMutation.mutate({teamId: teamId.value, username: member.username})
}

function findUser(query: string) {
	userSearch.value = query
}

async function leave() {
	if (!userInfo.value?.username) return
	try {
		await leaveMutation.mutateAsync({teamId: teamId.value, username: userInfo.value.username})
	} catch {
		return
	} finally {
		showLeaveModal.value = false
	}
	await router.push({name: 'home'})
}
</script>

<style lang="scss" scoped>
.edit-team {
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
}

.card.is-fullwidth {
	margin-block-end: 0;

	.content {
		padding: 0;
	}
}

.team-members__add {
	padding: var(--space-4);
	border-block-end: 1px solid var(--border-subtle);
}

.team-members__table {
	th {
		color: var(--text-tertiary);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		white-space: nowrap;
	}

	td {
		vertical-align: middle;
	}

	.type {
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.actions {
		text-align: end;
		white-space: nowrap;
	}
}

.team-member {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-2);
}

.team-member__you {
	padding: .0625rem var(--space-2);
	border-radius: var(--radius-full);
	background: var(--surface-selected);
	color: var(--accent-text);
	font-size: var(--text-xs);
	font-weight: var(--weight-semibold);
}

// Out-ranks the tertiary button's inherited colour.
.team-members__table .button.team-member__remove {
	margin-inline-start: var(--space-1);
	color: var(--danger-text);
}

.team-members__skeleton {
	display: grid;
	gap: var(--space-2);
	padding: var(--space-4);
}

.team-members__skeleton-row {
	block-size: 1.5rem;
	inline-size: 50%;
	border-radius: var(--radius-xs);
	background: var(--surface-active);
}

.team-danger-zone {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-3) var(--space-4);
	padding: var(--space-4);
	border: 1px solid var(--border-default);
	border-inline-start: 3px solid var(--danger);
	border-radius: var(--radius-md);
	background: var(--surface);
}

.team-danger-zone__title {
	margin: 0;
	font-size: var(--text-lg);
}

.team-danger-zone__actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
}

.team-danger-zone__actions .button.team-danger-zone__leave {
	color: var(--danger-text);
}
</style>
