<template>
	<BaseButton
		v-shortcut="SHORTCUTS.toggleMenu"
		class="menu-show-button"
		:title="$t('keyboardShortcuts.toggleMenu')"
		:aria-label="menuActive ? $t('misc.hideMenu') : $t('misc.showMenu')"
		:aria-expanded="menuActive"
		aria-controls="app-sidebar"
		@click="baseStore.toggleMenu()"
	/>
</template>

<script setup lang="ts">
import {computed} from 'vue'

import {SHORTCUTS} from '@/constants/shortcuts'
import {useBaseStore} from '@/stores/base'

import BaseButton from '@/components/base/BaseButton.vue'

const baseStore = useBaseStore()
const menuActive = computed(() => baseStore.menuActive)
</script>

<style lang="scss" scoped>
$line-width: 1.125rem;

.menu-show-button {
	position: relative;
	flex-shrink: 0;
	inline-size: var(--navbar-button-size, 2.25rem);
	block-size: var(--navbar-button-size, 2.25rem);
	border-radius: $radius;

	&::before,
	&::after {
		content: '';
		position: absolute;
		inset-inline: 0;
		inset-block-start: 50%;
		display: block;
		inline-size: $line-width;
		block-size: 2px;
		margin-inline: auto;
		margin-block-start: -1px;
		border-radius: var(--radius-full);
		background-color: var(--text-secondary);
		transition:
			transform var(--motion-fast) var(--ease-standard),
			background-color var(--motion-fast) var(--ease-standard);
	}

	&::before {
		transform: translateY(-.25rem);
	}

	&::after {
		transform: translateY(.25rem);
	}

	&:hover {
		background-color: var(--surface-hover);
	}

	&:hover,
	&:focus-visible {
		&::before,
		&::after {
			background-color: var(--text-primary);
		}

		&::before {
			transform: translateY(-.3125rem);
		}

		&::after {
			transform: translateY(.3125rem);
		}
	}
}
</style>
