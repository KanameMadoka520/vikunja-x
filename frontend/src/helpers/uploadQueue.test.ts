import {beforeEach, describe, expect, it, vi} from 'vitest'
import {runUploadQueue} from './uploadQueue'
const auth = vi.hoisted(() => ({epoch: 0}))
vi.mock('@/client/requestContext', () => ({
	captureClientRequestContext: () => auth.epoch,
	assertClientRequestContext: (epoch: number) => {if (epoch !== auth.epoch) throw new DOMException('Account changed', 'AbortError')},
	isRequestContextAbort: (e: Error) => e.name === 'AbortError',
}))
beforeEach(() => {auth.epoch = 0})
const files = () => [new File(['a'], 'a.png'), new File(['b'], 'b.txt')]
describe('upload selection', () => {
	it('never starts a queued file under a different account', async () => {
		const upload = vi.fn(async () => {auth.epoch++})
		const reveal = vi.fn()
		await runUploadQueue(files(), new AbortController().signal, upload, reveal)
		expect(upload).toHaveBeenCalledTimes(1)
		expect(reveal).not.toHaveBeenCalled()
	})
	it('cancels the remaining selection when the image dialog is cancelled', async () => {
		const upload = vi.fn(async () => {throw new DOMException('Cancelled', 'AbortError')})
		await runUploadQueue(files(), new AbortController().signal, upload, vi.fn())
		expect(upload).toHaveBeenCalledTimes(1)
	})
	it('stops after unmount and never updates the disposed view', async () => {
		const controller = new AbortController(), reveal = vi.fn()
		const upload = vi.fn(async () => {controller.abort()})
		await runUploadQueue(files(), controller.signal, upload, reveal)
		expect(upload).toHaveBeenCalledTimes(1)
		expect(reveal).not.toHaveBeenCalled()
	})
	it('continues after an individual failure and reveals only successful files', async () => {
		const upload = vi.fn().mockRejectedValueOnce(new Error('Too large')).mockResolvedValueOnce({})
		const reveal = vi.fn()
		await runUploadQueue(files(), new AbortController().signal, upload, reveal)
		expect(upload).toHaveBeenCalledTimes(2)
		expect(reveal).toHaveBeenCalledTimes(1)
	})
})
