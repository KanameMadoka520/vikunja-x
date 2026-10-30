import {describe, expect, it} from 'vitest'

import {
	countProjectsByStatus,
	matchesProjectSearch,
	matchesProjectStatus,
	parseProjectStatusFilter,
	resolveStoredProjectStatus,
	splitProjectList,
} from './projectStatus'

const active = {
	id: 1,
	is_archived: false,
	is_completed: false,
}
const completed = {
	id: 2,
	is_archived: false,
	is_completed: true,
}
const archived = {
	id: 3,
	is_archived: true,
	is_completed: false,
}
const completedAndArchived = {
	id: 4,
	is_archived: true,
	is_completed: true,
}
const legacy = {
	id: 5,
	is_archived: false,
}
const savedFilter = {
	id: -2,
	is_archived: false,
	is_completed: false,
}

describe('matchesProjectStatus', () => {
	it('keeps completion and archive independent', () => {
		expect(matchesProjectStatus(completedAndArchived, 'completed')).toBe(true)
		expect(matchesProjectStatus(completedAndArchived, 'archived')).toBe(true)
		expect(matchesProjectStatus(completedAndArchived, 'active')).toBe(false)
	})

	it('does not treat an archived project as completed', () => {
		expect(matchesProjectStatus(archived, 'completed')).toBe(false)
		expect(matchesProjectStatus(archived, 'active')).toBe(false)
	})

	it('treats a project without a completion field as not completed', () => {
		expect(matchesProjectStatus(legacy, 'active')).toBe(true)
		expect(matchesProjectStatus(legacy, 'completed')).toBe(false)
	})
})

describe('countProjectsByStatus', () => {
	it('counts overlapping states once per filter and skips pseudo projects', () => {
		expect(countProjectsByStatus([
			active,
			completed,
			archived,
			completedAndArchived,
			legacy,
			savedFilter,
		])).toEqual({
			active: 2,
			completed: 2,
			archived: 2,
			all: 5,
		})
	})
})

describe('parseProjectStatusFilter', () => {
	it('accepts only known filters', () => {
		expect(parseProjectStatusFilter('archived')).toBe('archived')
		expect(parseProjectStatusFilter('done')).toBeNull()
		expect(parseProjectStatusFilter(undefined)).toBeNull()
	})
})

describe('resolveStoredProjectStatus', () => {
	it('keeps a valid stored status regardless of the legacy checkbox', () => {
		expect(resolveStoredProjectStatus('completed', 'true')).toBe('completed')
		expect(resolveStoredProjectStatus('active', 'true')).toBe('active')
	})

	it('migrates a checked legacy "Show archived" box to all projects', () => {
		expect(resolveStoredProjectStatus(null, 'true')).toBe('all')
		expect(resolveStoredProjectStatus(null, true)).toBe('all')
	})

	it('falls back to active projects without a usable choice', () => {
		expect(resolveStoredProjectStatus(null, null)).toBe('active')
		expect(resolveStoredProjectStatus(null, 'false')).toBe('active')
		expect(resolveStoredProjectStatus('done', 'false')).toBe('active')
	})

	it('ignores an invalid stored value in favour of the legacy choice', () => {
		expect(resolveStoredProjectStatus('done', 'true')).toBe('all')
	})
})

describe('matchesProjectSearch', () => {
	const project = {
		title: 'Garden plan',
		identifier: 'GRDN',
		description: '<p>Spring <strong>seeds</strong></p>',
	}

	it('matches title, identifier and description text case-insensitively', () => {
		expect(matchesProjectSearch(project, 'garden')).toBe(true)
		expect(matchesProjectSearch(project, 'grdn')).toBe(true)
		expect(matchesProjectSearch(project, 'seeds')).toBe(true)
		expect(matchesProjectSearch(project, '  ')).toBe(true)
	})

	it('does not match markup', () => {
		expect(matchesProjectSearch(project, 'strong')).toBe(false)
	})
})

describe('splitProjectList', () => {
	const base = {
		identifier: '',
		description: '',
	}
	const items = [
		{
			...base,
			...active,
			title: 'Garden',
		},
		{
			...base,
			...completed,
			title: 'Taxes 2025',
		},
		{
			...base,
			...archived,
			title: 'Old garden shed',
		},
		{
			...base,
			id: -1,
			is_archived: false,
			title: 'Favorites',
		},
		{
			...base,
			...savedFilter,
			title: 'Garden chores due',
		},
		{
			...base,
			id: -3,
			is_archived: true,
			title: 'Archived filter',
		},
	]
	const titles = (list: {title: string}[]) => list.map(project => project.title)

	it('filters real projects by status and keeps pseudo projects apart', () => {
		const sections = splitProjectList(items, 'active', '')
		expect(titles(sections.projects)).toEqual(['Garden'])
		expect(titles(sections.others)).toEqual([
			'Favorites',
			'Garden chores due',
		])
		expect(titles(splitProjectList(items, 'all', '').others)).toEqual([
			'Favorites',
			'Garden chores due',
			'Archived filter',
		])
	})

	it('hides pseudo projects for completed and archived filters', () => {
		expect(titles(splitProjectList(items, 'completed', '').projects)).toEqual(['Taxes 2025'])
		expect(splitProjectList(items, 'completed', '').others).toEqual([])
		expect(titles(splitProjectList(items, 'archived', '').projects)).toEqual(['Old garden shed'])
		expect(splitProjectList(items, 'archived', '').others).toEqual([])
	})

	it('applies the search to both sections', () => {
		const sections = splitProjectList(items, 'all', 'garden')
		expect(titles(sections.projects)).toEqual([
			'Garden',
			'Old garden shed',
		])
		expect(titles(sections.others)).toEqual(['Garden chores due'])
	})

	it('matches the translated display title as well as the stored one', () => {
		const sections = splitProjectList(items, 'active', '收藏', project =>
			project.id === -1 ? '收藏' : project.title)
		expect(titles(sections.others)).toEqual(['Favorites'])
		expect(titles(splitProjectList(items, 'active', 'favorites').others)).toEqual(['Favorites'])
	})
})
