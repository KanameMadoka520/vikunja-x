<script setup lang="ts">
import {watch, ref, nextTick} from 'vue'
import {useI18n} from 'vue-i18n'
import {imagePrompt, uploads, uploadsExpanded, type ImageChoice} from '@/helpers/uploadTransport'
const {t} = useI18n({useScope: 'global'})
const dialog = ref<HTMLDialogElement>()
const mode = ref<'original' | 'webp'>('original')
const quality = ref(.85)
const maxSide = ref(2560)
let restoreFocus: HTMLElement | null = null
watch(imagePrompt, async prompt => {
	if (prompt) { mode.value = 'original'; restoreFocus = document.activeElement as HTMLElement; await nextTick(); dialog.value?.showModal() }
	else { dialog.value?.close(); restoreFocus?.focus() }
})
function finish(accepted: boolean) {
	imagePrompt.value?.resolve(accepted ? {mode: mode.value, quality: quality.value, maxSide: maxSide.value} satisfies ImageChoice : null)
}
function size(bytes: number) { return (bytes / 1024 / 1024).toFixed(2) + ' MiB' }
</script>

<template>
	<dialog
		ref="dialog"
		class="image-upload-dialog"
		:aria-label="t('flow.imageChoice')"
		@cancel.prevent="finish(false)"
	>
		<h2>{{ t('flow.imageChoice') }}</h2>
		<p>{{ t('flow.imageNote') }}</p>
		<ul>
			<li
				v-for="file in imagePrompt?.files"
				:key="file.name"
			>
				{{ file.name }} · {{ size(file.size) }}
			</li>
		</ul>
		<label class="image-choice"><input
			v-model="mode"
			type="radio"
			value="original"
			name="image-format"
		>{{ t('flow.original') }}</label>
		<label class="image-choice"><input
			v-model="mode"
			type="radio"
			value="webp"
			name="image-format"
		>{{ t('flow.webp') }}</label>
		<div
			v-if="mode === 'webp'"
			class="image-options"
		>
			<label>{{ t('flow.quality') }} · {{ Math.round(quality * 100) }}%<input
				v-model.number="quality"
				type="range"
				min="0.6"
				max="1"
				step="0.05"
			></label>
			<label>{{ t('flow.maxSide') }}<select v-model.number="maxSide"><option :value="1280">1280 px</option><option :value="2560">2560 px</option><option :value="4096">4096 px</option><option :value="0">{{ t('flow.keepSize') }}</option></select></label>
			<p>{{ t('flow.animationKept') }}</p>
		</div>
		<footer>
			<XButton
				variant="secondary"
				@click="finish(false)"
			>
				{{ t('misc.cancel') }}
			</XButton><XButton @click="finish(true)">
				{{ t('flow.startUpload') }}
			</XButton>
		</footer>
	</dialog>
	<aside
		v-if="uploads.length"
		class="upload-center"
		:aria-label="t('flow.uploads')"
	>
		<button
			class="upload-center-heading"
			@click="uploadsExpanded = !uploadsExpanded"
		>
			{{ t('flow.uploads') }} · {{ uploads.filter(row => !['done','error','cancelled'].includes(row.stage)).length }} <span>{{ uploadsExpanded ? '−' : '+' }}</span>
		</button>
		<div
			v-if="uploadsExpanded"
			class="upload-rows"
		>
			<section
				v-for="row in uploads"
				:key="row.id"
				class="upload-row"
			>
				<strong>{{ row.names }}</strong><span role="status">{{ t(`flow.${row.stage}`) }}<template v-if="row.stage === 'uploading' && row.total"> · {{ Math.floor(row.loaded / row.total * 100) }}%</template></span>
				<progress
					v-if="!['done','error','cancelled'].includes(row.stage)"
					:value="row.stage === 'uploading' && row.total ? row.loaded : undefined"
					:max="row.total || 1"
					:aria-label="t(`flow.${row.stage}`)"
				/>
				<small v-if="row.sentBytes">{{ size(row.originalBytes) }} → {{ size(row.sentBytes) }}</small><small v-if="row.error">{{ row.error }}</small>
			</section>
			<button
				class="clear-uploads"
				@click="uploads = uploads.filter(row => !['done','error','cancelled'].includes(row.stage))"
			>
				{{ t('flow.clearFinished') }}
			</button>
		</div>
	</aside>
</template>

<style scoped lang="scss">
.image-upload-dialog { border: 1px solid var(--grey-200);
border-radius: 1.25rem;
padding: 1.5rem;
background: var(--site-background);
color: var(--text);
inline-size: min(92vw, 32rem);
max-block-size: 90dvh;
overflow: auto;
box-shadow: 0 24px 80px #00000044;
}
.image-upload-dialog::backdrop { background: #00000055;
backdrop-filter: blur(5px);
}
.image-upload-dialog h2 { font-size: 1.3rem;
margin-block-end: .75rem;
}
.image-upload-dialog p, .image-upload-dialog li { font-size: .85rem;
overflow-wrap: anywhere;
}
.image-upload-dialog footer { display: flex;
justify-content: flex-end;
gap: .75rem;
margin-block-start: 1.25rem;
}
.image-choice { display: flex;
gap: .75rem;
padding: .85rem;
border: 1px solid var(--grey-200);
border-radius: .75rem;
margin-block: .5rem;
cursor: pointer;
}
.image-choice:has(input:checked) { border-color: var(--primary);
background: var(--grey-100);
}
.image-options label { display: grid;
gap: .5rem;
margin-block: .75rem;
}
.upload-center { position: fixed;
z-index: 10000;
inset-inline-end: 1rem;
inset-block-end: 1rem;
inline-size: min(22rem, calc(100vw - 2rem));
background: var(--site-background);
color: var(--text);
border: 1px solid var(--grey-200);
border-radius: 1rem;
box-shadow: 0 12px 40px #00000022;
overflow: hidden;
}
.upload-center-heading { display: flex;
justify-content: space-between;
inline-size: 100%;
padding: .85rem 1rem;
background: var(--grey-100);
border: 0;
color: inherit;
cursor: pointer;
}
.upload-rows { max-block-size: 35dvh;
overflow: auto;
padding: .75rem 1rem;
}
.upload-row { display: grid;
gap: .35rem;
margin-block-end: .8rem;
font-size: .8rem;
overflow-wrap: anywhere;
}
.upload-row progress { inline-size: 100%;
block-size: .35rem;
accent-color: var(--primary);
}
.upload-row small, .upload-row span { color: var(--text-light);
}
.clear-uploads { border: 0;
background: transparent;
color: var(--primary);
cursor: pointer;
font-size: .8rem;
}
</style>
