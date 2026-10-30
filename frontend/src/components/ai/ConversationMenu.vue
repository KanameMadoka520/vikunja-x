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
	if (event.key === 'Escape' || event.key === 'Tab') { menu.value?.hidePopover(); if (event.key === 'Escape') { event.preventDefault(); trigger.value?.focus() } return }
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
.chat-menu-trigger { display: grid;
place-items: center;
flex: 0 0 36px;
inline-size: 36px;
block-size: 40px;
padding: 0;
border: 0;
border-radius: .6rem;
color: var(--text-light);
background: transparent;
cursor: pointer;
}
.chat-menu-trigger:hover, .chat-menu-trigger[aria-expanded='true'] { background: var(--grey-200);
color: var(--text);
}
.chat-menu-trigger svg { display: block;
inline-size: 1rem;
block-size: 1rem;
}
.chat-options { position: fixed;
inset: auto;
margin: 0;
padding: .4rem;
border: 1px solid var(--grey-200);
border-radius: .9rem;
background: var(--scheme-main);
color: var(--text);
box-shadow: var(--shadow-md);
inline-size: min(240px, calc(100vw - 16px));
max-block-size: min(480px, 80dvh);
overflow: auto;
}
.chat-options button { display: flex;
align-items: center;
gap: .75rem;
inline-size: 100%;
min-block-size: 42px;
border: 0;
border-radius: .5rem;
padding: .55rem .7rem;
background: transparent;
color: inherit;
font: inherit;
font-size: .875rem;
text-align: start;
cursor: pointer;
}
.chat-options button:hover, .chat-options button:focus-visible { background: var(--grey-100);
}
.chat-options button:disabled { opacity: .45;
cursor: not-allowed;
}
.chat-options button.danger { color: var(--danger);
}
.chat-options svg { flex: 0 0 1rem;
inline-size: 1rem;
block-size: 1rem;
}
.chat-options hr { margin: .3rem;
background: var(--grey-200);
block-size: 1px;
}
.chat-options p { font-size: .75rem;
color: var(--text-light);
padding: .4rem .7rem;
margin: 0;
line-height: 1.5;
}
</style>
