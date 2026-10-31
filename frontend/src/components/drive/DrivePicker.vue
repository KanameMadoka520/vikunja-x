<template>
	<Modal
		class="drive-dialog"
		:enabled="true"
		:wide="true"
		:aria-label="$t('drive.choose')"
		@close="close"
	>
		<div class="drive-picker">
			<DriveBrowser
				picker
				:images="images"
				:busy="busy"
				@select="$emit('select', $event)"
			>
				<template #picker-actions>
					<XButton
						icon="times"
						variant="tertiary"
						:aria-label="$t('misc.closeDialog')"
						:aria-disabled="busy || undefined"
						@click="close"
					/>
				</template>
			</DriveBrowser>
		</div>
	</Modal>
</template>

<script setup lang="ts">
import type {DriveEntry} from '@/client/queries/drive'
import Modal from '@/components/misc/Modal.vue'
import DriveBrowser from './DriveBrowser.vue'

const props = defineProps<{
	images?: boolean
	busy?: boolean
}>()
const emit = defineEmits<{
	close: []
	select: [file: DriveEntry]
}>()

function close() {
	if (!props.busy) emit('close')
}
</script>

<style scoped lang="scss">
.drive-picker {
	max-block-size: min(80dvh, 52rem);
	overflow-y: auto;
	overscroll-behavior: contain;
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-lg);
	background: var(--surface-raised);
	box-shadow: var(--elevation-3);
	color: var(--text-primary);
	text-align: start;

	@media screen and (max-width: $tablet - 1px) {
		max-block-size: calc(100dvh - 2 * var(--space-4));
	}
}
</style>
