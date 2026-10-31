<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import {useBaseStore} from '@/stores/base'
import {onBeforeUnmount, onMounted} from 'vue'
import {eventToShortcutString} from '@/helpers/shortcut'
import {isAppleDevice} from '@/helpers/isAppleDevice'

const baseStore = useBaseStore()

const isApple = isAppleDevice()
const keyShortcut = isApple ? 'Meta+K' : 'Control+K'
const shortcutHint = isApple ? '⌘K' : 'Ctrl K'

// See https://github.com/github/hotkey/discussions/85#discussioncomment-5214660
function openQuickActionsViaHotkey(event: KeyboardEvent) {
	const shortcutString = eventToShortcutString(event)
	if (!shortcutString) return

	// On macOS, use Cmd+K (Meta+K), on other platforms use Ctrl+K (Control+K)
	const expectedShortcut = isApple ? 'Meta+KeyK' : 'Control+KeyK'
	if (shortcutString !== expectedShortcut) return

	event.preventDefault()

	openQuickActions()
}

onMounted(() => {
	document.addEventListener('keydown', openQuickActionsViaHotkey)
})

onBeforeUnmount(() => {
	document.removeEventListener('keydown', openQuickActionsViaHotkey)
})

function openQuickActions() {
	baseStore.setQuickActionsActive(true)
}
</script>

<template>
	<BaseButton
		class="trigger-button quick-actions-trigger"
		:title="$t('keyboardShortcuts.quickSearch')"
		:aria-label="$t('keyboardShortcuts.quickSearch')"
		:aria-keyshortcuts="keyShortcut"
		@click="openQuickActions"
	>
		<Icon icon="search" />
		<span
			class="quick-actions-trigger__label"
			aria-hidden="true"
		>{{ $t('navigation.search') }}</span>
		<kbd
			class="quick-actions-trigger__kbd"
			aria-hidden="true"
		>{{ shortcutHint }}</kbd>
	</BaseButton>
</template>

<style lang="scss" scoped>
.quick-actions-trigger__label,
.quick-actions-trigger__kbd {
	display: none;
}

// Wide screens show a search field look-alike with the shortcut, so the palette is discoverable.
@media screen and (width >= 1200px) and (hover: hover) and (pointer: fine) {
	.quick-actions-trigger.trigger-button {
		gap: var(--space-2);
		min-inline-size: 11rem;
		justify-content: flex-start;
		padding-inline: var(--space-3) var(--space-1);
		border: 1px solid var(--border-default);
		background-color: var(--surface);
		color: var(--text-tertiary);
		font-size: var(--text-sm);

		&:hover {
			border-color: var(--border-strong);
			background-color: var(--surface);
			color: var(--text-secondary);
		}

		svg {
			font-size: var(--text-sm);
		}
	}

	.quick-actions-trigger__label {
		display: inline;
		flex: 1 1 auto;
		text-align: start;
	}

	.quick-actions-trigger__kbd {
		display: inline-block;
		padding: 0 var(--space-1);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xs);
		background: var(--surface-sunken);
		color: var(--text-secondary);
		font-family: var(--font-ui);
		font-size: var(--text-2xs);
		line-height: 1.5;
	}
}
</style>
