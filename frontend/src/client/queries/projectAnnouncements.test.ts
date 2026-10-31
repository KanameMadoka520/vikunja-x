import {beforeEach, describe, expect, it, vi} from 'vitest'
import {QueryClient, type MutationOptions} from '@tanstack/vue-query'

import {ApiError} from '@/client/problem'
import {i18n} from '@/i18n'
import {error, success} from '@/message'

const sdk = vi.hoisted(() => ({
	projectAnnouncementRead: vi.fn(),
	projectAnnouncementUpdate: vi.fn(),
}))

vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({success: vi.fn(), error: vi.fn()}))

import {
	normalizeProjectAnnouncement,
	projectAnnouncementKeys,
	projectAnnouncementQuery,
	updateProjectAnnouncementMutationOptions,
	type ProjectAnnouncementResponse,
} from './projectAnnouncements'

function execute<TData, TVariables, TContext>(
	client: QueryClient,
	options: MutationOptions<TData, Error, TVariables, TContext>,
	variables: TVariables,
) {
	return client.getMutationCache().build(client, options).execute(variables)
}

const cached: ProjectAnnouncementResponse = {
	project_id: 7,
	title: 'Maintenance',
	content: '<p>Friday</p>',
	revision: 3,
	updated: '2026-10-30T08:00:00Z',
	updated_by_id: 2,
	max_permission: 2,
}

beforeEach(() => {
	Object.values(sdk).forEach(mock => mock.mockReset())
	vi.mocked(success).mockReset()
	vi.mocked(error).mockReset()
})

describe('projectAnnouncementQuery', () => {
	it('reads one project and renders its own error state', async () => {
		const client = new QueryClient()
		sdk.projectAnnouncementRead.mockResolvedValue({data: {...cached, max_permission: 1}})

		const options = projectAnnouncementQuery(7)

		expect(options.queryKey).toEqual(projectAnnouncementKeys.detail(7))
		expect(options.queryKey).toEqual(['project-announcement', 7])
		expect(options.meta).toEqual({handlesError: true})
		expect(await client.fetchQuery(options)).toEqual({...cached, max_permission: 1})
		expect(sdk.projectAnnouncementRead).toHaveBeenCalledWith(expect.objectContaining({path: {project: 7}}))
	})

	it('normalizes an unset announcement', () => {
		expect(normalizeProjectAnnouncement({
			project_id: 7,
			title: '',
			content: '',
			revision: 0,
			updated: '0001-01-01T00:00:00Z',
			updated_by_id: 0,
			max_permission: 1,
		}, 7)).toEqual({
			project_id: 7,
			title: '',
			content: '',
			revision: 0,
			updated: undefined,
			updated_by_id: 0,
			max_permission: 1,
		})
	})

	it('falls back to read-only and the requested project for missing fields', () => {
		expect(normalizeProjectAnnouncement({content: null, title: null}, 9)).toEqual({
			project_id: 9,
			title: '',
			content: '',
			revision: 0,
			updated: undefined,
			updated_by_id: 0,
			max_permission: 0,
		})
	})
})

describe('updateProjectAnnouncementMutationOptions', () => {
	it('sends the base revision and writes the answer into the cached announcement', async () => {
		const client = new QueryClient()
		client.setQueryData(projectAnnouncementKeys.detail(7), cached)
		client.setQueryData(projectAnnouncementKeys.detail(8), {...cached, project_id: 8})
		sdk.projectAnnouncementUpdate.mockResolvedValue({data: {
			project_id: 7,
			title: 'Moved',
			content: '<p>Saturday</p>',
			revision: 4,
			updated: '2026-10-31T09:00:00Z',
			updated_by_id: 1,
		}})

		await execute(client, updateProjectAnnouncementMutationOptions(), {
			projectId: 7,
			title: 'Moved',
			content: '<p>Saturday</p>',
			revision: 3,
		})

		expect(sdk.projectAnnouncementUpdate).toHaveBeenCalledWith({
			path: {project: 7},
			body: {title: 'Moved', content: '<p>Saturday</p>', revision: 3},
		})
		// The write answer has no max_permission; the read's value stays.
		expect(client.getQueryData(projectAnnouncementKeys.detail(7))).toEqual({
			project_id: 7,
			title: 'Moved',
			content: '<p>Saturday</p>',
			revision: 4,
			updated: '2026-10-31T09:00:00Z',
			updated_by_id: 1,
			max_permission: 2,
		})
		expect(client.getQueryState(projectAnnouncementKeys.detail(7))?.isInvalidated).toBe(true)
		expect(client.getQueryState(projectAnnouncementKeys.detail(8))?.isInvalidated).toBe(false)
		expect(success).toHaveBeenCalledWith({message: i18n.global.t('project.announcement.saved')})
	})

	it('does not materialize an announcement nobody reads', async () => {
		const client = new QueryClient()
		sdk.projectAnnouncementUpdate.mockResolvedValue({data: {...cached, revision: 4}})

		await execute(client, updateProjectAnnouncementMutationOptions(), {
			projectId: 7,
			title: 'Maintenance',
			content: '<p>Friday</p>',
			revision: 3,
		})

		expect(client.getQueryData(projectAnnouncementKeys.detail(7))).toBeUndefined()
	})

	it('reports clearing as a removal', async () => {
		const client = new QueryClient()
		sdk.projectAnnouncementUpdate.mockResolvedValue({data: {project_id: 7, title: '', content: '', revision: 4}})

		await execute(client, updateProjectAnnouncementMutationOptions(), {projectId: 7, title: '', content: '', revision: 3})

		expect(success).toHaveBeenCalledWith({message: i18n.global.t('project.announcement.removed')})
	})

	it('leaves a conflict to the editor: no toast, cache kept, latest version re-read', async () => {
		const client = new QueryClient()
		client.setQueryData(projectAnnouncementKeys.detail(7), cached)
		const conflict = new ApiError({status: 409, code: 20001, detail: 'The project announcement changed.'})
		sdk.projectAnnouncementUpdate.mockRejectedValue(conflict)

		await expect(execute(client, updateProjectAnnouncementMutationOptions(), {
			projectId: 7,
			title: 'Mine',
			content: '<p>draft</p>',
			revision: 2,
		})).rejects.toBe(conflict)

		expect(error).not.toHaveBeenCalled()
		expect(success).not.toHaveBeenCalled()
		expect(client.getQueryData(projectAnnouncementKeys.detail(7))).toEqual(cached)
		expect(client.getQueryState(projectAnnouncementKeys.detail(7))?.isInvalidated).toBe(true)
	})
})
