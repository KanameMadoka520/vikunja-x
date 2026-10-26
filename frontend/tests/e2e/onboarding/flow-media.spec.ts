import {test, expect} from '../../support/fixtures'
import {TaskFactory} from '../../factories/task'
import {createProjects} from '../project/prepareProjects'

for (const width of [1440, 390]) {
 test(`empty project new-task button focuses, explains and creates at ${width}px`, async ({authenticatedPage: page}) => {
  await createProjects(1)
  await page.setViewportSize({width, height: 900})
  await page.goto('/projects/1/1')
  await page.getByRole('button', {name: 'Create a task.', exact: true}).click()
  await expect(page.locator('.task-add textarea')).toBeFocused()
  await expect(page.locator('.task-invite')).toBeVisible()
  await page.locator('.task-add textarea').fill('Task created from empty state')
  await page.locator('.task-add textarea').press('Enter')
  await expect(page.locator('.tasks')).toContainText('Task created from empty state')
  await page.reload()
  await expect(page.locator('.tasks')).toContainText('Task created from empty state')
  await page.goto('/projects/1/settings/edit')
  await page.locator('.color-presets > summary').click()
  await expect(page.locator('.palette-panel')).toBeVisible()
  const palette=await page.locator('.palette-panel').boundingBox()
  expect(palette!.x).toBeGreaterThanOrEqual(0)
  expect(palette!.x+palette!.width).toBeLessThanOrEqual(width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
 })
}

test('mobile project cover retains original or real WebP and reports upload completion', async ({authenticatedPage:page}) => {
 await createProjects(1)
 await page.setViewportSize({width:390,height:844})
 await page.goto('/projects/1/settings/background')
 const png = await page.evaluate(() => {
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=32
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#1973ff';ctx.fillRect(0,0,64,32)
  return canvas.toDataURL('image/png').split(',')[1]
 })
 for (const mode of ['webp','original']) {
  await page.locator('input[type=file]').setInputFiles({name:`cover-${mode}.png`,mimeType:'image/png',buffer:Buffer.from(png,'base64')})
  const dialog=page.getByRole('dialog',{name:'Choose how to upload images'})
  await expect(dialog).toBeVisible()
  if(mode==='webp') await dialog.locator('input[value=webp]').check()
  const upload=page.waitForRequest(r=>r.url().endsWith('/backgrounds/upload')&&r.method()==='PUT')
  const saved=page.waitForResponse(r=>r.url().endsWith('/backgrounds/upload')&&r.request().method()==='PUT')
  await dialog.getByRole('button',{name:'Upload images',exact:true}).click()
  expect((await upload).headers()['x-vikunja-image-mode']).toBe(mode)
  expect((await saved).status()).toBe(200)
  await expect(page.locator('.cover-preview img')).toBeVisible()
  await expect(page.locator('.upload-row').first()).toContainText('Completed')
  const download=()=>page.evaluate(async()=>{
   const img=document.querySelector<HTMLImageElement>('.cover-preview img')!
   const blob=await (await fetch(img.src)).blob()
   return {type:blob.type, bytes:Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0,12))}
  })
  await expect.poll(async()=>(await download()).type).toBe(mode==='webp'?'image/webp':'image/png')
  const downloaded=await download()
  expect(downloaded.bytes.slice(0,4)).toEqual(mode==='webp'?[82,73,70,70]:[137,80,78,71])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }
})

for (const mode of ['converted', 'original']) {
 test(`WebP ${mode} task attachment previews and remains a cover after reload`, async ({authenticatedPage: page}) => {
  await createProjects(1)
  await TaskFactory.create(1, {title: 'WebP cover regression'})
  await page.goto('/tasks/1')
  const type = mode === 'converted' ? 'image/png' : 'image/webp'
  const image = await page.evaluate(type => {
   const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32
   const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#1973ff'; ctx.fillRect(0, 0, 64, 32)
   return canvas.toDataURL(type).split(',')[1]
  }, type)
  const chooser = page.waitForEvent('filechooser')
  await page.locator('.task-view .action-buttons .button').filter({hasText: 'Add Attachments'}).click()
  await (await chooser).setFiles({name: `cover.${mode === 'converted' ? 'png' : 'webp'}`, mimeType: type, buffer: Buffer.from(image, 'base64')})
  const dialog = page.getByRole('dialog', {name: 'Choose how to upload images'})
  if (mode === 'converted') await dialog.locator('input[value=webp]').check()
  const uploaded = page.waitForResponse(r => r.url().includes('/tasks/1/attachments') && r.request().method() === 'POST')
  await dialog.getByRole('button', {name: 'Upload images', exact: true}).click()
  expect((await uploaded).ok()).toBe(true)
  const cover = page.getByRole('button', {name: 'Make cover', exact: true})
  await expect(cover).toBeVisible()
  await expect(page.locator('.attachment-preview')).toBeVisible()
  await cover.click()
  await expect(page.getByRole('button', {name: 'Remove cover', exact: true})).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', {name: 'Remove cover', exact: true})).toBeVisible()
  await expect(page.locator('.attachment-preview')).toBeVisible()
  await expect.poll(async () => page.locator('img.attachment-preview').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
 })
}
