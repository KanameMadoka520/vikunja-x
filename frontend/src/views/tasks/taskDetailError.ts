import {isRequestContextAbort} from '@/client/requestContext'
import {TaskDeletedError} from '@/client/queries/taskCache'

export type TaskLoadErrorAction = 'ignore' | 'deleted' | 'notFound' | 'report'

export function taskLoadErrorAction(cause: unknown): TaskLoadErrorAction {
	if (isRequestContextAbort(cause)) return 'ignore'
	// Checked before the status: it is shaped like the API's 404 so other readers treat it as missing.
	if (cause instanceof TaskDeletedError) return 'deleted'
	if ([403, 404].includes((cause as {status?: number} | null)?.status ?? 0)) return 'notFound'
	return 'report'
}
