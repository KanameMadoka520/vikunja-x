import {afterEach, describe, expect, it} from 'vitest'
import {chooseImageUpload, clearUploads, convertImage, imagePrompt} from './uploadTransport'

afterEach(() => clearUploads())
describe('image upload choices', () => {
  it('retains the exact original File when original was selected', async () => {
    const file = new File(['original bytes'], 'example.png', {type: 'image/png'})
    expect(await convertImage(file, {mode: 'original', quality: .85, maxSide: 2560})).toBe(file)
  })
  it('preserves animation and scriptable image formats rather than silently flattening them', async () => {
    for (const type of ['image/gif', 'image/svg+xml', 'image/tiff']) {
      const file = new File(['fixture'], 'image', {type})
      expect(await convertImage(file, {mode: 'webp', quality: .85, maxSide: 2560})).toBe(file)
    }
  })
  it('discards queued files when the account changes', async () => {
    const signal = new AbortController().signal
    const first = chooseImageUpload([new File([], 'private.png')], signal)
    const second = chooseImageUpload([new File([], 'queued-private.png')], signal)
    await Promise.resolve()
    clearUploads()
    expect(await first).toBeNull()
    expect(await second).toBeNull()
    expect(imagePrompt.value).toBeNull()
  })
  it('serializes concurrent choices and allows cancellation before any upload', async () => {
    const a = new AbortController(), b = new AbortController()
    const first = chooseImageUpload([new File([], 'first.png')], a.signal)
    const second = chooseImageUpload([new File([], 'second.png')], b.signal)
    await Promise.resolve()
    expect(imagePrompt.value?.files[0].name).toBe('first.png')
    imagePrompt.value!.resolve({mode: 'original', quality: .85, maxSide: 2560})
    expect((await first)?.mode).toBe('original')
    await Promise.resolve()
    expect(imagePrompt.value?.files[0].name).toBe('second.png')
    b.abort()
    expect(await second).toBeNull()
    expect(imagePrompt.value).toBeNull()
  })
})
