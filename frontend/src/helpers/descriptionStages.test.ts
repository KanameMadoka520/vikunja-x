// @vitest-environment jsdom
import {describe, it, expect} from 'vitest'
import {descriptionStages, setDescriptionCheckbox, stageTemplate} from './descriptionStages'
describe('description stages', () => {
 it('groups 100 checklist items without creating tasks or losing notes, links or attachment references', () => {
  const items = (offset: number) => Array.from({length: 50}, (_, i) => `<li data-type="taskItem" data-task-id="id-${offset + i}" data-checked="false"><p><a href="https://example.com/${offset + i}">Video ${offset + i}</a></p></li>`).join('')
  const html = `<p>Keep my notes</p><img src="/api/v2/tasks/1/attachments/2"><h2>Basics</h2><ul data-type="taskList">${items(0)}</ul><h2>Advanced</h2><ul data-type="taskList">${items(50)}</ul>`
  const changed = setDescriptionCheckbox(html, 62, true)
  const groups = descriptionStages(changed)
  expect(groups.map(g => g.items.length)).toEqual([50, 50])
  expect(groups[1].checked).toBe(1)
  expect(groups[1].items[12].checked).toBe(true)
  expect(changed).toContain('Keep my notes')
  expect(changed).toContain('/api/v2/tasks/1/attachments/2')
  expect(changed).toContain('data-task-id="id-62"')
  expect(groups[1].items[12].html).toContain('https://example.com/62')
  expect(descriptionStages(setDescriptionCheckbox(changed, 62, false))[1].checked).toBe(0)
 })
 it('keeps nested item identity and sanitizes displayed HTML', () => {
  const groups = descriptionStages('<h2>A</h2><h3>B</h3><ul><li data-type="taskItem"><p>Same<script>bad()</script></p><ul><li data-type="taskItem" data-checked="true"><p>Same<img src=x onerror="bad()"></p></li></ul></li></ul>')
  expect(groups[0].title).toBe('A / B')
  expect(groups[0].items.map(i => i.depth)).toEqual([0, 1])
  expect(groups[0].items[0].html).not.toContain('script')
  expect(groups[0].items[1].html).not.toContain('onerror')
  expect(groups[0].checked).toBe(1)
 })
 it('escapes template text and assigns persistent unique checkbox IDs', () => {
  const html = stageTemplate(() => '<unsafe>')
  expect(html).toContain('&lt;unsafe&gt;')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  expect(new Set([...doc.querySelectorAll('li')].map(li => li.getAttribute('data-task-id'))).size).toBe(4)
  expect(descriptionStages(html)).toHaveLength(2)
 })
})
