<template>
	<component
		:is="is"
		class="shortcuts"
	>
		<template
			v-for="(k, i) in keys"
			:key="i"
		>
			<kbd>{{ k }}</kbd>
			<span v-if="i < keys.length - 1">{{ combination }}</span>
		</template>
	</component>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{
	keys: string[],
	combination?: string,
	is?: string
}>(), {
	combination: '+',
	is: 'div',
})
</script>

<style lang="scss" scoped>
.shortcuts {
	display: flex;
	align-items: center;
}

kbd {
	min-inline-size: 1.5em;
	padding: 1px var(--space-1);
	border: 1px solid var(--border-default);
	border-block-end-width: 2px;
	background: var(--surface-sunken);
	border-radius: var(--radius-xs);
	color: var(--text-primary);
	font-family: inherit;
	font-size: var(--text-xs);
	font-weight: var(--weight-medium);
	line-height: 1.4;
	text-align: center;
}

span {
	padding: 0 var(--space-1);
	color: var(--text-tertiary);
	font-size: var(--text-xs);
}
</style>
