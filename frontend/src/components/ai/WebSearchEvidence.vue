<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {WebSearchResult} from '@/client/generated'
import {sanitizeProjectDescription} from '@/helpers/sanitizeProjectDescription'
defineProps<{result: WebSearchResult}>()
const {t} = useI18n({useScope: 'global'})
function safeURL(value = '') { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : '' } catch { return '' } }
</script>

<template>
	<section
		class="web-evidence"
		:aria-label="t('webSearch.evidence')"
	>
		<p><strong>{{ t(result.verified ? 'webSearch.verified' : 'webSearch.unverified') }}</strong> · {{ result.protocol }} · {{ ((result.duration_ms || 0) / 1000).toFixed(2) }} s</p>
		<code>{{ result.endpoint }}</code>
		<p v-if="result.step">
			HTTP {{ result.step.http_status || '—' }}<template v-if="result.step.model">
				· {{ result.step.model }}
			</template> · {{ t(result.step.streaming ? 'webSearch.streamed' : 'webSearch.nonStreamed') }}
		</p>
		<p v-if="result.step?.usage?.reported">
			{{ t('webSearch.usage', {input: result.step.usage.input, output: result.step.usage.output}) }}
		</p>
		<p v-else>
			{{ t('webSearch.usageUnknown') }}
		</p>
		<ul v-if="result.sources?.length">
			<li
				v-for="source in result.sources"
				:key="source.url"
			>
				<a
					v-if="safeURL(source.url)"
					:href="safeURL(source.url)"
					target="_blank"
					rel="noopener noreferrer"
				>{{ source.title || source.url }}</a>
			</li>
		</ul>
		<p v-else>
			{{ t('webSearch.noSources') }}
		</p>
		<div
			v-if="result.search_entry_point"
			v-html="sanitizeProjectDescription(result.search_entry_point)"
		/>
	</section>
</template>

<style scoped lang="scss">
.web-evidence {
 padding: .75rem;
margin-block: .75rem;
border: 1px solid var(--grey-200);
border-radius: .65rem;
font-size: .85rem;
overflow-wrap: anywhere;
 code {
white-space: pre-wrap;
overflow-wrap: anywhere;
}
 ul {
padding-inline-start: 1.25rem;
}
 li + li {
margin-block-start: .35rem;
}
}
</style>
