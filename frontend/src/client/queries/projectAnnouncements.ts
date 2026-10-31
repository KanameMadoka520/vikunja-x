import {queryOptions, useMutation} from '@tanstack/vue-query'
import {projectAnnouncementRead, projectAnnouncementUpdate} from '@/client/generated'
import {PERMISSIONS} from '@/constants/permissions'
import {i18n} from '@/i18n'
import {contextMutationOptions} from './contextMutation'

// What the API sends, typed structurally: the read carries max_permission, the write answer does not,
// and an unset announcement arrives with empty values, revision 0 and Go's zero time.
export type RawProjectAnnouncement = {
	project_id?: number | null
	title?: string | null
	content?: string | null
	revision?: number | null
	updated?: string | null
	updated_by_id?: number | null
	max_permission?: number | null
}

export type ProjectAnnouncementResponse = {
	project_id: number
	title: string
	content: string
	revision: number
	// Missing while nothing was ever saved.
	updated?: string
	updated_by_id: number
	max_permission: number
}

export const projectAnnouncementKeys = {
	all: ['project-announcement'] as const,
	detail: (projectId: number) => ['project-announcement', projectId] as const,
}

const ZERO_TIME = /^0001-01-01/

export function normalizeProjectAnnouncement(raw: RawProjectAnnouncement | null | undefined, projectId: number): ProjectAnnouncementResponse {
	return {
		project_id: raw?.project_id || projectId,
		title: raw?.title ?? '',
		content: raw?.content ?? '',
		revision: raw?.revision ?? 0,
		updated: raw?.updated && !ZERO_TIME.test(raw.updated) ? raw.updated : undefined,
		updated_by_id: raw?.updated_by_id ?? 0,
		// Unknown permission means read-only: an edit button the server then refuses is worse than none.
		max_permission: raw?.max_permission ?? PERMISSIONS.READ,
	}
}

export function projectAnnouncementQuery(projectId: number) {
	return queryOptions({
		queryKey: projectAnnouncementKeys.detail(projectId),
		queryFn: async ({signal}) => normalizeProjectAnnouncement(
			(await projectAnnouncementRead({path: {project: projectId}, signal})).data,
			projectId,
		),
		// The bar renders nothing when the read fails; a toast on every project open would be noise.
		meta: {handlesError: true},
	})
}

export type UpdateProjectAnnouncementInput = {
	projectId: number
	title: string
	content: string
	// The revision the edit started from; the server answers 409 when someone saved in between.
	revision: number
}

/**
 * Saves or (with an empty title and content) clears the announcement. Failures are not toasted:
 * the editor keeps the draft and shows a 409 conflict, a lost permission or an archived project itself.
 */
export function updateProjectAnnouncementMutationOptions() {
	return contextMutationOptions({
		mutationFn: async ({projectId, title, content, revision}: UpdateProjectAnnouncementInput) =>
			(await projectAnnouncementUpdate({path: {project: projectId}, body: {title, content, revision}})).data,
		onSuccess: (saved, {projectId}, client) => {
			// The write answer has no max_permission; keep the one the read reported.
			client.setQueryData<ProjectAnnouncementResponse>(projectAnnouncementKeys.detail(projectId), current => current
				? normalizeProjectAnnouncement({...current, ...saved}, projectId)
				: current)
		},
		onSettled: ({projectId}, client) => client.invalidateQueries({
			queryKey: projectAnnouncementKeys.detail(projectId),
			exact: true,
		}),
		successMessage: (_saved, {title, content}) => i18n.global.t(title === '' && content === ''
			? 'project.announcement.removed'
			: 'project.announcement.saved'),
		toastError: () => false,
	})
}

export function useUpdateProjectAnnouncementMutation() {
	return useMutation(updateProjectAnnouncementMutationOptions())
}
