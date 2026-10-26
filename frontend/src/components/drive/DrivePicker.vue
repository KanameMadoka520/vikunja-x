<template>
	<Modal
		:enabled="true"
		:wide="true"
		:aria-label="$t('drive.choose')"
		@close="!busy && $emit('close')"
	>
		<div class="drive-picker">
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
padding: 1.5rem;
max-block-size: 80dvh;
overflow-y: auto;
}</style>
