import {describe, expect, it} from 'vitest'
import {encodeWav, audioChatFile} from './tcyAudio'

describe('browser recordings for OpenAI Chat Audio', () => {
	it('writes a mono 16-bit PCM WAV with clipped samples and correct sizes', async () => {
		const blob = encodeWav(new Float32Array([-2, -1, 0, .5, 1, 2]), 16000)
		const data = new DataView(await blob.arrayBuffer())
		expect(blob.type).toBe('audio/wav')
		expect(new TextDecoder().decode(new Uint8Array(data.buffer, 0, 4))).toBe('RIFF')
		expect(new TextDecoder().decode(new Uint8Array(data.buffer, 8, 4))).toBe('WAVE')
		expect(data.getUint32(4, true)).toBe(48)
		expect(data.getUint32(40, true)).toBe(12)
		expect(data.getUint16(20, true)).toBe(1)
		expect(data.getUint16(22, true)).toBe(1)
		expect(data.getUint32(24, true)).toBe(16000)
		expect([0, 1, 2, 3, 4, 5].map(i => data.getInt16(44 + 2 * i, true))).toEqual([-32768, -32768, 0, 16383, 32767, 32767])
	})
	it('preserves already supported audio without trying to decode it', async () => {
		const file = new Blob(['mp3 data'], {type: 'audio/mpeg'})
		expect(await audioChatFile(file, 'voice.MP3')).toEqual({file, filename: 'voice.MP3'})
	})
})
