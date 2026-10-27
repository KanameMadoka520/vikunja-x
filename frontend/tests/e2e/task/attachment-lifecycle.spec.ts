import {test, expect} from '../../support/fixtures'
import {createProjects} from '../project/prepareProjects'
import {TaskFactory} from '../../factories/task'
import {apiRootUrl} from '../../support/apiUrl'

for (const width of [1440, 390]) {
 test(`cover removal and attachment deletion preserve the right content at ${width}px`, async ({authenticatedPage: page, apiContext}, testInfo) => {
  test.setTimeout(90_000)
  await createProjects(1)
  await TaskFactory.create(1, {title: 'Cover lifecycle', description: '<p>Meeting notes to preserve</p>'})
  await page.setViewportSize({width, height: 900})
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/projects/1/settings/background')
  await page.getByRole('button', {name: 'Aurora · Waves'}).click()
  await page.getByRole('dialog', {name: 'Choose how to upload images'}).getByRole('button', {name: 'Upload images', exact: true}).click()
  await expect(page.locator('.cover-preview img')).toBeVisible()
  await page.goto('/tasks/1')
  await page.locator('.tiptap__task-description button.done-edit').click()
  await page.getByRole('button', {name: 'Insert image from Drive', exact: true}).click()
  const picker = page.getByRole('dialog', {name: 'Choose from Drive'})
  await picker.getByRole('button', {name: 'Choose from Drive', exact: true}).click()
  const description = page.locator('.tiptap__task-description')
  await expect(description.locator('img')).toHaveCount(1)
  await description.getByRole('button', {name: 'Save', exact: true}).click()
  const root = apiRootUrl(process.env.API_URL || 'http://127.0.0.1:3456') + '/api/v2'
  const token = await page.evaluate(() => localStorage.getItem('token'))
  const headers = {Authorization: `Bearer ${token}`}
  const readTask = async () => (await apiContext.get(`${root}/tasks/1`, {headers})).json()
  await expect.poll(async () => (await readTask()).description).toContain('data-src')
  const initial = await readTask()
  const attachment = initial.attachments[0]
  await page.getByRole('button', {name: 'Make cover', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Remove cover', exact: true})).toBeEnabled()
  await page.getByRole('button', {name: 'Remove cover', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Make cover', exact: true})).toBeEnabled()
  await page.reload()
  await expect(description.locator('img')).toHaveCount(1)
  expect((await readTask()).cover_image_attachment_id).toBe(0)
  await page.getByRole('button', {name: 'Make cover', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Remove cover', exact: true})).toBeEnabled()
  // Failure keeps the confirmation and source intact, then retry succeeds.
  let failOnce = true
  await page.route(`**/api/v2/tasks/1/attachments/${attachment.id}`, async route => {
   if (route.request().method() === 'DELETE' && failOnce) {
    failOnce = false
    await route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({message: 'Temporary test failure'})})
   } else await route.continue()
  })
  await page.locator('.attachment-actions [aria-label="Delete this attachment"]').click()
  const dialog = page.getByRole('dialog', {name: 'Delete attachment'})
  await expect(dialog).toContainText('description and comments')
  await dialog.getByRole('button', {name: 'Do it!', exact: true}).click()
  await expect(dialog.getByRole('button', {name: 'Do it!', exact: true})).toBeEnabled()
  expect((await readTask()).attachments).toHaveLength(1)
  await dialog.getByRole('button', {name: 'Do it!', exact: true}).click()
  await expect(dialog).not.toBeVisible()
  await expect(description.locator('img')).toHaveCount(0)
  await expect(description).toContainText('Meeting notes to preserve')
  await page.reload()
  await expect(description.locator('img')).toHaveCount(0)
  await expect(description).toContainText('Meeting notes to preserve')
  const final = await readTask()
  expect(final.attachments ?? []).toHaveLength(0)
  expect(final.cover_image_attachment_id).toBe(0)
  expect(final.description).not.toContain('attachments/')
  expect((await apiContext.get(`${root}/drive/files/${attachment.file.id}/download`, {headers})).status()).toBe(200)
  // An older browser tab cannot reintroduce the deleted image.
  const stale = await apiContext.patch(`${root}/tasks/1`, {headers: {...headers, 'Content-Type': 'application/json-patch+json'}, data: [{op: 'replace', path: '/description', value: initial.description}]})
  expect(stale.ok()).toBe(true)
  expect((await readTask()).description).not.toContain('attachments/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path: testInfo.outputPath('attachment-removed.png')})
  expect(errors).toEqual([])
 })
}
