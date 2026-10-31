<template>
	<div class="drive-page">
		<DriveBrowser />
	</div>
</template>

<script setup lang="ts">
import DriveBrowser from '@/components/drive/DriveBrowser.vue'
import {useTitle} from '@/composables/useTitle'
import {useI18n} from 'vue-i18n'

defineOptions({name: 'PersonalDrive'})
const {t} = useI18n()
useTitle(() => t('drive.title'))
</script>

<style scoped lang="scss">
// .app-content already provides the page gutter.
.drive-page {
	max-inline-size: var(--page-max-width);
	margin-inline: auto;
}
</style>
