<script setup lang="ts" generic="T extends string">
import {type ComponentPublicInstance, nextTick, ref, watch} from 'vue'

const props = withDefaults(defineProps<{
	options: T[],
	suggestion?: string,
	maxHeight?: number,
}>(), {
	maxHeight: 200,
	suggestion: '',
})

const emit = defineEmits(['blur'])

const ESCAPE = 27,
	ARROW_UP = 38,
	ARROW_DOWN = 40

type StateType = 'unfocused' | 'focused'

const selectedIndex = ref(-1)
const state = ref<StateType>('unfocused')
const val = ref<string>('')
const model = defineModel<string>()

const suggestionScrollerRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const editorRef = ref<HTMLTextAreaElement | null>(null)

watch(
	() => model.value,
	newValue => {
		val.value = newValue ?? ''
	},
)

function updateSuggestionScroll() {
	nextTick(() => {
		const scroller = suggestionScrollerRef.value
		if (!scroller) return

		const selectedItem = scroller.querySelector('.selected')
		if (selectedItem && selectedItem instanceof HTMLElement) {
			scroller.scrollTop = selectedItem.offsetTop
		} else {
			scroller.scrollTop = 0
		}
	})
}

function setState(stateName: StateType) {
	state.value = stateName
	if (stateName === 'unfocused') {
		emit('blur')
	}
}

function onFocusField() {
	setState('focused')
}

function onKeydown(e: KeyboardEvent) {
	switch (e.keyCode || e.which) {
		case ESCAPE:
			e.preventDefault()
			setState('unfocused')
			break
		case ARROW_UP:
			e.preventDefault()
			select(-1)
			break
		case ARROW_DOWN:
			e.preventDefault()
			select(1)
			break
	}
}

const resultRefs = ref<(HTMLElement | null)[]>([])

function setResultRefs(el: Element | ComponentPublicInstance | null, index: number) {
	resultRefs.value[index] = el as (HTMLElement | null)
}

function select(offset: number) {

	let index = selectedIndex.value + offset

	if (!isFinite(index)) {
		index = 0
	}

	if (index >= props.options.length) {
		// At the last index, now moving back to the top
		index = 0
	}

	if (index < 0) {
		// Arrow up but we're already at the top
		index = props.options.length - 1
	}
	const elems = resultRefs.value[index]
	if (
		typeof elems === 'undefined'
	) {
		return
	}

	selectedIndex.value = index
	updateSuggestionScroll()

	if (Array.isArray(elems)) {
		elems[0].focus()
		return
	}
	elems?.focus()
}

function onSelectValue(value: T) {
	model.value = value
	selectedIndex.value = 0
	setState('unfocused')
}

function onUpdateField(e: Event) {
	setState('focused')
	model.value = (e.currentTarget as HTMLTextAreaElement).value
}
</script>

<template>
	<div
		ref="containerRef"
		class="autocomplete"
	>
		<div class="entry-box">
			<slot
				name="input"
				:on-update-field
				:on-focus-field
				:on-keydown
			>
				<textarea
					ref="editorRef"
					class="field"
					:class="state"
					:value="val"
					@input="onUpdateField"
					@focus="onFocusField"
					@keydown="onKeydown"
				/>
			</slot>
		</div>
		<div
			v-if="state === 'focused' && options.length"
			class="suggestion-list"
		>
			<div
				v-if="options && options.length"
				class="scroll-list"
			>
				<div
					ref="suggestionScrollerRef"
					class="items"
					@keydown="onKeydown"
				>
					<button
						v-for="(item, index) in options"
						:key="item"
						:ref="(el: Element | ComponentPublicInstance | null) => setResultRefs(el, index)"
						type="button"
						class="item"
						:class="{ selected: index === selectedIndex }"
						@click="onSelectValue(item)"
					>
						<slot
							name="result"
							:item
							:selected="index === selectedIndex"
						>
							{{ item }}
						</slot>
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped lang="scss">
.autocomplete {
	position: relative;

	.suggestion-list {
		position: absolute;
		z-index: var(--layer-dropdown);
		min-inline-size: 100%;
		max-inline-size: 100%;
		max-block-size: 50vh;
		overflow: auto;
		margin-block-start: var(--space-1);
		padding: var(--space-1);

		background-color: var(--surface-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		box-shadow: var(--elevation-3);

		button {
			display: flex;
			align-items: center;
			inline-size: 100%;
			min-block-size: 2rem;
			padding: 0 var(--space-2);
			border: none;
			border-radius: var(--radius-sm);
			background: transparent;
			color: var(--text-primary);
			font-family: $family-sans-serif;
			font-size: var(--text-md);
			font-weight: var(--weight-regular);
			text-align: start;
			text-transform: none;
			cursor: pointer;

			&:hover,
			&:focus,
			&.selected {
				background-color: var(--surface-hover);
			}

			&:focus-visible {
				outline-offset: -2px;
			}

			&:active {
				background-color: var(--surface-active);
			}
		}
	}
}
</style>
