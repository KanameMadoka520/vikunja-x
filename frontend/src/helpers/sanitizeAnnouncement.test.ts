// @vitest-environment jsdom
// happy-dom breaks DOMPurify (empty nodeName via Node.prototype)
import {describe, it, expect} from 'vitest'
import {announcementTextLines, isAnnouncementContentEmpty, sanitizeAnnouncement} from './sanitizeAnnouncement'
import {sanitizeProjectDescription} from './sanitizeProjectDescription'

describe('sanitizeAnnouncement', () => {
	it('keeps basic formatting, lists and tables', () => {
		const html = '<h2>Plan</h2><p><strong>a</strong> <em>b</em> <u>c</u> <s>d</s> <code>e</code></p><ul><li>f</li></ul><ol><li>g</li></ol><blockquote><p>h</p></blockquote><pre><code>i</code></pre><hr><table><tbody><tr><th colspan="2">j</th></tr><tr><td rowspan="1">k</td></tr></tbody></table>'

		expect(sanitizeAnnouncement(html)).toBe(html)
	})

	it('drops scripts, event handlers, images and media', () => {
		const html = sanitizeAnnouncement('<img src=x onerror=alert(1)><p onclick="alert(1)">x</p><script>alert(1)</script><svg><circle/></svg><iframe src="https://example.com"></iframe><video src="https://example.com/v.mp4"></video>')

		expect(html).toBe('<p>x</p>')
	})

	it('drops data: images', () => {
		expect(sanitizeAnnouncement('<p>a<img src="data:image/png;base64,AAAA"></p>')).toBe('<p>a</p>')
	})

	it('drops styles, classes, ids and form controls', () => {
		const html = sanitizeAnnouncement('<p style="position:fixed" class="button is-primary" id="login">x</p><style>body{display:none}</style><form action="https://attacker.example"><input name="password"><select><option>a</option></select><textarea>b</textarea><button>Go</button></form>')

		expect(html.startsWith('<p>x</p>')).toBe(true)
		expect(html).not.toMatch(/<(style|form|input|select|option|textarea|button)\b/)
		expect(html).not.toMatch(/\b(style|class|id|action)=/)
		expect(html).not.toContain('attacker.example')
	})

	it('removes script and unknown URL schemes from links', () => {
		const html = sanitizeAnnouncement('<a href="javascript:alert(1)">a</a><a href=" java\tscript:alert(1)">b</a><a href="data:text/html,x">c</a><a href="vbscript:x">d</a>')

		expect(html).toBe('<a>a</a><a>b</a><a>c</a><a>d</a>')
	})

	it('opens http(s) and mailto links in a new tab without opener or referrer', () => {
		expect(sanitizeAnnouncement('<a href="https://example.com" target="_self" rel="opener">x</a>'))
			.toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">x</a>')
		expect(sanitizeAnnouncement('<a href="mailto:team@example.com">y</a>'))
			.toBe('<a href="mailto:team@example.com" target="_blank" rel="noopener noreferrer nofollow">y</a>')
	})

	it('keeps task list markers but no other data or aria attributes', () => {
		const html = sanitizeAnnouncement('<ul data-type="taskList" data-foo="1" aria-hidden="true"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div><p>done</p></div></li></ul>')

		expect(html).toBe('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li></ul>')
	})

	it('does not change the shared description sanitizer', () => {
		sanitizeAnnouncement('<a href="https://example.com">x</a>')

		expect(sanitizeProjectDescription('<a href="https://example.com">x</a>')).toBe('<a href="https://example.com">x</a>')
	})
})

describe('announcementTextLines', () => {
	it('splits block elements into collapsed lines', () => {
		expect(announcementTextLines('<h2>Maintenance</h2><p>Friday   <strong>18:00</strong></p><ul><li>one</li><li>two</li></ul>'))
			.toEqual(['Maintenance', 'Friday 18:00', 'one', 'two'])
	})

	it('never reads text from removed markup', () => {
		expect(announcementTextLines('<script>alert(1)</script><style>p{}</style><p>visible</p>')).toEqual(['visible'])
	})
})

describe('isAnnouncementContentEmpty', () => {
	it.each([
		'',
		'<p></p>',
		'<p> </p>',
		'<p>&nbsp;</p><p><br></p>',
		'<p><img src="https://example.com/a.png"></p>',
		'<script>alert(1)</script>',
		'<hr>',
	])('treats %s as empty', html => {
		expect(isAnnouncementContentEmpty(html)).toBe(true)
	})

	it('sees text as content', () => {
		expect(isAnnouncementContentEmpty('<p>0</p>')).toBe(false)
	})
})
