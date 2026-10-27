import {describe, it, expect} from 'vitest'
import {removeAttachmentImages} from './attachmentImages'

describe('inline attachment cleanup', () => {
 it('preserves text, links, other attachments and external images', () => {
  window.API_URL = 'https://task.test'
  const keep = '<p>notes</p><a href="/api/v2/tasks/7/attachments/5">download</a><img src="https://external.test/api/v2/tasks/7/attachments/5"><img src="/api/v2/tasks/7/attachments/50">'
  expect(removeAttachmentImages(keep + '<img data-src="https://task.test/api/v2/tasks/7/attachments/5" src="#">', 7, [5])).toBe(keep)
  expect(removeAttachmentImages(keep, 7, [5])).toBe(keep)
 })
 it('supports mounted base paths and version one links', () => {
  window.API_URL = 'https://task.test/sub/api/v2'
  expect(removeAttachmentImages('<img src="https://task.test/sub/api/v1/tasks/7/attachments/5/preview?size=medium">', 7, [5])).toBe('')
 })
})
