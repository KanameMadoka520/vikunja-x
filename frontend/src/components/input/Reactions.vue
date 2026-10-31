<script setup lang="ts">
import type {ReactionInput, ReactionUsers} from '@/client/queries/reactions'
import {VuemojiPicker} from 'vuemoji-picker'
import {useSetReactionMutation} from '@/client/queries/reactions'
import BaseButton from '@/components/base/BaseButton.vue'
import {getDisplayName} from '@/helpers/user'
import {useI18n} from 'vue-i18n'
import {nextTick, onBeforeUnmount, onMounted, ref} from 'vue'
import CustomTransition from '@/components/misc/CustomTransition.vue'
import {closeWhenClickedOutside} from '@/helpers/closeWhenClickedOutside'
import {useAuthStore} from '@/stores/auth'
import {useColorScheme} from '@/composables/useColorScheme'

type ReactionSubject = {
	entityKind: 'tasks',
	taskId?: never,
} | {
	entityKind: 'comments',
	taskId: number,
}

const props = withDefaults(defineProps<ReactionSubject & {
	entityId: number,
	modelValue?: ReactionUsers,
	disabled?: boolean,
}>(), {
	modelValue: undefined,
	disabled: false,
})

const authStore = useAuthStore()
const {t} = useI18n()
const reactionMutation = useSetReactionMutation()
const {isDark} = useColorScheme()

async function setReaction(value: string, remove: boolean) {
	if (props.disabled || reactionMutation.isPending.value || !authStore.info) return
	const user = {
		id: authStore.info.id,
		name: authStore.info.name,
		username: authStore.info.username,
	}
	const input: ReactionInput = props.entityKind === 'comments'
		? {
			kind: 'comments',
			taskId: props.taskId,
			id: props.entityId,
			value,
			remove,
			user,
		}
		: {
			kind: 'tasks',
			id: props.entityId,
			value,
			remove,
			user,
		}
	try {
		await reactionMutation.mutateAsync(input)
	} catch {
		return
	}
	if (props.entityId !== input.id || props.entityKind !== input.kind) return
	showEmojiPicker.value = false
}

function addReaction(value: string) {
	return setReaction(value, false)
}

function removeReaction(value: string) {
	return setReaction(value, true)
}

function getReactionTooltip(users: ReactionUsers[string], value: string | number) {
	const names = (users ?? []).map(u => getDisplayName(u))
	const valueStr = String(value)

	if (names.length === 1) {
		return t('reaction.reactedWith', {user: names[0], value: valueStr})
	}

	if (names.length > 1 && names.length < 10) {
		return t('reaction.reactedWithAnd', {
			users: names.slice(0, names.length - 1).join(', '),
			lastUser: names[names.length - 1],
			value: valueStr,
		})
	}

	return t('reaction.reactedWithAndMany', {
		users: names.slice(0, 10).join(', '),
		num: names.length - 10,
		value: valueStr,
	})
}

const showEmojiPicker = ref(false)
const emojiPickerRef = ref<InstanceType<typeof VuemojiPicker> | null>(null)

function hideEmojiPicker(e: MouseEvent) {
	if (showEmojiPicker.value && emojiPickerRef.value?.$el) {
		closeWhenClickedOutside(e, emojiPickerRef.value.$el, () => showEmojiPicker.value = false)
	}
}

onMounted(() => document.addEventListener('click', hideEmojiPicker))
onBeforeUnmount(() => document.removeEventListener('click', hideEmojiPicker))

const emojiPickerButtonRef = ref<InstanceType<typeof BaseButton> | null>(null)

function toggleEmojiPicker() {
	nextTick(() => showEmojiPicker.value = !showEmojiPicker.value)
}

function closeEmojiPicker() {
	showEmojiPicker.value = false
	emojiPickerButtonRef.value?.focus()
}

function hasCurrentUserReactedWithEmoji(value: string | number): boolean {
	if (!props.modelValue || !authStore.info) return false
	const user = props.modelValue[String(value)]?.find(u => u.id === authStore.info!.id)
	return typeof user !== 'undefined'
}

async function toggleReaction(value: string | number) {
	const valueStr = String(value)
	if (hasCurrentUserReactedWithEmoji(valueStr)) {
		return removeReaction(valueStr)
	}

	return addReaction(valueStr)
}
</script>

<template>
	<div class="reactions">
		<BaseButton
			v-for="(users, value) in modelValue"
			:key="'button' + value"
			v-tooltip="getReactionTooltip(users, value)"
			class="reaction-button"
			:class="{'current-user-has-reacted': hasCurrentUserReactedWithEmoji(value)}"
			:disabled="disabled"
			:aria-disabled="reactionMutation.isPending.value || undefined"
			:aria-pressed="hasCurrentUserReactedWithEmoji(value)"
			@click="toggleReaction(value)"
		>
			{{ value }} {{ users?.length }}
		</BaseButton>
		<BaseButton
			v-if="!disabled"
			ref="emojiPickerButtonRef"
			v-tooltip="$t('reaction.add')"
			class="reaction-button"
			@click.stop="toggleEmojiPicker"
		>
			<span class="is-sr-only">{{ $t('reaction.add') }}</span>
			<Icon :icon="['far', 'face-laugh']" />
		</BaseButton>
		<CustomTransition name="fade">
			<!-- preventDefault keeps Escape from also closing a surrounding native <dialog>. -->
			<VuemojiPicker
				v-if="showEmojiPicker"
				ref="emojiPickerRef"
				class="emoji-picker"
				data-source="/emojis.json"
				:is-dark="isDark"
				@emojiClick="detail => addReaction(detail.unicode)"
				@keydown.esc.stop.prevent="closeEmojiPicker"
			/>
		</CustomTransition>
	</div>
</template>

<style scoped lang="scss">
.reactions {
	position: relative;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-1);
}

.reaction-button {
	display: inline-flex;
	align-items: center;
	gap: var(--space-1);
	min-block-size: var(--control-height-sm);
	padding: 0 var(--space-2);
	border: 1px solid var(--border-default);
	background: var(--surface-sunken);
	border-radius: var(--radius-full);
	color: var(--text-secondary);
	font-size: var(--text-xs);
	font-variant-numeric: tabular-nums;
	transition:
		background-color var(--motion-fast) var(--ease-standard),
		border-color var(--motion-fast) var(--ease-standard);

	&:hover:not([disabled], [aria-disabled="true"]) {
		border-color: var(--border-strong);
		background-color: var(--surface-hover);
	}

	&.current-user-has-reacted {
		border-color: var(--primary);
		background-color: var(--surface-selected);
		color: var(--accent-text);
	}
}

.emoji-picker {
	position: absolute;
	inset-block-start: 100%;
	inset-inline-start: 0;
	z-index: var(--layer-dropdown);
	margin-block-start: var(--space-1);

	// Phones: pinned above the bottom edge across the page gutters, so it never overflows sideways.
	@media (width <= 480px) {
		position: fixed;
		inset-block: auto max(var(--space-4), env(safe-area-inset-bottom));
		inset-inline: var(--page-gutter);
		z-index: var(--layer-floating);
		margin: 0;
	}

	// emoji-picker-element reads these custom properties on its host element.
	:deep(emoji-picker) {
		--background: var(--surface-raised);
		--border-color: var(--border-subtle);
		--border-radius: var(--radius-md);
		--indicator-color: var(--primary);
		--outline-color: var(--focus-ring-color);

		border-radius: var(--radius-md);
		box-shadow: var(--elevation-3);

		@media (width <= 480px) {
			--num-columns: 7;

			inline-size: 100%;
		}
	}
}
</style>
