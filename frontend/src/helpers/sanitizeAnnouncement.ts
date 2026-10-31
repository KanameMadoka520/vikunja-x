import createDOMPurify, {type Config, type DOMPurify} from 'dompurify'

// An announcement sits above every project view, so it gets a narrower set than a description:
// text formatting, lists, tables and links. No images (remote or data:), media, SVG, forms,
// styles, classes or ids that could load third-party content or restyle the surrounding UI.
const CONFIG: Config = {
	ALLOWED_TAGS: [
		'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'code', 'pre', 'blockquote',
		'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'mark', 'sub', 'sup',
		'table', 'thead', 'tbody', 'tr', 'th', 'td',
	],
	ALLOWED_ATTR: ['href', 'target', 'rel', 'colspan', 'rowspan', 'data-type', 'data-checked'],
	// DOMPurify checks every attribute that is not "URI safe" against ALLOWED_URI_REGEXP; only href
	// carries a URL here, so the plain-value attributes are exempt from the strict scheme list.
	ADD_URI_SAFE_ATTR: ['target', 'rel', 'colspan', 'rowspan', 'data-type', 'data-checked'],
	ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
	ALLOW_DATA_ATTR: false,
	ALLOW_ARIA_ATTR: false,
	ALLOW_UNKNOWN_PROTOCOLS: false,
}

const BLOCKS = new Set([
	'P', 'BR', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR',
	'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
])

let purifier: DOMPurify | undefined

// A private instance: sanitizeProjectDescription registers a hook on the shared default one, and
// neither set of rules should leak into the other.
function getPurifier(): DOMPurify {
	if (!purifier) {
		purifier = createDOMPurify(window)
		purifier.addHook('afterSanitizeAttributes', node => {
			if (node.nodeName !== 'A') return
			if (node.hasAttribute('href')) {
				// Forced, not allowed: the author's own target/rel could keep window.opener or the referrer.
				node.setAttribute('target', '_blank')
				node.setAttribute('rel', 'noopener noreferrer nofollow')
			} else {
				node.removeAttribute('target')
				node.removeAttribute('rel')
			}
		})
	}
	return purifier
}

export function sanitizeAnnouncement(html: string): string {
	if (html === '') return ''
	return getPurifier().sanitize(html, CONFIG)
}

function collectText(node: Node, parts: string[]) {
	for (const child of Array.from(node.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) {
			parts.push(child.textContent ?? '')
		} else if (child.nodeType === Node.ELEMENT_NODE) {
			const block = BLOCKS.has(child.nodeName)
			if (block) parts.push('\n')
			collectText(child, parts)
			if (block) parts.push('\n')
		}
	}
}

/**
 * The visible text lines of an announcement after sanitizing, whitespace collapsed and blank lines
 * dropped. Empty when nothing readable is left, e.g. `<p></p>`, `<p>&nbsp;</p>` or only an image.
 */
export function announcementTextLines(html: string): string[] {
	if (html === '') return []
	const parts: string[] = []
	collectText(getPurifier().sanitize(html, {...CONFIG, RETURN_DOM_FRAGMENT: true}), parts)
	return parts.join('')
		.split('\n')
		.map(line => line.replace(/\s+/g, ' ').trim())
		.filter(line => line !== '')
}

export function isAnnouncementContentEmpty(html: string): boolean {
	return announcementTextLines(html).length === 0
}
