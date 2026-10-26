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

<style scoped>.drive-page {
max-inline-size: 90rem;
margin-inline: auto;
padding: clamp(.75rem, 2vw, 2rem);
}</style>
