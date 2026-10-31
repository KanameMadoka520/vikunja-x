<template>
	<div class="color-picker-container">
		<datalist :id="colorListID">
			<option
				v-for="defaultColor in defaultColors"
				:key="defaultColor"
				:value="defaultColor"
			/>
		</datalist>
		
		<div class="picker">
			<input
				:value="color"
				class="picker__input"
				type="color"
				:list="colorListID"
				:class="{'is-empty': isEmpty}"
				:aria-label="label || $t('input.projectColor')"
				@input="onInput"
			>
			<svg
				v-show="isEmpty"
				class="picker__pattern"
				viewBox="0 0 22 22"
				fill="fff"
			>
				<pattern
					id="checker"
					width="11"
					height="11"
					patternUnits="userSpaceOnUse"
					fill="FFF"
				>
					<rect
						fill="#cccccc"
						x="0"
						width="5.5"
						height="5.5"
						y="0"
					/>
					<rect
						fill="#cccccc"
						x="5.5"
						width="5.5"
						height="5.5"
						y="5.5"
					/>
				</pattern>
				<rect
					width="22"
					height="22"
					fill="url(#checker)"
				/>
			</svg>
		</div>

		<details
			class="color-presets"
			@toggle="positionPalette"
		>
			<summary ref="paletteAnchor">
				{{ $t('flow.colorPalette') }}
			</summary><div
				ref="palettePanel"
				class="palette-panel"
				:style="palettePosition"
			>
				<select
					v-model="palette"
					:aria-label="$t('flow.colorPalette')"
				>
					<option
						v-for="(_, name) in palettes"
						:key="name"
						:value="name"
					>
						{{ $t(`flow.palette_${name}`) }}
					</option>
				</select><div class="swatches">
					<button
						v-for="swatch in palettes[palette]"
						:key="swatch"
						type="button"
						:style="{background: swatch}"
						:aria-label="swatch"
						:aria-pressed="color.toLowerCase() === swatch"
						@click="color = swatch; update(true)"
					/>
				</div>
			</div>
		</details>
		<XButton
			v-if="!isEmpty"
			:disabled="isEmpty"
			class="is-small mis-2"
			:shadow="false"
			variant="secondary"
			@click="reset"
		>
			{{ $t('input.resetColor') }}
		</XButton>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, watch, nextTick, onBeforeUnmount} from 'vue'
import {computePosition, autoUpdate, offset, flip, shift} from '@floating-ui/dom'
import {createRandomID} from '@/helpers/randomId'
import XButton from '@/components/input/Button.vue'

const {label = ''} = defineProps<{
	/** Accessible name of the colour input; defaults to the project colour wording. */
	label?: string
}>()

const model = defineModel<string>({ required: true })

const palettes = {
	vivid: ['#1973ff','#4f46e5','#7c3aed','#c026d3','#db2777','#e11d48','#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e','#10b981','#14b8a6','#06b6d4','#0ea5e9'],
	soft: ['#bfdbfe','#c7d2fe','#ddd6fe','#f5d0fe','#fbcfe8','#fecdd3','#fecaca','#fed7aa','#fde68a','#fef08a','#d9f99d','#bbf7d0','#a7f3d0','#99f6e4','#a5f3fc','#bae6fd'],
	earth: ['#1e3a8a','#312e81','#581c87','#701a75','#831843','#881337','#7f1d1d','#9a3412','#92400e','#854d0e','#3f6212','#14532d','#064e3b','#134e4a','#164e63','#0c4a6e'],
	neutral: ['#ffffff','#f8fafc','#e2e8f0','#cbd5e1','#94a3b8','#64748b','#475569','#334155','#1e293b','#0f172a','#000000','#78716c','#a8a29e','#d6d3d1','#e7e5e4','#fafaf9'],
}
const palette = ref<keyof typeof palettes>('vivid')
const paletteAnchor = ref<HTMLElement>()
const palettePanel = ref<HTMLElement>()
const palettePosition = ref({left: '0px', top: '0px'})
let stopPositioning: (() => void) | undefined
onBeforeUnmount(() => stopPositioning?.())
async function positionPalette(event: Event) {
	stopPositioning?.()
	if (!(event.target as HTMLDetailsElement).open) return
	await nextTick()
	const anchor=paletteAnchor.value, panel=palettePanel.value
	if (!anchor || !panel) return
	const update = async () => {
		const {x,y} = await computePosition(anchor,panel,{strategy:'fixed',placement:'bottom-start',middleware:[offset(8),flip(),shift({padding:12})]})
		palettePosition.value={left:`${x}px`,top:`${y}px`}
	}
	stopPositioning=autoUpdate(anchor,panel,update)
}
const DEFAULT_COLORS = Object.values(palettes).flat()

