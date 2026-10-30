// The API reports the effective zone (the server's `service.timezone` when the
// user never chose one), so this fallback only covers an empty value from an
// older API. It is the stock `service.timezone` default, not necessarily the
// zone a given server uses. It deliberately avoids the browser zone: the API
// saves an unset zone as the server zone on the next settings update, and a
// browser fallback would then shift filters and day grouping after an unrelated
// save such as resizing the sidebar.
export const SERVER_DEFAULT_TIMEZONE = 'GMT'

export function resolveUserTimezone(timezone: string | null | undefined): string {
	return timezone || SERVER_DEFAULT_TIMEZONE
}
