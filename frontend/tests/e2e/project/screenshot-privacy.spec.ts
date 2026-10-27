import {test, expect} from '../../support/fixtures'
import {createProjects} from './prepareProjects'
import {TaskFactory} from '../../factories/task'
import {apiRootUrl} from '../../support/apiUrl'

for (const width of [1440, 390]) {
 test(`screenshot privacy restores live UI without writing data at ${width}px`, async ({authenticatedPage: page, apiContext}, testInfo) => {
  await createProjects(1)
  await TaskFactory.create(1, {title: 'CONFIDENTIAL_MEETING_SECRET', description: 'CONFIDENTIAL_DESCRIPTION'})
  await page.setViewportSize({width, height: 900})
  await page.goto('/projects/1')
  await expect(page.locator('.tasktext')).toContainText('CONFIDENTIAL_MEETING_SECRET')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const before = await page.locator('.tasktext').textContent()
  await page.locator('.add-task-textarea').fill('CONFIDENTIAL_DRAFT')
  const mutations: string[] = []
  page.on('request', request => {if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && !request.url().includes('/token/refresh')) mutations.push(request.method() + ' ' + new URL(request.url()).pathname)})
  const button = page.getByRole('button', {name: 'One-click screenshot privacy', exact: true})
  await button.click()
  const dialog = page.getByRole('dialog', {name: 'Private screenshot preview'})
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveCSS('opacity', '1')
  await expect(dialog).toHaveCSS('animation-name', 'none')
  await expect(page.locator('#app')).not.toBeVisible()
  const snapshot = page.locator('.screenshot-snapshot')
  await expect(snapshot).not.toContainText('CONFIDENTIAL')
  await expect(snapshot).not.toContainText('First Project')
  await expect(snapshot).toContainText('Sort')
  await expect(snapshot.locator('.tasktext')).toContainText('Example task')
  await expect(snapshot.locator('.project-title').first()).toContainText('Example project')
  expect(await dialog.evaluate(el => el.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path: testInfo.outputPath('private-preview.png')})
  await dialog.getByRole('button', {name: 'Restore real content', exact: true}).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.tasktext')).toHaveText(before!)
  await button.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.tasktext')).toContainText('CONFIDENTIAL_MEETING_SECRET')
  expect(mutations).toEqual([])
  await expect(page.locator('.add-task-textarea')).toHaveValue('CONFIDENTIAL_DRAFT')
  const root = apiRootUrl(process.env.API_URL || 'http://127.0.0.1:3456') + '/api/v2'
  const token = await page.evaluate(() => localStorage.getItem('token'))
  const task = await (await apiContext.get(`${root}/tasks/1`, {headers: {Authorization: `Bearer ${token}`}})).json()
  expect(task.title).toBe('CONFIDENTIAL_MEETING_SECRET')
  expect(task.description).toBe('CONFIDENTIAL_DESCRIPTION')
  await page.locator('.tasktext').click()
  await expect(page.locator('.task-view')).toBeVisible()
  await expect(page.locator('.task-view')).toContainText('CONFIDENTIAL_DESCRIPTION')
 })
}
