<script setup lang="ts">
import {
	computed,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	useId,
	watch,
} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {
	autoUpdate,
	computePosition,
	flip,
	offset,
	shift,
	size,
} from '@floating-ui/dom'

import BaseButton from '@/components/base/BaseButton.vue'
import {useAuthStore} from '@/stores/auth'
import {useBaseStore} from '@/stores/base'
import {useGuidedTourStore} from '@/stores/guidedTour'
import {useIsMobile} from '@/composables/useIsMobile'
import {getApiBaseUrl} from '@/helpers/apiUrl'
import {
	guides,
	guideStorageKey,
	type GuideId,
} from '@/helpers/guidedTour'

const {t} = useI18n({useScope: 'global'})
const auth = useAuthStore()
const base = useBaseStore()
const tour = useGuidedTourStore()
const route = useRoute()
const router = useRouter()
const mobile = useIsMobile()
const dialog = ref<HTMLDialogElement>()
const panel = ref<HTMLElement>()
const title = ref<HTMLElement>()
const maskId = useId()
const guide = ref<GuideId>()
const index = ref(0)
const busy = ref(false)
const missing = ref(false)
const ready = ref(false)
const rect = ref<{
	x: number
	y: number
	width: number
	height: number
}>()
const position = ref({
	left: '16px',
	top: '16px',
})
const completed = ref<GuideId[]>([])
const welcomed = ref(false)
const eligible = computed(() => auth.authUser && Boolean(auth.info?.id))
const storageKey = computed(() => eligible.value
	? guideStorageKey(getApiBaseUrl(), auth.info!.id!)
	: '',
)
const steps = computed(() => guide.value ? guides[guide.value].steps : [])
const step = computed(() => steps.value[index.value])
const showWelcome = computed(() =>
	eligible.value && route.name === 'home' && !welcomed.value && !tour.requested,
)
let stopPositioning: (() => void) | undefined
let generation = 0
let disposed = false
let previousFocus: HTMLElement | null = null
let previousMenu = false
let previousScroll = {x: 0, y: 0}

function loadProgress() {
	completed.value = []
	welcomed.value = false
	if (!storageKey.value) return
	try {
		const saved = JSON.parse(localStorage.getItem(storageKey.value) ?? '{}')
		welcomed.value = saved.welcomed === true
		completed.value = Array.isArray(saved.completed)
			? saved.completed.filter((id: GuideId) => Object.hasOwn(guides, id))
			: []
	} catch { /* A blocked or invalid local storage must not prevent opening the guides. */ }
}

function saveProgress() {
	if (!storageKey.value) return
	try {
		localStorage.setItem(storageKey.value, JSON.stringify({
			welcomed: welcomed.value,
			completed: completed.value,
		}))
	} catch { /* Guides still work when browser storage is unavailable. */ }
}

function dismissWelcome() {
	welcomed.value = true
	saveProgress()
}

function clearPositioning() {
	stopPositioning?.()
	stopPositioning = undefined
	rect.value = undefined
}

function close() {
	generation++
	clearPositioning()
	guide.value = undefined
	panel.value?.style.removeProperty('max-height')
	busy.value = false
	dialog.value?.close()
	tour.hide()
	if (!disposed && eligible.value) {
		base.setMenuActive(previousMenu)
		const restore = previousFocus
		// Closing the phone drawer leaves the header inert until the next render.
		void nextTick(() => {
			// Only restore focus when its original element still exists after a route change.
			if (restore?.isConnected) restore.focus({preventScroll: true})
		})
	}
}

async function open() {
	if (!eligible.value || disposed || dialog.value?.open) return
	previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
	previousMenu = base.menuActive
	previousScroll = {x: window.scrollX, y: window.scrollY}
	dismissWelcome()
	guide.value = undefined
	await nextTick()
	if (!tour.requested || !eligible.value || disposed) return
	dialog.value?.showModal()
	title.value?.focus()
}

