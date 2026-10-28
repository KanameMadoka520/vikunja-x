export function chatBytes(bytes = 0): string {
	const units = ['B', 'KiB', 'MiB', 'GiB']
	const n = Math.min(3, Math.max(0, Math.floor(Math.log2(Math.max(1, bytes)) / 10)))
	return `${(bytes / 1024 ** n).toFixed(n ? 1 : 0)} ${units[n]}`
}
export function saveChatBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url; a.download = filename; a.click()
	setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
