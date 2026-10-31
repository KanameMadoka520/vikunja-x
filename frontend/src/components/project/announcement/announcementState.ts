import type {ProjectAnnouncementResponse} from '@/client/queries/projectAnnouncements'
import {PERMISSIONS} from '@/constants/permissions'
import {isAnnouncementContentEmpty} from '@/helpers/sanitizeAnnouncement'

// Title-only notices count: only an empty title and empty readable content mean "no announcement".
export function isAnnouncementEmpty(title: string, content: string): boolean {
	return title.trim() === '' && isAnnouncementContentEmpty(content)
}

// Archived projects are read-only (the server answers 412), so they never offer editing.
export function canEditAnnouncement(announcement: ProjectAnnouncementResponse | null, archived: boolean): boolean {
	return announcement !== null &&
		announcement.project_id > 0 &&
		announcement.max_permission >= PERMISSIONS.READ_WRITE &&
		!archived
}