const color = ref('')
const defaultColors = ref(DEFAULT_COLORS)
const colorListID = ref(createRandomID())

watch(
	model,
	(newValue) => {
		if (newValue === '' || newValue.startsWith('var(')) {
			color.value = ''
			return
		}

		if (!newValue.startsWith('#') && (newValue.length === 6 || newValue.length === 3)) {
			newValue = `#${newValue}`
		}

		color.value = newValue
	},
	{immediate: true},
)

const isEmpty = computed(() => color.value === '')

// Not a watcher on color: that would echo parent model changes back as updates (#4156)
function onInput(e: Event) {
	color.value = (e.target as HTMLInputElement).value
	update()
}

function update(force = false) {
	if(isEmpty.value && !force) {
		return
	}

	model.value = color.value
}

function reset() {
	// FIXME: I havn't found a way to make it clear to the user the color war reset.
	//  Not sure if verte is capable of this - it does not show the change when setting this.color = ''
	color.value = ''
	update(true)
}
</script>

<style lang="scss" scoped>
.color-picker-container {
	display: flex;
	justify-content: center;
	align-items: center;

	// reset / see https://stackoverflow.com/a/11471224/15522256
	input[type="color"] {
		appearance: none;
		border: none;
	}
	input[type="color"]::-webkit-color-swatch-wrapper {
		padding: 0;
	}
	input[type="color"]::-webkit-color-swatch {
		border: none;
	}

	$picker-size: 24px;
	$border-width: 1px;
	.picker {
		display: grid;
		inline-size: $picker-size;
		block-size: $picker-size;
		overflow: hidden;
		border-radius: 100%;
		border: $border-width solid var(--border-strong);

		& > * {
			grid-row: 1;
			grid-column: 1;
		}

		&:has(:focus-visible) {
			@include focus-ring;
		}
	}

	input.picker__input {
		padding: 0;
		inline-size: $picker-size - 2 * $border-width;
		block-size: $picker-size - 2 * $border-width;
		cursor: pointer;
	}

	.picker__input.is-empty {
		opacity: 0;
	}

	.picker__pattern {
		pointer-events: none;
	}
}

.color-presets {
	position: relative;
	margin-inline-start: var(--space-2);
	font-size: var(--text-sm);
}

.color-presets summary {
	display: flex;
	align-items: center;
	min-block-size: max(2rem, var(--target-min));
	padding-inline: var(--space-2);
	border-radius: var(--radius-sm);
	color: var(--text-secondary);
	cursor: pointer;

	&:hover {
		background-color: var(--surface-hover);
		color: var(--text-primary);
	}

	// The global ring rule in theme.scss does not cover <summary>.
	&:focus-visible {
		@include focus-ring;
	}
}

.palette-panel {
	position: fixed;
	z-index: var(--layer-dropdown);
	inline-size: min(18rem, calc(100vw - 1.5rem));
	padding: var(--space-3);
}

.palette-panel select {
	inline-size: 100%;
	margin-block-end: var(--space-3);
}

.swatches {
	display: grid;
	grid-template-columns: repeat(8, 1fr);
	gap: var(--space-1);
}

// Swatches include white and near-black, so the edge uses the strong hairline.
.swatches button {
	aspect-ratio: 1;
	min-block-size: 24px;
	border: 1px solid var(--border-strong);
	border-radius: var(--radius-sm);
	cursor: pointer;
	transition: transform var(--motion-fast) var(--ease-standard);

	&:hover {
		transform: scale(1.08);
	}

	&[aria-pressed="true"] {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
}
</style>