async function positionPanel(target: HTMLElement, ticket: number) {
	if (!panel.value || ticket !== generation) return
	// A background settings refetch can replace the form while this step is open.
	if (!target.isConnected) {
		void showStep()
		return
	}
	let box = target.getBoundingClientRect()
	const viewport = window.visualViewport
	const width = viewport?.width ?? window.innerWidth
	const height = viewport?.height ?? window.innerHeight
	const viewportX = viewport?.offsetLeft ?? 0
	const viewportY = viewport?.offsetTop ?? 0
	// Router scroll restoration may run after navigation resolves; keep the anchor visible.
	if (box.height < height - 32 && (box.top < viewportY || box.bottom > viewportY + height)) {
		target.scrollIntoView({behavior: 'instant', block: 'center'})
		box = target.getBoundingClientRect()
	}
	// Clip the spotlight to the visible viewport instead of outlining off-screen content.
	const x = Math.max(viewportX + 4, box.left - 6)
	const y = Math.max(viewportY + 4, box.top - 6)
	const right = Math.min(viewportX + width - 4, box.right + 6)
	const bottom = Math.min(viewportY + height - 4, box.bottom + 6)
	rect.value = right > x && bottom > y
		? {
			x,
			y,
			width: right - x,
			height: bottom - y,
		}
		: undefined
	const result = await computePosition(target, panel.value, {
		strategy: 'fixed',
		placement: 'bottom',
		middleware: [
			offset(18),
			flip({fallbackPlacements: ['top']}),
			shift({padding: 16}),
			size({
				padding: 16,
				apply({availableHeight, elements}) {
					elements.floating.style.maxHeight = `${Math.max(96, availableHeight)}px`
				},
			}),
		],
	})
	if (ticket !== generation) return
	position.value = {
		left: `${result.x}px`,
		top: `${result.y}px`,
	}
	ready.value = true
}

async function showStep() {
	const current = step.value
	if (!current || disposed) return
	const ticket = ++generation
	busy.value = true
	missing.value = false
	ready.value = false
	clearPositioning()
	if (panel.value) panel.value.scrollTop = 0
	try {
		// Each step resolves its page from the latest route in the guide, including Back.
		const destination = steps.value.slice(0, index.value + 1).findLast(s => s.route)?.route
		if (destination && route.name !== destination) await router.push({name: destination})
		if (ticket !== generation || disposed) return
		base.setMenuActive(Boolean(current.sidebar) || (!mobile.value && previousMenu))
		await nextTick()
		const selector = `[data-tour="${current.target}"]`
		let target: HTMLElement | null = null
		// Settings load asynchronously; wait for their real content, never create demo data.
		for (let attempt = 0; attempt < 40 && ticket === generation; attempt++) {
			if (current.settingsTab) {
				window.dispatchEvent(new CustomEvent('vikunja:ai-settings-tab', {detail: current.settingsTab}))
				await nextTick()
			}
			const candidate = document.querySelector<HTMLElement>(selector)
			if (candidate && candidate.getBoundingClientRect().width > 0
				&& candidate.getBoundingClientRect().height > 0) {
				target = candidate
				break
			}
			await new Promise(resolve => setTimeout(resolve, 100))
		}
		if (ticket !== generation || disposed) return
		if (!target) {
			missing.value = true
			ready.value = true
			return
		}
		target.scrollIntoView({
			behavior: 'instant',
			block: 'center',
			inline: 'nearest',
		})
		await nextTick()
		if (ticket !== generation) return
		stopPositioning = autoUpdate(target, panel.value!, () => {
			void positionPanel(target!, ticket)
		}, {animationFrame: true})
	} catch {
		if (ticket === generation) {
			missing.value = true
			ready.value = true
		}
	} finally {
		if (ticket === generation) {
			busy.value = false
			title.value?.focus({preventScroll: true})
		}
	}
}

function start(id: GuideId) {
	guide.value = id
	index.value = 0
	void showStep()
}

function next() {
	if (busy.value || !guide.value) return
	if (index.value === steps.value.length - 1) {
		completed.value = [...new Set([...completed.value, guide.value])]
		saveProgress()
		clearPositioning()
		generation++
		guide.value = undefined
		if (panel.value) panel.value.scrollTop = 0
		panel.value?.style.removeProperty('max-height')
		base.setMenuActive(previousMenu)
		window.scrollTo({
			behavior: 'instant',
			left: previousScroll.x,
			top: previousScroll.y,
		})
		void nextTick(() => title.value?.focus())
		return
	}
	index.value++
	void showStep()
}

