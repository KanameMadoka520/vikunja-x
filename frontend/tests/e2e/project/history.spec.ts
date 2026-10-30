import {test, expect} from '../../support/fixtures'
import {createProjects} from './prepareProjects'
import {apiRootUrl} from '../../support/apiUrl'
import {Factory} from '../../support/factory'
import {TaskFactory} from '../../factories/task'

const api = `${apiRootUrl(process.env.API_URL || 'http://localhost:3456')}/api/v2`

test('project completion, reopening and archiving retain yearly history without changing tasks', async ({authenticatedPage: page, userToken}, testInfo) => {
 const [project] = await createProjects()
 await TaskFactory.create(1, {id: 1, project_id: project.id, title: 'Keep this task open', done: false})
 const headers = {Authorization: `Bearer ${userToken}`}
 await page.goto(`/projects/${project.id}`)
 await page.locator('.project-title-dropdown .project-title-button').click()
 await page.getByRole('button', {name: 'Mark project complete', exact: true}).click()
 await expect(page.getByRole('dialog')).toContainText('Tasks and child projects stay as they are')
 await page.getByRole('dialog').getByRole('button', {name: 'Do it!', exact: true}).click()
 await expect(page.locator('.completion-notice')).toContainText('Currently complete')
 const task = await page.request.get(`${api}/tasks/1`, {headers})
 expect((await task.json()).done).toBe(false)
 // Retrying the same completion must not add a second milestone.
 expect((await page.request.post(`${api}/projects/${project.id}/completion`, {headers, data: {completed: true}})).ok()).toBe(true)
 await page.locator('.completion-notice a').click()
 await expect(page.locator('.history-records li')).toHaveCount(1)
 await expect(page.locator('.history-records')).toContainText('First Project')
 await page.screenshot({path: testInfo.outputPath('history-desktop.png'), fullPage: true, animations: 'disabled'})
 const activeDay = page.locator('.year-grid button:not([data-level="0"])').first()
 await activeDay.click()
 await expect(page).toHaveURL(/day=/)
 await expect(page.locator('.history-records li')).toHaveCount(1)
 await page.getByRole('button', {name: 'Show whole year'}).click()
 const reopened = await page.request.post(`${api}/projects/${project.id}/completion`, {headers, data: {completed: false}})
 expect(reopened.ok()).toBe(true)
 const original = await (await page.request.get(`${api}/projects/${project.id}`, {headers})).json()
 expect((await page.request.put(`${api}/projects/${project.id}`, {headers, data: {...original, is_archived: true}})).ok()).toBe(true)
 await page.reload()
 await expect(page.locator('.history-records li')).toHaveCount(2)
 await page.getByLabel('Record type', {exact: true}).selectOption('all')
 await expect(page.locator('.history-records li')).toHaveCount(3)
 await expect(page.locator('.history-records')).toContainText('Reopened')
 await page.getByLabel('Search projects', {exact: true}).fill('no such project')
 await expect(page.getByText('No project records in this range')).toBeVisible()
 await page.getByLabel('Search projects', {exact: true}).fill('First')
 await expect(page.locator('.history-records li')).toHaveCount(3)
 await page.getByRole('button', {name: 'Previous year', exact: true}).click()
 await expect(page.locator('.history-records li')).toHaveCount(0)
})

for (const width of [390, 320]) {
 test(`project review calendar is usable at ${width}px`, async ({authenticatedPage: page, userToken}, testInfo) => {
  const [project] = await createProjects()
  await page.request.post(`${api}/projects/${project.id}/completion`, {headers: {Authorization: `Bearer ${userToken}`}, data: {completed: true}})
  await page.setViewportSize({width, height: 844})
  await page.goto('/projects/history')
  await expect(page.locator('.month-grid')).toBeVisible()
  await expect(page.locator('.mini-month:visible')).toHaveCount(1)
  await expect(page.locator('.month-picker button')).toHaveCount(12)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const day = page.locator('.mini-month:visible .month-days button:not([data-level="0"])').first()
  await day.click()
  await expect(page.locator('.history-records li')).toHaveCount(1)
  await page.screenshot({path: testInfo.outputPath(`history-${width}.png`), fullPage: true, animations: 'disabled'})
 })
}

test('project history API enforces parameters and project ownership', async ({authenticatedPage: page, userToken}) => {
 await createProjects()
 const headers = {Authorization: `Bearer ${userToken}`}
 const year = new Date().getFullYear()
 expect((await page.request.get(`${api}/projects/history?year=${year}&timezone=bad`, {headers})).status()).toBe(422)
 expect((await page.request.get(`${api}/projects/history?year=${year}&day=2024-02-30`, {headers})).status()).toBe(422)
 expect((await page.request.get(`${api}/projects/history?year=${year}`)).status()).toBe(401)
 expect((await page.request.post(`${api}/projects/999999/completion`, {headers, data: {completed: true}})).status()).toBe(404)
})


test('legacy archives remain discoverable without inventing a completion date', async ({authenticatedPage: page}) => {
 const [project] = await createProjects()
 await Factory.seed('project_lifecycle_events', [{id: 1, project_id: project.id, kind: 'archived', occurred_at: null}])
 await page.goto('/projects/history?year=2024')
 await expect(page.locator('.year-grid button')).toHaveCount(366)
 await expect(page.locator('.history-records li')).toHaveCount(0)
 await page.getByRole('button', {name: 'Unknown date · 1'}).click()
 await expect(page.locator('.history-records li')).toHaveCount(1)
 await expect(page.locator('.history-records')).toContainText('First Project')
 await expect(page.locator('.history-records')).toContainText('Unknown date')
 await expect(page.locator('.year-grid button:not([data-level="0"])')).toHaveCount(0)
})
