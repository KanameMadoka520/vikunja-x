import type {Editor} from '@tiptap/core'
import type {RootBoundary} from '@floating-ui/dom'
import {getTopLayerContainer} from '@/helpers/getTopLayerContainer'

export function getPopupContainer(editor?: Editor): HTMLElement {
	return getTopLayerContainer(editor?.view?.dom as HTMLElement | undefined)
}

// The part of the viewport a popup can use: the fixed navbar covers anything placed
// under it. Popups inside an open <dialog> render in the top layer over the navbar,
// so they get the whole viewport.
export function getViewportBelowNavbar(el?: Element | null): RootBoundary {
	const navbar = document.querySelector<HTMLElement>('.navbar')
	if (!navbar || el?.closest('dialog[open]') || getComputedStyle(navbar).position !== 'fixed') {
		return 'viewport'
	}

	const top = navbar.getBoundingClientRect().bottom
	const {clientWidth, clientHeight} = document.documentElement
	return {x: 0, y: top, width: clientWidth, height: Math.max(0, clientHeight - top)}
}
