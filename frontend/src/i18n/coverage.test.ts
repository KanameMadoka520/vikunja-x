import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
	return Object.fromEntries(Object.entries(value).flatMap(([key, v]) => {
		const path = prefix + key
		return typeof v === 'string' ? [[path, v]] : Object.entries(flatten(v as Record<string, unknown>, path + '.'))
	}))
}
function load(path: string) {
	return flatten(JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')))
}

describe.each([
	['frontend', './lang/'],
	['backend', '../../../pkg/i18n/lang/'],
])('%s bilingual coverage', (_, directory) => {
	const en = load(directory + 'en.json')
	const zh = load(directory + 'zh-CN.json')
	it('has exactly the same nonempty English and Simplified Chinese entries', () => {
		expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
		for (const key of Object.keys(en)) {
			expect(en[key].trim(), key).not.toBe('')
			expect(zh[key].trim(), key).not.toBe('')
		}
	})
	it('preserves named interpolation and printf parameters', () => {
		const parameters = (s: string) => [...new Set(s.match(/(?<!\{)\{[a-zA-Z_][\w.]*\}(?!\})|%(?:\[\d+\])?[sdvfg]/g) ?? [])].sort()
		for (const key of Object.keys(en)) expect(parameters(zh[key]), key).toEqual(parameters(en[key]))
	})
})
