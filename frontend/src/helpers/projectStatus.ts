import type {ProjectResponse} from '@/client/queries/projects'

// Completion and archive are independent flags: a project can be both, so the
// filters overlap on purpose and "all" is not the sum of the other three.
export const PROJECT_STATUS_FILTERS = ['active', 'completed', 'archived', 'all'] as const
export type ProjectStatusFilter = typeof PROJECT_STATUS_FILTERS[number]

type StatusFields = Pick<ProjectResponse, 'id' | 'is_archived'> & {is_completed?: boolean}
type SearchFields = Pick<ProjectResponse, 'title' | 'identifier' | 'description'>

export function isRealProject(project: Pick<ProjectResponse, 'id'>): boolean {
	return project.id > 0
}

export function isProjectActive(project: StatusFields): boolean {
	return !project.is_archived && !project.is_completed
}

export function matchesProjectStatus(project: StatusFields, filter: ProjectStatusFilter): boolean {
	switch (filter) {
		case 'active':
			return isProjectActive(project)
		case 'completed':
			return Boolean(project.is_completed)
		case 'archived':
			return project.is_archived
		case 'all':
			return true
	}
}

export function countProjectsByStatus(projects: StatusFields[]): Record<ProjectStatusFilter, number> {
	const counts: Record<ProjectStatusFilter, number> = {
		active: 0,
		completed: 0,
		archived: 0,
		all: 0,
	}
	for (const project of projects) {
		if (!isRealProject(project)) continue
		counts.all++
		if (isProjectActive(project)) counts.active++
		if (project.is_completed) counts.completed++
		if (project.is_archived) counts.archived++
	}
	return counts
}

export function parseProjectStatusFilter(value: unknown): ProjectStatusFilter | null {
	return PROJECT_STATUS_FILTERS.find(filter => filter === value) ?? null
}

export const PROJECT_LIST_STATUS_STORAGE_KEY = 'projectListStatus'
export const LEGACY_SHOW_ARCHIVED_STORAGE_KEY = 'showArchived'

// The list page used to persist a "Show archived" checkbox (useStorage writes
// booleans as 'true'/'false'). Until a status is chosen, someone who had it on
// keeps seeing everything instead of silently losing their archived projects.
export function resolveStoredProjectStatus(
	stored: unknown,
	legacyShowArchived: unknown,
): ProjectStatusFilter {
	const parsed = parseProjectStatusFilter(stored)
	if (parsed !== null) return parsed
	return legacyShowArchived === 'true' || legacyShowArchived === true ? 'all' : 'active'
}

function plainText(html: string): string {
	return html.replace(/<[^>]*>/g, ' ')
}

export function matchesProjectSearch(project: SearchFields, query: string): boolean {
	const needle = query.trim().toLocaleLowerCase()
	if (needle === '') return true
	return [project.title, project.identifier, plainText(project.description ?? '')]
		.some(field => (field ?? '').toLocaleLowerCase().includes(needle))
}

export interface ProjectListSections<P> {
	projects: P[]
	others: P[]
}

// Saved filters and the Favorites pseudo project have no lifecycle, so they
// live in their own section and only appear next to active or all projects.
export function splitProjectList<P extends StatusFields & SearchFields>(
	items: readonly P[],
	status: ProjectStatusFilter,
	query: string,
	displayTitle: (project: P) => string = project => project.title,
): ProjectListSections<P> {
	const matchesQuery = (project: P) => matchesProjectSearch(project, query)
		|| matchesProjectSearch({
			...project,
			title: displayTitle(project),
		}, query)
	const showOthers = status === 'active' || status === 'all'

	return {
		projects: items.filter(project =>
			isRealProject(project)
			&& matchesProjectStatus(project, status)
			&& matchesQuery(project),
		),
		others: showOthers
			? items.filter(project =>
				!isRealProject(project)
				&& matchesProjectStatus(project, status)
				&& matchesQuery(project),
			)
			: [],
	}
}