function back() {
	if (busy.value || index.value === 0) return
	index.value--
	void showStep()
}

function keydown(event: KeyboardEvent) {
	// Stop app-wide shortcuts while the guide owns focus (including search and navigation).
	event.stopPropagation()
	if (event.key === 'Tab') {
		const controls = [...(dialog.value?.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]') ?? [])]
			.filter(el => el.getClientRects().length > 0)
		const current = controls.indexOf(document.activeElement as HTMLElement)
		const nextIndex = event.shiftKey
			? (current <= 0 ? controls.length - 1 : current - 1)
			: (current + 1) % controls.length
		event.preventDefault()
		controls[nextIndex]?.focus()
		return
	}
	if (!guide.value) return
	if (event.key === 'ArrowRight') {
		event.preventDefault()
		next()
	} else if (event.key === 'ArrowLeft') {
		event.preventDefault()
		back()
	}
}

watch(storageKey, () => {
	if (dialog.value?.open || tour.requested) close()
	loadProgress()
}, {immediate: true, flush: 'sync'})
watch(() => tour.requested, requested => requested ? void open() : dialog.value?.open && close())
watch(mobile, () => {
	if (guide.value) void showStep()
})
onMounted(() => {
	if (tour.requested) void open()
})
onBeforeUnmount(() => {
	disposed = true
	close()
})
</script>

<template>
	<aside
		v-if="showWelcome"
		class="guide-welcome d-print-none"
		:aria-label="t('tour.welcomeTitle')"
	>
		<Icon
			icon="compass"
			aria-hidden="true"
		/>
		<div>
			<strong>{{ t('tour.welcomeTitle') }}</strong>
			<p>{{ t('tour.welcomeText') }}</p>
		</div>
		<BaseButton
			class="guide-button primary"
			@click="tour.show()"
		>
			{{ t('tour.open') }}
		</BaseButton>
		<BaseButton
			class="guide-icon guide-dismiss"
			@click="dismissWelcome"
		>
			<span class="is-sr-only">{{ t('tour.dismiss') }}</span>
			<Icon icon="times" />
		</BaseButton>
	</aside>
	<Teleport to="body">
		<dialog
			ref="dialog"
			class="guided-tour d-print-none"
			:aria-labelledby="`${maskId}-title`"
			:aria-describedby="`${maskId}-description`"
			@cancel.prevent="close"
			@keydown="keydown"
		>
			<svg
				v-if="guide"
				class="guide-shade"
				width="100%"
				height="100%"
				aria-hidden="true"
			>
				<defs>
					<mask :id="maskId">
						<rect
							width="100%"
							height="100%"
							fill="white"
						/>
						<rect
							v-if="rect"
							v-bind="rect"
							rx="8"
							fill="black"
						/>
					</mask>
				</defs>
				<rect
					class="guide-scrim"
					width="100%"
					height="100%"
					:mask="`url(#${maskId})`"
				/>
				<rect
					v-if="rect"
					v-bind="rect"
					rx="8"
					fill="none"
					stroke="white"
					stroke-width="2"
				/>
			</svg>
			<div
				v-else
				class="guide-shade selector-shade"
			/>
			<section
				ref="panel"
				class="guide-panel"
				:class="{'is-centered': !guide || missing || !ready}"
				:style="guide && !missing && ready ? position : undefined"
			>
				<header>
					<p class="guide-eyebrow">
						{{ guide ? t(`tour.guides.${guide}.title`) : t('tour.eyebrow') }}
					</p>
					<BaseButton
						class="guide-icon"
						:aria-label="t('tour.close')"
						@click="close"
					>
						<Icon icon="times" />
					</BaseButton>
				</header>
				<h2
					:id="`${maskId}-title`"
					ref="title"
					tabindex="-1"
				>
					{{ guide && step ? t(`tour.steps.${step.id}.title`) : t('tour.title') }}
				</h2>
				<p :id="`${maskId}-description`">
					{{ guide && step ? t(`tour.steps.${step.id}.text`) : t('tour.description') }}
				</p>
				<template v-if="!guide">
					<div class="guide-choices">
						<BaseButton
							v-for="(entry, id) in guides"
							:key="id"
							class="guide-choice"
							:data-guide="id"
							@click="start(id)"
						>
							<Icon :icon="entry.icon" />
							<span>
								<strong>{{ t(`tour.guides.${id}.title`) }}</strong>
								<small>{{ t(`tour.guides.${id}.description`) }}</small>
								<small>
									{{ t('tour.stepCount', {count: entry.steps.length}) }}
									<span
										v-if="completed.includes(id)"
										class="guide-completed"
									>
										· <Icon icon="check" /> {{ t('tour.completed') }}
									</span>
								</small>
							</span>
							<Icon :icon="completed.includes(id) ? 'history' : 'play'" />
						</BaseButton>
					</div>
					<p class="guide-note">
						{{ t('tour.remembered') }}
					</p>
				</template>
				<template v-else>
					<p
						v-if="missing"
						class="guide-note"
						role="status"
					>
						{{ t('tour.missing') }}
					</p>
					<p
						class="guide-progress"
						role="status"
						aria-live="polite"
					>
						{{ busy ? t('tour.locating') : t('tour.progress', {current: index + 1, total: steps.length}) }}
					</p>
					<progress
						:value="index + 1"
						:max="steps.length"
						:aria-label="t('tour.progress', {current: index + 1, total: steps.length})"
					/>
					<footer>
						<BaseButton
							class="guide-button"
							@click="close"
						>
							{{ t('tour.skip') }}
						</BaseButton>
						<div class="guide-pagination">
							<BaseButton
								class="guide-button"
								:aria-disabled="busy || index === 0"
								@click="back"
							>
								{{ t('tour.back') }}
							</BaseButton>
							<BaseButton
								class="guide-button primary"
								:aria-disabled="busy"
								@click="next"
							>
								{{ index === steps.length - 1 ? t('tour.finish') : t('tour.next') }}
							</BaseButton>
						</div>
					</footer>
				</template>
			</section>
		</dialog>
	</Teleport>
</template>

<style scoped lang="scss">
// First-run card: centred between the dock reserves on wide screens, above the dock on phones,
// so it never sits under the Arona launcher.
.guide-welcome {
	position: fixed;
	inset-block-end: var(--dock-inset-block);
	inset-inline: var(--dock-reserve-inline);
	z-index: var(--layer-header);
	display: flex;
	align-items: center;
	gap: var(--space-3);
	max-inline-size: 40rem;
	margin-inline: auto;
	padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
	border: 1px solid var(--border-default);
	border-inline-start: 3px solid var(--primary);
	border-radius: var(--radius-md);
	background: var(--surface-raised);
	box-shadow: var(--elevation-3);
	color: var(--text-primary);

	> svg {
		flex-shrink: 0;
		color: var(--accent-text);
		font-size: var(--text-xl);
	}

	> div {
		flex: 1 1 auto;
		min-inline-size: 0;
	}

	strong {
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
	}

	p {
		margin: var(--space-1) 0 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
	}

	// Beside the text the CTA left two or three CJK characters per line; on phones it
	// gets its own row and the close button keeps a reserved corner.
	@media (width <= 540px) {
		inset-block-end: var(--dock-reserve);
		inset-inline: var(--dock-inset-inline);
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
		gap: var(--space-2) var(--space-3);
		max-inline-size: none;
		padding-inline-end: calc(var(--nav-row-height) + var(--space-1));

		> svg {
			grid-column: 1;
			grid-row: 1;
			margin-block-start: .125rem;
		}

		> div {
			grid-column: 2;
			grid-row: 1;
		}

		.guide-button.primary {
			grid-column: 1 / -1;
			grid-row: 2;
			justify-self: stretch;
			margin-inline-end: calc(-1 * var(--nav-row-height));
		}

		.guide-dismiss {
			position: absolute;
			inset-block-start: var(--space-1);
			inset-inline-end: var(--space-1);
		}
	}
}

.guided-tour {
	position: fixed;
	inset: 0;
	inline-size: 100%;
	block-size: 100%;
	max-inline-size: none;
	max-block-size: none;
	margin: 0;
	padding: 0;
	overflow: hidden;
	border: 0;
	background: transparent;
	color: var(--text-primary);

	&::backdrop {
		background: transparent;
	}
}

.guide-shade {
	position: fixed;
	inset: 0;
	pointer-events: none;
}

.guide-scrim {
	fill: var(--scrim);
}

.selector-shade {
	background: var(--scrim);
}

.guide-panel {
	position: fixed;
	inline-size: min(26rem, calc(100vw - 2rem));
	max-block-size: calc(100dvh - 2rem);
	padding: var(--space-5);
	overflow-y: auto;
	overscroll-behavior: contain;
	border: 1px solid var(--border-default);
	border-radius: var(--radius-lg);
	background: var(--surface-raised);
	box-shadow: var(--elevation-3);
	text-align: start;

	&.is-centered {
		inset-block-start: 50%;
		inset-inline-start: 50%;
		transform: translate(-50%, -50%);

		[dir="rtl"] & {
			transform: translate(50%, -50%);
		}
	}

	header,
	footer,
	.guide-pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	header {
		margin-block-end: var(--space-2);
	}

	h2 {
		margin: 0 0 var(--space-3);
		padding: 0;
		font-size: var(--text-xl);
		line-height: var(--leading-tight);
		outline: none;
	}

	p {
		margin: 0 0 var(--space-4);
		color: var(--text-secondary);
		font-size: var(--text-md);
		line-height: var(--leading-normal);
		overflow-wrap: anywhere;
	}

	progress {
		display: block;
		inline-size: 100%;
		block-size: .25rem;
		margin-block: var(--space-2) var(--space-4);
		accent-color: var(--primary);
	}
}

.guide-panel .guide-eyebrow {
	margin: 0;
	color: var(--accent-text);
	font-size: var(--text-xs);
	font-weight: var(--weight-semibold);
}

.guide-panel .guide-note,
.guide-panel .guide-progress {
	color: var(--text-tertiary);
	font-size: var(--text-sm);
}

.guide-panel .guide-progress {
	margin-block: var(--space-4) var(--space-1);
}

.guide-panel .guide-note {
	margin-block: var(--space-4) 0;
}

.guide-choices {
	display: grid;
	gap: var(--space-2);
}

.guide-choice {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	inline-size: 100%;
	padding: var(--space-3);
	border: 1px solid var(--border-default);
	border-radius: var(--radius-md);
	color: var(--text-primary);
	text-align: start;
	transition:
		background-color var(--motion-fast) var(--ease-standard),
		border-color var(--motion-fast) var(--ease-standard);

	> svg {
		flex-shrink: 0;
		inline-size: 1.125rem;
		color: var(--accent-text);
	}

	> span {
		flex: 1;
		min-inline-size: 0;
	}

	strong,
	small {
		display: block;
	}

	strong {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
	}

	small {
		margin-block-start: var(--space-1);
		color: var(--text-secondary);
		font-size: var(--text-xs);
	}

	&:hover {
		border-color: var(--border-strong);
		background-color: var(--surface-hover);
	}
}

.guide-completed {
	color: var(--accent-text);
}

.guide-button,
.guide-icon {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	min-block-size: var(--nav-row-height);
	min-inline-size: var(--nav-row-height);
	border-radius: $radius;
	color: var(--text-primary);
	transition: background-color var(--motion-fast) var(--ease-standard);

	&:hover {
		background-color: var(--surface-hover);
	}

	&[aria-disabled="true"] {
		opacity: .45;
		cursor: default;
	}
}

.guide-icon {
	color: var(--text-secondary);
}

.guide-button {
	padding: var(--space-2) var(--space-3);
	font-size: var(--text-md);
	font-weight: var(--weight-semibold);

	&.primary {
		background-color: var(--primary);
		color: var(--text-on-accent);

		&:hover {
			background-image: linear-gradient(var(--surface-active), var(--surface-active));
		}
	}
}
</style>
