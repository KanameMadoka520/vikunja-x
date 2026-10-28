import {describe, it, expect} from 'vitest'
import {markdownPDF} from './pdf'
import {chatBytes} from './files'
describe('portable chat exports', () => {
 it('preserves headings, code and tables as selectable PDF content', () => {
  const content = markdownPDF('# 标题\n\n```js\nconst x = 1\n```\n\n| 姓名 | 状态 |\n|---|---|\n| 测试 | 完成 |')
  expect(content).toEqual(expect.arrayContaining([expect.objectContaining({text: [expect.objectContaining({text: '标题'})], bold: true}), expect.objectContaining({text: 'const x = 1'})]))
  expect(content.some(part => typeof part === 'object' && part && 'table' in part)).toBe(true)
 })
 it('does not turn arbitrary Markdown URLs into image fetches', () => {
  const text = JSON.stringify(markdownPDF('![private](https://tracking.example/pixel)\n\n<script>alert(1)</script>'))
  expect(text).not.toContain('"image":')
  expect(text).not.toContain('"link":')
 })
 it('formats actual byte sizes rather than estimating from text length', () => {
  expect(chatBytes(0)).toBe('0 B'); expect(chatBytes(1536)).toBe('1.5 KiB')
 })
})
