import {getApiRootUrl} from '@/helpers/apiUrl'

export function removeAttachmentImages(source: string, taskId: number, ids: readonly number[]): string {
	if (!source || !ids.length || !source.includes('attachments/')) return source
	const document = new DOMParser().parseFromString(source, 'text/html')
	const base = new URL(getApiRootUrl() || '/', window.location.origin)
	let changed = false
	for (const image of document.querySelectorAll('img')) {
		try {
			const url = new URL(image.getAttribute('data-src') || image.getAttribute('src') || '', base)
			if (url.origin !== base.origin) continue
			const prefix = base.pathname.replace(/\/$/, '')
			const path = prefix && url.pathname.startsWith(prefix + '/') ? url.pathname.slice(prefix.length) : url.pathname
			const match = /^(?:\/api\/v[12])?\/tasks\/(\d+)\/attachments\/(\d+)(?:\/preview)?\/?$/.exec(path)
			if (match && Number(match[1]) === taskId && ids.includes(Number(match[2]))) {image.remove(); changed = true}
		} catch { /* External and malformed links are not attachment references. */ }
	}
	return changed ? document.body.innerHTML : source
}
