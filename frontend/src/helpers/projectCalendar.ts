// UTC is used only to construct calendar labels without DST gaps. Server counts
// already use the user's IANA timezone; these labels are never sent as instants.
export function projectCalendar(year: number) {
	const days: {date: string, month: number, weekday: number, week: number, day: number}[] = []
	const first = new Date(Date.UTC(year, 0, 1))
	const offset = (first.getUTCDay() + 6) % 7
	for (let d = new Date(first), index = 0; d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1), index++) {
		days.push({date: d.toISOString().slice(0, 10), month: d.getUTCMonth(), weekday: (d.getUTCDay() + 6) % 7, week: Math.floor((index + offset) / 7), day: d.getUTCDate()})
	}
	return days
}
