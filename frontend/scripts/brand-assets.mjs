// Rebuild production sizes from the original generated artwork; no network requests.
import sharp from 'sharp'
import {mkdir, writeFile, copyFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const mark = path.join(root, 'originalMedia/brand/logo-source.png')
const avatar = path.join(root, 'originalMedia/brand/avatar-source.png')
const output = path.join(root, 'public/images/brand')
const icons = path.join(root, 'public/images/icons')
await mkdir(output, {recursive: true})
const png = size => sharp(mark).resize(size, size, {fit: 'contain'}).png().toBuffer()
await sharp(mark).resize(512).png().toFile(path.join(output, 'logo.png'))
await sharp(mark).resize(256).webp({quality: 90}).toFile(path.join(output, 'logo.webp'))
await sharp(avatar).resize(512).png().toFile(path.join(output, 'avatar.png'))
await sharp(avatar).resize(960).webp({quality: 86}).toFile(path.join(output, 'avatar.webp'))
const embeddedMark = (await png(256)).toString('base64')
const image = `<image href="data:image/png;base64,${embeddedMark}" x="0" y="0" width="64" height="64"/>`
const full = (color = 'currentColor', pride = false) => `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 300 64" width="300" height="64"><title>vikunja-x</title>${image}<text x="74" y="44" fill="${color}" font-family="Quicksand,system-ui,sans-serif" font-size="39" font-weight="700" letter-spacing="-1.5">vikunja-x</text>${pride ? '<defs><linearGradient id="vx-pride"><stop stop-color="#e40303"/><stop offset=".2" stop-color="#ff8c00"/><stop offset=".4" stop-color="#ffed00"/><stop offset=".6" stop-color="#008026"/><stop offset=".8" stop-color="#24408e"/><stop offset="1" stop-color="#732982"/></linearGradient></defs><rect x="76" y="53" width="184" height="3" rx="1.5" fill="url(#vx-pride)"/>' : ''}</svg>\n`
const standalone = `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 64 64" width="64" height="64"><title>vikunja-x</title>${image}</svg>\n`
for (const dir of ['src/assets', 'originalMedia/images']) {
 await writeFile(path.join(root, dir, 'logo-full.svg'), full())
 await writeFile(path.join(root, dir, 'logo-full-pride.svg'), full('currentColor', true))
 await writeFile(path.join(root, dir, 'logo.svg'), standalone)
}
await writeFile(path.join(root, 'originalMedia/images/logo-full-white.svg'), full('#fff'))
await writeFile(path.join(output, 'logo.svg'), standalone)
await writeFile(path.join(output, 'wordmark.svg'), full('#17243b'))
await writeFile(path.join(output, 'wordmark-dark.svg'), full('#eef5ff'))
for (const [name, size] of Object.entries({
 'favicon-16x16.png': 16, 'favicon-32x32.png': 32,
 'android-chrome-192x192.png': 192, 'android-chrome-512x512.png': 512,
 'apple-touch-icon-60x60.png': 60, 'apple-touch-icon-76x76.png': 76,
 'apple-touch-icon-120x120.png': 120, 'apple-touch-icon-152x152.png': 152,
 'apple-touch-icon-180x180.png': 180, 'apple-touch-icon.png': 180,
 'msapplication-icon-144x144.png': 144, 'mstile-150x150.png': 150,
})) {
 const appIcon = !name.startsWith('favicon')
 let result = sharp(mark).resize(size, size)
 if (appIcon) result = result.flatten({background: '#eef5ff'})
 await result.png().toFile(path.join(icons, name))
}
// Maskable icons require all meaningful artwork inside the central safe circle.
await sharp({create: {width: 1024, height: 1024, channels: 4, background: '#eef5ff'}})
 .composite([{input: await png(680), gravity: 'center'}]).png().toFile(path.join(icons, 'icon-maskable.png'))
await sharp(await png(32)).composite([{input: Buffer.from('<svg width="32" height="32"><circle cx="7" cy="25" r="6" fill="#ef4444" stroke="white" stroke-width="2"/></svg>')}]).png().toFile(path.join(icons, 'favicon-tracking-32x32.png'))
// Monochrome browser/notification marks use a clean, small-size X silhouette.
const mono = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M16 8 32 24 48 8 56 16 40 32 56 48 48 56 32 40 16 56 8 48 24 32 8 16Z"/></svg>\n'
await writeFile(path.join(icons, 'safari-pinned-tab.svg'), mono)
await sharp(Buffer.from(mono.replace('<path ', '<path fill="white" '))).resize(96).png().toFile(path.join(icons, 'badge-monochrome.png'))
// ICO supports PNG payloads. Include 16, 32 and 48 px entries for browser/OS support.
const sizes = [16, 32, 48], payloads = await Promise.all(sizes.map(png))
const header = Buffer.alloc(6 + sizes.length * 16)
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
let offset = header.length
payloads.forEach((data, i) => {
 const at = 6 + i * 16
 header[at] = sizes[i]; header[at + 1] = sizes[i]
 header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6)
 header.writeUInt32LE(data.length, at + 8); header.writeUInt32LE(offset, at + 12)
 offset += data.length
})
await writeFile(path.join(root, 'public/favicon.ico'), Buffer.concat([header, ...payloads]))
for (const name of ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon-60x60.png', 'apple-touch-icon-76x76.png', 'apple-touch-icon-120x120.png', 'apple-touch-icon-152x152.png', 'apple-touch-icon-180x180.png', 'msapplication-icon-144x144.png', 'icon-maskable.png']) {
 await copyFile(path.join(icons, name), path.join(root, 'originalMedia/icons', name))
}
console.log('vikunja-x logo, avatar, wordmarks, favicon, PWA, Apple and notification icons generated.')
