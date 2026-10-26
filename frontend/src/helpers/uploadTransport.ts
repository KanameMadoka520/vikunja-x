import {assertClientRequestContext, captureClientRequestContext} from '@/client/requestContext'
import {ref, shallowRef} from 'vue'
import {i18n} from '@/i18n'

export type UploadRecord = {id: string; names: string; stage: 'preparing' | 'converting' | 'uploading' | 'processing' | 'done' | 'error' | 'cancelled'; loaded: number; total: number; error?: string; originalBytes: number; sentBytes: number}
export type ImageChoice = {mode: 'original' | 'webp'; quality: number; maxSide: number}
export const uploads = shallowRef<UploadRecord[]>([])
export const imagePrompt = shallowRef<{files: File[]; resolve: (choice: ImageChoice | null) => void} | null>(null)
export const uploadsExpanded = ref(true)
const activeRequests = new Set<() => void>()
let uploadEpoch = 0
export function clearUploads() { uploadEpoch++; imagePrompt.value?.resolve(null); for (const cancel of activeRequests) cancel(); uploads.value=[] }
let queue = Promise.resolve()
const {t} = i18n.global

export function chooseImageUpload(files: File[], signal: AbortSignal): Promise<ImageChoice | null> {
	const epoch = uploadEpoch
	const ready = queue.then(() => {
		if (signal.aborted || epoch !== uploadEpoch) return null
		return new Promise<ImageChoice | null>(resolve => {
			let settled = false
			const finish = (choice: ImageChoice | null) => {
				if (settled) return
				settled = true
				signal.removeEventListener('abort', abort)
				imagePrompt.value = null
				resolve(choice)
			}
			const abort = () => finish(null)
			signal.addEventListener('abort', abort, {once: true})
			imagePrompt.value = {files, resolve: finish}
		})
	})
	queue = ready.then(() => undefined)
	return ready
}

export async function convertImage(file: File, choice: ImageChoice): Promise<File> {
	if (choice.mode === 'original' || !/^image\/(png|jpe?g|webp|bmp)$/i.test(file.type)) return file
	const source = await createImageBitmap(file)
	try {
		const scale = choice.maxSide ? Math.min(1, choice.maxSide / Math.max(source.width, source.height)) : 1
		const canvas = document.createElement('canvas')
		canvas.width = Math.max(1, Math.round(source.width * scale))
		canvas.height = Math.max(1, Math.round(source.height * scale))
		const context = canvas.getContext('2d')
		if (!context) throw new Error(t('flow.imageFailed'))
		context.drawImage(source, 0, 0, canvas.width, canvas.height)
		const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', choice.quality))
		if (!blob || blob.type !== 'image/webp') throw new Error(t('flow.imageFailed'))
		return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.webp', {type: blob.type})
	} finally { source.close() }
}

function update(id: string, patch: Partial<UploadRecord>) {
	uploads.value = uploads.value.map(row => row.id === id ? {...row, ...patch} : row)
}

/** SDK transport: auth, context fences and normalized API errors remain in the generated client's interceptors. */
export const uploadAwareFetch: typeof fetch = async (input, init) => {
	const request = input instanceof Request && !init ? input : new Request(input, init)
	if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data')) return globalThis.fetch(request)
	const context = captureClientRequestContext()
	const form = await request.clone().formData()
	const files = Array.from(form.values()).filter((item): item is File => item instanceof File)
	const images = files.filter(file => file.type.startsWith('image/'))
	const id = crypto.randomUUID()
	uploads.value = [{id, names: files.map(file => file.name).join(', '), stage: 'preparing' as const, loaded: 0, total: 0, originalBytes: files.reduce((sum, f) => sum + f.size, 0), sentBytes: 0}, ...uploads.value].slice(0, 12)
	let mode: ImageChoice['mode'] | undefined
	try {
		let body = form
		if (images.length) {
			const choice = await chooseImageUpload(images, request.signal)
			if (!choice) throw new DOMException('Upload cancelled', 'AbortError')
			mode = choice.mode
			update(id, {stage: 'converting'})
			body = new FormData()
			for (const [key, value] of form) {
				if (request.signal.aborted) throw new DOMException('Upload cancelled', 'AbortError')
				body.append(key, value instanceof File ? await convertImage(value, choice) : value)
				// Let the preparing indicator paint between files.
				await new Promise(resolve => requestAnimationFrame(resolve))
			}
		}
		assertClientRequestContext(context)
		const sentBytes = Array.from(body.values()).reduce((sum, value) => sum + (value instanceof File ? value.size : 0), 0)
		update(id, {stage: 'uploading', sentBytes})
		const response = await new Promise<Response>((resolve, reject) => {
			const xhr = new XMLHttpRequest()
			xhr.open(request.method, request.url)
			xhr.withCredentials = request.credentials === 'include'
			xhr.responseType = 'arraybuffer'
			for (const [key, value] of request.headers) if (key.toLowerCase() !== 'content-type') xhr.setRequestHeader(key, value)
			if (mode) xhr.setRequestHeader('X-Vikunja-Image-Mode', mode)
			const abort = () => xhr.abort()
			request.signal.addEventListener('abort', abort, {once: true})
			activeRequests.add(abort)
			const cleanup = () => { request.signal.removeEventListener('abort', abort); activeRequests.delete(abort) }
			xhr.upload.onprogress = event => update(id, {loaded: event.loaded, total: event.lengthComputable ? event.total : 0, stage: event.lengthComputable && event.loaded >= event.total ? 'processing' : 'uploading'})
			xhr.upload.onload = () => update(id, {stage: 'processing'})
			xhr.onerror = () => { cleanup(); reject(new TypeError(t('flow.networkError'))) }
			xhr.onabort = () => { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')) }
			xhr.onload = () => {
				cleanup()
				const headers = new Headers()
				for (const line of xhr.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
					const index = line.indexOf(':')
					if (index > 0) headers.append(line.slice(0, index), line.slice(index + 1).trim())
				}
				update(id, {stage: xhr.status >= 200 && xhr.status < 300 ? 'done' : 'error'})
				resolve(new Response(xhr.status === 204 ? null : xhr.response, {status: xhr.status, statusText: xhr.statusText, headers}))
			}
			if (request.signal.aborted) { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')); return }
			xhr.send(body)
		})
		return response
	} catch (error) {
		update(id, {stage: error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'error', error: error instanceof Error ? error.message : String(error)})
		throw error
	}
}
