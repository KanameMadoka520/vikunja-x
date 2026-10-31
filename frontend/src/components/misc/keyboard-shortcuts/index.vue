<template>
	<Modal @close="close()">
		<Card
			class="has-background-white keyboard-shortcuts"
			:shadow="false"
			:title="$t('keyboardShortcuts.title')"
			:show-close="true"
			@close="close()"
		>
			<template
				v-for="(s, i) in shortcuts"
				:key="i"
			>
				<h3>{{ $t(s.title) }}</h3>

				<Message
					v-if="s.available"
					class="mbe-4"
				>
					{{
						typeof s.available === 'undefined' ?
							$t('keyboardShortcuts.allPages') :
							(
								s.available($route)
									? $t('keyboardShortcuts.currentPageOnly')
									: $t('keyboardShortcuts.somePagesOnly')
							)
					}}
				</Message>

				<dl class="shortcut-list">
					<template
						v-for="(sc, si) in s.shortcuts"
						:key="si"
					>
						<dt class="shortcut-title">
							{{ $t(sc.title) }}
						</dt>
						<Shortcut
							is="dd"
							class="shortcut-keys"
							:keys="sc.keys"
							:combination="sc.combination && $t(`keyboardShortcuts.${sc.combination}`)"
						/>
					</template>
				</dl>
			</template>
		</Card>
	</Modal>
</template>

<script lang="ts" setup>
import {useBaseStore} from '@/stores/base'

import Shortcut from '@/components/misc/Shortcut.vue'
import Message from '@/components/misc/Message.vue'

import {KEYBOARD_SHORTCUTS as shortcuts} from './shortcuts'

function close() {
	useBaseStore().setKeyboardShortcutsActive(false)
}
</script>

<style scoped>
.keyboard-shortcuts {
	text-align: start;
}

h3 {
	margin-block: var(--space-5) var(--space-2);
	color: var(--text-secondary);
	font-size: var(--text-sm);
}

h3:first-child {
	margin-block-start: 0;
}

.message:not(:last-child) {
	margin-block-end: var(--space-3);
}

.message-body {
	padding: var(--space-3);
}

.shortcut-list {
	display: grid;
	grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
	align-items: center;
	gap: var(--space-1) var(--space-4);
	margin: 0;
	font-size: var(--text-md);
}

.shortcut-title {
	padding-block: var(--space-1);
	color: var(--text-primary);
}

.shortcut-keys {
	justify-content: end;
	margin: 0;
}
</style>
