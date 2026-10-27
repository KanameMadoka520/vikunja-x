import {describe, expect, it} from 'vitest'
import {createScreenshotPreview} from './screenshotPreview'

const labels = {project: 'Example project', task: 'Example task', person: 'Example user', content: 'Sample content', image: 'Placeholder'}
describe('screenshot snapshot isolation', () => {
 it('removes personal values and media from only the detached copy', () => {
  const source = document.createElement('div')
  source.innerHTML = '<span class="project-title">private project</span><span class="tasktext">Home</span><button>Save</button><input value="secret@example.com"><textarea>draft secret</textarea><img src="https://private.example/image.png" title="secret"><div style="background-image:url(https://private.example/cover.jpg)">private notes</div><iframe src="about:blank"></iframe>'
  document.body.append(source)
  const original = source.innerHTML
  const copy = createScreenshotPreview(source, labels)
  expect(source.innerHTML).toBe(original)
  expect(copy.textContent).not.toContain('private')
  expect(copy.querySelector('.tasktext')?.textContent).toBe('Example task')
  expect(copy.querySelector('button')?.textContent).toBe('Save')
  expect(copy.querySelector('input')?.value).toBe('')
  expect(copy.querySelector('textarea')?.value).toBe('Sample content')
  expect(copy.querySelector('img')?.src).toContain('data:image/svg+xml')
  expect(copy.querySelector('iframe')).toBeNull()
  expect(copy.innerHTML).not.toContain('secret')
  expect(copy.innerHTML).not.toContain('private.example')
  source.remove()
 })
})
