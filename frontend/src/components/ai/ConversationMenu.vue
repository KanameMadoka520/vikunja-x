<script setup lang="ts">
import {nextTick, onBeforeUnmount, ref} from 'vue'
import {autoUpdate, computePosition, flip, offset, shift} from '@floating-ui/dom'
import {useI18n} from 'vue-i18n'
import {faThumbtack} from '@fortawesome/free-solid-svg-icons'
import type {ConversationSummary} from '@/client/generated'
defineProps<{conversation: ConversationSummary, disabled?: boolean, current?: boolean, canCompact?: boolean}>()
const emit = defineEmits<{action: [action: 'pin' | 'archive' | 'rename' | 'delete' | 'export' | 'compact']}>()
const {t} = useI18n({useScope: 'global'})
const trigger = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()
const open = ref(false)
let cleanup: (() => void) | undefined
async function position() {
	if (!trigger.value || !menu.value) return
	const {x, y} = await computePosition(trigger.value, menu.value, {strategy: 'fixed', placement: 'bottom-end', middleware: [offset(6), flip(), shift({padding: 8})]})
	Object.assign(menu.value.style, {left: `${x}px`, top: `${y}px`})
}
async function toggle(event: Event) {
	open.value = (event as ToggleEvent).newState === 'open'
	cleanup?.(); cleanup = undefined
	if (!open.value) return
	await nextTick()
	if (trigger.value && menu.value) cleanup = autoUpdate(trigger.value, menu.value, position)
	menu.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
}
function choose(action: 'pin' | 'archive' | 'rename' | 'delete' | 'export' | 'compact') {
	menu.value?.hidePopover()
	trigger.value?.focus()
	emit('action', action)
}
function keydown(event: KeyboardEvent) {
	const items = [...(menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
	const index = items.indexOf(document.activeElement as HTMLButtonElement)
	if (event.key === 'Escape' || event.key === 'Tab') {
		menu.value?.hidePopover()
		if (event.key === 'Escape') {
			event.preventDefault()
			// Only the menu closes: the floating panel and the history overlay also listen for Escape.
			event.stopPropagation()
			trigger.value?.focus()
		}
		return
	}
	if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
	event.preventDefault()
	const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
	items[next]?.focus()
}
onBeforeUnmount(() => cleanup?.())
</script>

<template>
	<button
		ref="trigger"
		type="button"
		class="chat-menu-trigger"
		:disabled="disabled"
		:aria-label="t('chatHistory.options', {title: conversation.title || t('chat.untitled')})"
		aria-haspopup="menu"
		:aria-expanded="open"
		@click="menu?.togglePopover()"
	>
		<Icon icon="ellipsis-h" />
	</button>
	<div
		ref="menu"
		popover="auto"
		class="chat-options"
		role="menu"
		:aria-label="t('chatHistory.menu')"
		@toggle="toggle"
		@keydown="keydown"
	>
		<button
			role="menuitem"
			@click="choose('pin')"
		>
			<Icon :icon="faThumbtack" />{{ t(conversation.pinned ? 'chatHistory.unpin' : 'chatHistory.pin') }}
		</button>
		<button
			role="menuitem"
			@click="choose('rename')"
		>
			<Icon icon="pen" />{{ t('chat.rename') }}
		</button>
		<template v-if="current">
			<button
				role="menuitem"
				@click="choose('export')"
			>
				<Icon icon="download" />{{ t('chatFiles.export') }}
			</button>
			<button
				role="menuitem"
				:disabled="conversation.running || !canCompact"
				@click="choose('compact')"
			>
				<Icon icon="compress" />{{ t('chat.compact') }}
			</button>
		</template>
		<button
			role="menuitem"
			@click="choose('archive')"
		>
			<Icon icon="archive" />{{ t(conversation.archived ? 'chatHistory.restore' : 'chatHistory.archive') }}
		</button>
		<hr>
		<button
			role="menuitem"
			class="danger"
			:disabled="conversation.running"
			@click="choose('delete')"
		>
			<Icon icon="trash-alt" />{{ t('chat.delete') }}
		</button>
		<p v-if="conversation.running">
			{{ t('chatHistory.runningHint') }}
		</p>
	</div>
</template>

<style scoped lang="scss">
.chat-menu-trigger {
	display: inline-flex;
	flex: 0 0 auto;
	align-items: center;
	justify-content: center;
	inline-size: var(--control-height);
	block-size: var(--control-height);
	padding: 0;
	border: 0;
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--text-secondary);
	cursor: pointer;

	&:hover,
	&[aria-expanded='true'] {
		background: var(--surface-hover);
		color: var(--text-primary);
	}

	&:focus-visible {
		@include focus-ring;
	}

	&:disabled {
		opacity: .5;
		cursor: not-allowed;
	}

	svg {
		display: block;
		inline-size: 1rem;
		block-size: 1rem;
	}
}

.chat-options {
	position: fixed;
	inset: auto;
	inline-size: min(15rem, calc(100vw - 1rem));
	max-block-size: min(30rem, 80dvh);
	margin: 0;
	padding: var(--space-1);
	overflow: auto;
	border: 1px solid var(--border-default);
	border-radius: var(--radius-md);
	background: var(--surface-raised);
	box-shadow: var(--elevation-3);
	color: var(--text-primary);

	button {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		inline-size: 100%;
		min-block-size: var(--control-height);
		padding: var(--space-1) var(--space-3);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--text-md);
		text-align: start;
		cursor: pointer;

		&:hover,
		&:focus-visible {
			background: var(--surface-hover);
		}

		&:focus-visible {
			outline: 2px solid var(--focus-ring-color);
			outline-offset: -2px;
		}

		&:disabled {
			opacity: .45;
			cursor: not-allowed;
		}

		&.danger {
			color: var(--danger-text);
		}
	}

	svg {
		flex: 0 0 1rem;
		inline-size: 1rem;
		block-size: 1rem;
		color: var(--text-tertiary);
	}

	.danger svg {
		color: inherit;
	}

	hr {
		block-size: 1px;
		margin: var(--space-1) var(--space-2);
		background: var(--border-subtle);
	}

	p {
		margin: 0;
		padding: var(--space-1) var(--space-3) var(--space-2);
		color: var(--text-tertiary);
		font-size: var(--text-xs);
		line-height: var(--leading-normal);
	}
}
</style>
