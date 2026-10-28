import {sanitizeProjectDescription} from '@/helpers/sanitizeProjectDescription'

export interface DescriptionStageItem {index: number, checked: boolean, html: string, depth: number}
export interface DescriptionStage {title: string, items: DescriptionStageItem[], checked: number}

// This is a projection of the existing description, never a second task database.
export function descriptionStages(html: string): DescriptionStage[] {
	const doc = new DOMParser().parseFromString(html, 'text/html')
	const groups: DescriptionStage[] = []
	let current: DescriptionStage = {title: '', items: [], checked: 0}
	let index = 0
	const headings: {level: number, text: string}[] = []
	for (const element of doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,li[data-type="taskItem"]')) {
		if (/^H[1-6]$/.test(element.tagName)) {
			if (current.items.length) groups.push(current)
			const level = Number(element.tagName.slice(1))
			while (headings.length && headings.at(-1)!.level >= level) headings.pop()
			headings.push({level, text: element.textContent?.trim() || ''})
			current = {title: headings.map(h => h.text).filter(Boolean).join(' / '), items: [], checked: 0}
			continue
		}
		const copy = element.cloneNode(true) as Element
		copy.querySelectorAll('ul,ol,label,input').forEach(node => node.remove())
		const checked = element.getAttribute('data-checked') === 'true'
		let depth = 0
		for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.matches('li[data-type="taskItem"]')) depth++
		current.items.push({index: index++, checked, html: sanitizeProjectDescription(copy.innerHTML), depth})
		if (checked) current.checked++
	}
	if (current.items.length) groups.push(current)
	return groups
}

export function setDescriptionCheckbox(html: string, index: number, checked: boolean): string {
	const doc = new DOMParser().parseFromString(html, 'text/html')
	const item = doc.body.querySelectorAll('li[data-type="taskItem"]')[index]
	if (!item) return html
	item.setAttribute('data-checked', String(checked))
	const input = item.querySelector(':scope > label > input[type="checkbox"]')
	if (checked) input?.setAttribute('checked', '')
	else input?.removeAttribute('checked')
	return doc.body.innerHTML
}

export function stageTemplate(t: (key: string) => string): string {
	const doc = document.implementation.createHTMLDocument('')
	for (const stage of ['stages.phaseOne', 'stages.phaseTwo']) {
		const heading = doc.createElement('h2'); heading.textContent = t(stage); doc.body.append(heading)
		const list = doc.createElement('ul'); list.setAttribute('data-type', 'taskList')
		for (const key of ['stages.firstItem', 'stages.secondItem']) {
			const item = doc.createElement('li'); item.setAttribute('data-type', 'taskItem'); item.setAttribute('data-checked', 'false'); item.setAttribute('data-task-id', crypto.randomUUID())
			const p = doc.createElement('p'); p.textContent = t(key); item.append(p); list.append(item)
		}
		doc.body.append(list)
	}
	return doc.body.innerHTML
}
