import type {APIRequestContext} from '@playwright/test'

/**
 * The mail specs need Mailpit and a second, mail-enabled API (see tests/e2e/README.md); `mage test:e2e`
 * starts neither. Without that API the frontend falls back to port 3456, which may be some other
 * instance on the host, so these specs skip instead of running against it.
 */
export async function mailServicesAvailable(request: APIRequestContext, apiUrl: string, mailpitUrl: string): Promise<boolean> {
	const reachable = async (url: string) => {
		try {
			return (await request.get(url, {timeout: 3000})).ok()
		} catch {
			return false
		}
	}
	const [api, mailpit] = await Promise.all([
		reachable(`${apiUrl}/api/v1/info`),
		reachable(new URL('/api/v1/info', mailpitUrl).href),
	])
	return api && mailpit
}

export const MAIL_SERVICES_MISSING = 'needs Mailpit and the mail-enabled API from tests/e2e/README.md'
