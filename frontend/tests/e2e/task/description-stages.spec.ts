import {test, expect} from '../../support/fixtures'
import {createProjects} from '../project/prepareProjects'
import {TaskFactory} from '../../factories/task'

for (const width of [1440, 390]) {
 test(`100 description steps stay grouped and persist at ${width}px`, async ({authenticatedPage: page, apiContext, userToken}, testInfo) => {
  await createProjects(1)
  const items = (offset: number) => Array.from({length: 50}, (_, i) => `<li data-type="taskItem" data-task-id="step-${offset + i}" data-checked="false"><p><a href="https://example.com/video/${offset + i}">Video ${offset + i}</a></p></li>`).join('')
  await TaskFactory.create(1, {title: 'Watch this channel', description: `<p>Keep my notes</p><h2>Basics</h2><ul data-type="taskList">${items(0)}</ul><h2>Advanced</h2><ul data-type="taskList">${items(50)}</ul>`})
  await page.setViewportSize({width, height: 900})
  await page.goto('/tasks/1')
  const stages = page.getByRole('region', {name: 'Grouped checklist', exact: true})
  await expect(stages).toContainText('0 of 100 steps complete')
  await expect(stages.locator('details')).toHaveCount(2)
  await expect(stages.getByRole('link', {name: 'Video 62', exact: true})).not.toBeVisible()
  await stages.locator('summary').filter({hasText: 'Advanced'}).click()
  await stages.getByLabel('Toggle step 63', {exact: true}).check()
  const read = async () => (await apiContext.get('/api/v2/tasks/1', {headers: {Authorization: `Bearer ${userToken}`}})).json()
  await expect.poll(async () => /data-checked="true"/.test((await read()).description.match(/<li[^>]*data-task-id="step-62"[^>]*>/)?.[0] || '')).toBe(true)
  await expect(stages).toContainText('1 of 100 steps complete')
  await page.screenshot({path: testInfo.outputPath('description-stages.png')})
  await page.reload()
  await stages.locator('summary').filter({hasText: 'Advanced'}).click()
  await expect(stages.getByLabel('Toggle step 63', {exact: true})).toBeChecked()
  await stages.getByLabel('Toggle step 63', {exact: true}).uncheck()
  await expect.poll(async () => /data-checked="false"/.test((await read()).description.match(/<li[^>]*data-task-id="step-62"[^>]*>/)?.[0] || '')).toBe(true)
  await page.getByRole('button', {name: 'Full description', exact: true}).click()
  await expect(page.locator('.tiptap__task-description')).toContainText('Keep my notes')
  const task = await read()
  expect(task.done).toBe(false)
  expect(task.related_tasks?.subtask?.length || 0).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
 })
}
