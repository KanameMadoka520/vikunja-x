export function prefersReducedMotion(): boolean {
	return typeof window !== 'undefined'
		&& typeof window.matchMedia === 'function'
		&& window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// JS smooth scrolling ignores the CSS reduced-motion overrides, so callers ask here.
export function smoothScrollBehavior(): ScrollBehavior {
	return prefersReducedMotion() ? 'instant' : 'smooth'
}

export function scrollIntoView(el: HTMLElement | null | undefined, behavior: ScrollBehavior = 'smooth') {
	if (!el) {
		return
	}

	const boundingRect = el.getBoundingClientRect()
	const scrollY = window.scrollY

	if (
		boundingRect.top > (scrollY + window.innerHeight) ||
		boundingRect.top < scrollY
	) {
		el.scrollIntoView({
			behavior: behavior === 'smooth' ? smoothScrollBehavior() : behavior,
			block: 'center',
			inline: 'nearest',
		})
	}
}
