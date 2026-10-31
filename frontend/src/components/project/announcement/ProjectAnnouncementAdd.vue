<template>
	<XButton
		v-if="announcement && canAdd"
		variant="tertiary"
		icon="bullhorn"
		class="project-announcement-add"
		:shadow="false"
		@click="emit('add', announcement)"
	>
		<span class="project-announcement-add__label">{{ $t('project.announcement.add') }}</span>
		<span class="project-announcement-add__label is-short">{{ $t('project.announcement.addShort') }}</span>
	</XButton>
</template>

<script setup lang="ts">
import {computed} from 'vue'

import XButton from '@/components/input/Button.vue'

import type {ProjectAnnouncementResponse} from '@/client/queries/projectAnnouncements'
import {useProjectAnnouncement} from '@/composables/useProjectAnnouncement'

import {canEditAnnouncement, isAnnouncementEmpty} from './announcementState'

const props = defineProps<{
	projectId: number
	archived: boolean
}>()

const emit = defineEmits<{
	add: [announcement: ProjectAnnouncementResponse]
}>()

const {announcement} = useProjectAnnouncement(() => props.projectId)

// Only while there is nothing to show: an existing notice is edited from its own bar.
const canAdd = computed(() => announcement.value !== null &&
	isAnnouncementEmpty(announcement.value.title, announcement.value.content) &&
	canEditAnnouncement(announcement.value, props.archived))
</script>

<style lang="scss" scoped>
// Hidden with display so the accessible name is always the label that is visible.
.project-announcement-add__label.is-short {
	display: none;
}

@media screen and (max-width: $tablet) {
	.project-announcement-add__label {
		display: none;

		&.is-short {
			display: inline;
		}
	}
}

@media (pointer: coarse) {
	.project-announcement-add.button {
		min-block-size: var(--target-min);
	}
}
</style>
