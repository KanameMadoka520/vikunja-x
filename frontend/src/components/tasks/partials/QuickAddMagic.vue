<template>
	<template v-if="mode !== 'disabled' && prefixes !== undefined">
		<span
			v-if="isQuickAddMode"
			v-tooltip="$t('task.quickAddMagic.quickEntryHint')"
			class="icon is-small show-helper-text"
		>
			<Icon :icon="['far', 'circle-question']" />
		</span>
		<template v-else>
			<BaseButton
				v-tooltip="$t('task.quickAddMagic.hint')"
				class="icon is-small show-helper-text quick-add-magic-trigger-btn"
				:aria-label="$t('task.quickAddMagic.hint')"
				:class="{'is-highlighted': highlightHintIcon}"
				@click="open"
			>
				<Icon :icon="['far', 'circle-question']" />
			</BaseButton>
			<Modal
				:enabled="visible"
				:overflow="true"
				variant="hint-modal"
				@close="close"
			>
				<Card
					class="has-no-shadow"
					:title="$t('task.quickAddMagic.title')"
					:show-close="true"
					@close="close"
				>
					<p>{{ $t('task.quickAddMagic.intro') }}</p>

					<h3>{{ $t('task.attributes.labels') }}</h3>
					<p>
						{{ $t('task.quickAddMagic.label1', {prefix: prefixes.label}) }}
						{{ $t('task.quickAddMagic.label2') }}
						{{ $t('task.quickAddMagic.multiple') }}
					</p>
					<p>
						{{ $t('task.quickAddMagic.label3') }}
						{{ $t('task.quickAddMagic.label4', {prefix: prefixes.label}) }}
					</p>

					<h3>{{ $t('task.attributes.priority') }}</h3>
					<p>
						{{ $t('task.quickAddMagic.priority1', {prefix: prefixes.priority}) }}
						{{ $t('task.quickAddMagic.priority2') }}
					</p>

					<h3>{{ $t('task.attributes.assignees') }}</h3>
					<p>
						{{ $t('task.quickAddMagic.assignees', {prefix: prefixes.assignee}) }}
						{{ $t('task.quickAddMagic.multiple') }}
					</p>

					<h3>{{ $t('quickActions.projects') }}</h3>
					<p>
						{{ $t('task.quickAddMagic.project1', {prefix: prefixes.project}) }}
						{{ $t('task.quickAddMagic.project2') }}
					</p>
					<p>
						{{ $t('task.quickAddMagic.project3') }}
						{{ $t('task.quickAddMagic.project4', {prefix: prefixes.project}) }}
					</p>

					<h3>{{ $t('task.quickAddMagic.dateAndTime') }}</h3>
					<p>
						{{ $t('task.quickAddMagic.date') }} {{ $t('tcymc.englishCommands') }}
					</p>
					<ul>
						<!-- Keep the recognized English command alongside its translated explanation. -->
						<li>{{ $t('tcymc.command1') }}</li>
						<li>{{ $t('tcymc.command2') }}</li>
						<li>{{ $t('tcymc.command3') }}</li>
						<li>{{ $t('tcymc.command4') }}</li>
						<li>{{ $t('tcymc.command5') }}</li>
						<li>{{ $t('tcymc.command6') }}</li>
						<li>{{ $t('tcymc.command7') }}</li>
						<li>{{ $t('tcymc.command8') }}</li>
						<li>{{ $t('tcymc.command9') }}</li>
						<li>{{ $t('tcymc.command10') }}</li>
						<li>{{ $t('tcymc.command11') }}</li>
						<li>{{ $t('tcymc.commandTuesday') }} ({{ $t('task.quickAddMagic.dateWeekday') }})</li>
						<li>02/17/2021</li>
						<li>2021-02-17</li>
						<li>17.02.2021</li>
						<li>{{ $t('tcymc.commandFeb17') }} ({{ $t('task.quickAddMagic.dateCurrentYear') }})</li>
						<li>{{ $t('tcymc.command17th') }} ({{ $t('task.quickAddMagic.dateNth', {day: '17'}) }})</li>
					</ul>
					<p>{{ $t('task.quickAddMagic.dateTime', {time: 'at 17:00', timePM: '5pm'}) }}</p>

					<h3>{{ $t('task.quickAddMagic.repeats') }}</h3>
					<p>{{ $t('task.quickAddMagic.repeatsDescription', {suffix: 'every {amount} {type}'}) }}</p>
					<p>{{ $t('misc.forExample') }}</p>
					<ul>
						<!-- Keep the recognized English command alongside its translated explanation. -->
						<li>{{ $t('tcymc.command12') }}</li>
						<li>{{ $t('tcymc.command13') }}</li>
						<li>{{ $t('tcymc.command14') }}</li>
						<li>{{ $t('tcymc.command15') }}</li>
						<li>{{ $t('tcymc.command16') }}</li>
					</ul>
				</Card>
			</Modal>
		</template>
	</template>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'

import {PREFIXES} from '@/modules/quickAddMagic'
import {useAuthStore} from '@/stores/auth'
import {useQuickAddMode} from '@/composables/useQuickAddMode'

defineProps<{
	highlightHintIcon?: boolean,
}>()

const emit = defineEmits<{
	opened: []
	closed: []
}>()

const authStore = useAuthStore()
const {isQuickAddMode} = useQuickAddMode()

const visible = ref(false)
const mode = computed(() => authStore.settings.frontend_settings.quick_add_magic_mode)

const prefixes = computed(() => PREFIXES[mode.value])

function open() {
	visible.value = true
	emit('opened')
}

function close() {
	visible.value = false
	emit('closed')
}
</script>

<style lang="scss" scoped>
.show-helper-text {
	// Bulma adds pointer-events: none to the icon so we need to override it back here.
	pointer-events: auto !important;
}

.is-highlighted {
	color: inherit !important;
}
</style>
