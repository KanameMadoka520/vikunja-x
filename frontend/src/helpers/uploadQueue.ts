import {assertClientRequestContext, captureClientRequestContext, isRequestContextAbort} from '@/client/requestContext'

/** Keep one identity for the entire selection, including time spent in image dialogs. */
export async function runUploadQueue<T>(
	files: File[],
	signal: AbortSignal,
	upload: (file: File, signal: AbortSignal) => Promise<T>,
	onUploaded: (result: T) => void,
) {
	const context = captureClientRequestContext()
	for (const file of files) {
		try {
			if (signal.aborted) return
			assertClientRequestContext(context)
			const result = await upload(file, signal)
			if (signal.aborted) return
			assertClientRequestContext(context)
			onUploaded(result)
		} catch (cause) {
			if (signal.aborted || isRequestContextAbort(cause)) return
			// The mutation reports individual failures; unrelated files may still succeed.
		}
	}
}
