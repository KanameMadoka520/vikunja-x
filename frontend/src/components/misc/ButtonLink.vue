<template>
	<BaseButton class="button-link">
		<slot />
	</BaseButton>
</template>

<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
</script>

<style lang="scss">
// Usually inline in a sentence (e.g. a status message), so the underline is the link cue.
.button-link {
	color: var(--accent-text);
	text-decoration: underline;
	text-underline-offset: 2px;

	&:hover {
		text-decoration-thickness: 2px;
	}
}
</style>
