<template>
	<div
		class="card"
		:class="{'has-no-shadow': !shadow}"
	>
		<header
			v-if="title !== ''"
			class="card-header"
		>
			<component
				:is="`h${titleLevel}`"
				class="card-header-title"
			>
				{{ title }}
			</component>
			<BaseButton
				v-if="showClose"
				class="card-header-icon close"
				:aria-label="$t('misc.close')"
				@click="$emit('close')"
			>	
				<span class="icon">
					<Icon icon="times" />
				</span>
			</BaseButton>
		</header>
		<div
			class="card-content loader-container"
			:class="{
				'p-0': !padding,
				'is-loading': showLoading
			}"
		>
			<div :class="{'content': hasContent}">
				<slot />
			</div>
		</div>

		<footer
			v-if="$slots.footer"
			class="card-footer"
		>
			<slot name="footer" />
		</footer>
	</div>
</template>

<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import {useDelayedLoading} from '@/composables/useDelayedLoading'

const props = withDefaults(defineProps<{
	title?: string
	padding?: boolean
	shadow?: boolean
	hasContent?: boolean
	loading?: boolean
	showClose?: boolean
	/** Card titles are section headings in the page outline. */
	titleLevel?: 2 | 3
}>(), {
	title: '',
	padding: true,
	shadow: true,
	hasContent: true,
	loading: false,
	showClose: false,
	titleLevel: 2,
})

defineEmits<{
	'close': []
}>()

const showLoading = useDelayedLoading(() => props.loading)
</script>

<style lang="scss" scoped>
.card {
	background-color: var(--surface);
	border-radius: var(--radius-md);
	margin-block-end: 1rem;
	border: 1px solid var(--border-subtle);
	box-shadow: var(--elevation-1);
	color: var(--text);
	max-inline-size: 100%;
	position: relative;

	@media print {
		box-shadow: none;
		border: none;
	}
}

.card-header {
	background-color: transparent;
	align-items: stretch;
	display: flex;
	box-shadow: none;
	border-block-end: 1px solid var(--border-subtle);
	border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.card-header-title {
	margin: 0;
	align-items: center;
	color: var(--text-strong);
	display: flex;
	flex-grow: 1;
	font-size: var(--text-base);
	font-weight: var(--weight-semibold);
	padding: .7rem 1rem;

	&.is-centered {
		justify-content: center;
	}
}

.card-header-icon {
	align-items: center;
	cursor: pointer;
	display: flex;
	justify-content: center;
	padding: .7rem 1rem;
	color: var(--text-secondary);
	border-radius: var(--radius-sm);

	&:hover {
		color: var(--text-primary);
	}
}

.card-content {
	background-color: transparent;
	padding: 1.25rem;

	&:first-child {
		border-start-start-radius: var(--radius-md);
		border-start-end-radius: var(--radius-md);
	}

	&:last-child {
		border-end-start-radius: var(--radius-md);
		border-end-end-radius: var(--radius-md);
	}

	// Utility classes like .p-0 are defined globally with lower specificity
	// than Vue-scoped selectors; restore precedence explicitly.
	&.p-0 {
		padding: 0;
	}

	@media screen and (max-width: $tablet) {
		padding: 1rem;
	}
}

.card-footer {
	align-items: center;
	gap: .5rem;
	background-color: var(--surface-sunken);
	border-block-start: 1px solid var(--border-subtle);
	border-end-start-radius: var(--radius-md);
	border-end-end-radius: var(--radius-md);
	padding: .75rem 1.25rem;
	display: flex;
	justify-content: flex-end;
}
</style>
