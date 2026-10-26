<template>
	<img
		v-if="url"
		:src="url"
		:alt="file.file?.name || ''"
		loading="lazy"
	>
	<span
		v-else
		class="drive-file-symbol"
		aria-hidden="true"
	><Icon :icon="image ? 'image' : 'file'" /></span>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {useObjectUrl} from '@vueuse/core'
import type {DriveEntry} from '@/client/queries/drive'
import {drivePreviewQuery} from '@/client/queries/drive'
const props = defineProps<{file: DriveEntry}>()
const image = computed(() => /^image\/(png|jpeg|webp|gif)$/.test(props.file.file?.mime ?? '') && (props.file.file?.size ?? 0) < 50 * 1024 * 1024)
const query = useQuery(computed(() => ({...drivePreviewQuery(props.file.file_id), enabled: image.value})))
const url = useObjectUrl(computed(() => image.value ? query.data.value : undefined))
</script>

<style scoped>
img {
inline-size: 100%;
block-size: 100%;
object-fit: cover;
}
.drive-file-symbol {
display: grid;
place-items: center;
block-size: 100%;
font-size: 2.5rem;
color: var(--primary);
}
</style>
