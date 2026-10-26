<template>
	<Modal
		class="drive-dialog"
		:enabled="true"
		:wide="true"
		:aria-label="$t('drive.choose')"
		@close="!busy && $emit('close')"
	>
		<div class="drive-picker">
			<div class="drive-picker-close">
				<XButton
					icon="times"
					variant="tertiary"
					:aria-label="$t('misc.closeDialog')"
					:disabled="busy"
					@click="$emit('close')"
				/>
			</div>
			<DriveBrowser
				picker
				:images="images"
				:busy="busy"
				@select="$emit('select', $event)"
			/><p
				v-if="busy"
				role="status"
			>
				{{ $t('drive.applying') }}
			</p>
		</div>
	</Modal>
</template>

<script setup lang="ts">
import type {DriveEntry} from '@/client/queries/drive'
import Modal from '@/components/misc/Modal.vue'
import DriveBrowser from './DriveBrowser.vue'
defineProps<{images?: boolean, busy?: boolean}>()
defineEmits<{close: [], select: [file: DriveEntry]}>()
</script>

<style scoped>.drive-picker {
padding: clamp(1rem, 3vw, 1.5rem);
background: var(--site-background);
color: var(--text);
border: 1px solid var(--grey-200);
border-radius: 1.25rem;
box-shadow: 0 24px 80px rgb(0 0 0 / 20%);
max-block-size: 80dvh;
overflow-y: auto;
}.drive-picker-close {display: flex;
justify-content: flex-end;
margin-block-end: .5rem;} .drive-picker :deep(.input) {
background: var(--site-background);
color: var(--text);
}
.drive-picker :deep(.input::placeholder) {
color: var(--text-light);
opacity: 1;
}
.drive-picker :deep(.button.is-text) {
color: var(--text);
}
@media (width <= 600px) {
:global(.drive-dialog .modal-container .modal-content.is-wide) {
margin: 1rem auto;
}
}
</style>
