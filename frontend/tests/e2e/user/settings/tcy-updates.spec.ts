import {test, expect} from '../../../support/fixtures'
import {readFileSync} from 'node:fs'

const {VERSION}: {VERSION: string} = JSON.parse(readFileSync(new URL('../../../../src/version.json', import.meta.url), 'utf8'))

test.beforeEach(async ({authenticatedPage: page}) => {
	await page.goto('/')
	await expect(page.locator('.update-notification')).toHaveCount(0)
})

test('same-version waiting worker does not show a banner after navigation or reload', async ({authenticatedPage: page}) => {
	await page.addInitScript(version => {
		const waiting = {postMessage(message: string, ports?: MessagePort[]) {
			if (message === 'getVersion') ports?.[0].postMessage({version})
			if (message === 'skipWaiting') document.documentElement.dataset.unexpectedActivation = 'true'
		}}
		Object.defineProperty(navigator.serviceWorker, 'getRegistration', {value: async () => ({waiting}), configurable: true})
	}, VERSION)
	for (let attempt = 0; attempt < 2; attempt++) {
		await page.reload()
		await expect(page.locator('main h1')).toBeVisible()
		// The version exchange is asynchronous; wait beyond its timeout to prove
		// the banner stays absent, rather than only observing initial render.
		await page.waitForTimeout(1200)
		await expect(page.locator('.update-notification')).toHaveCount(0)
		await expect(page.locator('html')).not.toHaveAttribute('data-unexpected-activation')
	}
})

test('a newer update is shown but a following same-version event clears it', async ({authenticatedPage: page}) => {
	async function announce(version: string) {
		await page.evaluate(version => {
			const registration = {waiting: {postMessage(message: string, ports?: MessagePort[]) {
				if (message === 'getVersion') ports?.[0].postMessage({version})
			}}}
			document.dispatchEvent(new CustomEvent('swUpdated', {detail: registration}))
		}, version)
	}
	await announce('v99.0.0-tcymc.1')
	await expect(page.locator('.update-notification')).toContainText('v99.0.0-tcymc.1')
	await announce(VERSION)
	await expect(page.locator('.update-notification')).toHaveCount(0)
})

test('an unresponsive worker does not borrow the backend version', async ({authenticatedPage: page}) => {
	await page.evaluate(() => {
		document.dispatchEvent(new CustomEvent('swUpdated', {detail: {waiting: {postMessage() { /* Legacy worker does not answer getVersion. */ }}}}))
	})
	await page.waitForTimeout(1200)
	await expect(page.locator('.update-notification')).toHaveCount(0)
})

test('a stale delayed reply cannot replace the latest same-version decision', async ({authenticatedPage: page}) => {
	await page.evaluate(version => {
		const announce = (answer: string, delay: number) => {
			const registration = {waiting: {postMessage(message: string, ports?: MessagePort[]) {
				if (message === 'getVersion') setTimeout(() => ports?.[0].postMessage({version: answer}), delay)
			}}}
			document.dispatchEvent(new CustomEvent('swUpdated', {detail: registration}))
		}
		announce('v99.0.0-tcymc.1', 400)
		announce(version, 0)
	}, VERSION)
	await page.waitForTimeout(1200)
	await expect(page.locator('.update-notification')).toHaveCount(0)
})
