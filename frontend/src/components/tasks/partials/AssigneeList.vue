<script setup lang="ts" generic="T extends IUser">
import {computed} from 'vue'

import type {User as IUser} from '@/client/generated'
import BaseButton from '@/components/base/BaseButton.vue'
import User from '@/components/misc/User.vue'
import {getDisplayName} from '@/helpers/user'

const props = withDefaults(defineProps<{
	assignees: T[],
	disabled?: boolean,
	avatarSize?: number,
	inline?: boolean,
	/** add this boolean prop to enable removal of assignees */
	canRemove?: boolean,
	// Dense rows show only the avatar stack; names stay in the avatar's alt text and tooltip.
	showUsernames?: boolean,
	// Show at most this many avatars and a "+N" bubble for the rest.
	max?: number,
}>(), {
	avatarSize: 30,
	inline: false,
	canRemove: false,
	showUsernames: true,
	max: undefined,
})

defineEmits<{
	remove: [user: T],
}>()

const shownAssignees = computed(() => props.max === undefined
	? props.assignees
	: props.assignees.slice(0, props.max))
const hiddenNames = computed(() => props.assignees
	.slice(shownAssignees.value.length)
	.map(user => getDisplayName(user))
	.join(', '))
const hiddenCount = computed(() => props.assignees.length - shownAssignees.value.length)
</script>

<template>
	<div
		class="assignees-list"
		:class="{'is-inline': inline, 'is-avatars-only': !showUsernames}"
		:style="{'--assignee-size': `${avatarSize}px`}"
	>
		<span
			v-for="user in shownAssignees"
			:key="user.id"
			class="assignee"
		>
			<User
				:key="'user'+user.id"
				:avatar-size="avatarSize"
				:show-username="showUsernames"
				:user="user"
				:class="{'m-2': canRemove && !disabled}"
			/>
			<BaseButton
				v-if="canRemove && !disabled"
				:key="'delete'+user.id"
				class="remove-assignee"
				:aria-label="$t('task.detail.removeAssignee', {user: user.name || user.username})"
				@click="$emit('remove', user)"
			>
				<Icon icon="times" />
			</BaseButton>
		</span>
		<span
			v-if="hiddenCount > 0"
			v-tooltip="hiddenNames"
			class="assignee assignee-more"
		>
			<span aria-hidden="true">+{{ hiddenCount }}</span>
			<span class="is-sr-only">{{ hiddenNames }}</span>
		</span>
	</div>
</template>

<style scoped lang="scss">
.assignees-list {
	display: flex;
	align-items: center;

	// Hide usernames on desktop, show on mobile
	:deep(.user .username) {
		@media screen and (min-width: $tablet) {
			display: none;
		}
	}

	:deep(.user) {
		display: flex;
		align-content: center;
		align-items: center;
		gap: var(--space-2);
	}

	:deep(.user > .username) {
		font-size: var(--text-xs);
	}

	&.is-inline {
		:deep(.user) {
			display: inline;
			text-wrap: nowrap;
		}
	}

	&.is-avatars-only :deep(.user) {
		display: inline-flex;
		gap: 0;
	}

	&.is-avatars-only :deep(.avatar-wrapper) {
		margin-inline-end: 0;
	}
}

.assignee {
	position: relative;

	&:not(:first-child) {
		margin-inline-start: calc(var(--assignee-size) * -.3);
	}

	:deep(.user img) {
		border: 2px solid var(--surface);
		margin-inline-end: 0;
	}
}

.assignee-more {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: var(--assignee-size);
	block-size: var(--assignee-size);
	padding-inline: var(--space-1);
	border: 2px solid var(--surface);
	border-radius: var(--radius-full);
	background: var(--surface-sunken);
	color: var(--text-secondary);
	font-size: var(--text-2xs);
	font-weight: var(--weight-semibold);
	font-variant-numeric: tabular-nums;
}

.remove-assignee {
	position: absolute;
	inset-block-start: 4px;
	inset-inline-start: 2px;
	color: var(--danger-text);
	background: var(--surface-raised);
	display: block;
	border-radius: var(--radius-full);
	font-size: var(--text-xs);
	inline-size: 18px;
	block-size: 18px;
	// Only needs to beat the overlapping sibling avatars, so keep it low enough
	// for popups like the bucket dropdown (z-index 20) to paint above it.
	z-index: 1;
}
</style>
