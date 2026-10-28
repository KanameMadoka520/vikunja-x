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
		<details class="sources-disclosure">
			<summary>
				<Icon icon="globe" /><strong>{{ t('webSearch.sourceCount', {count: result.sources?.length || 0}) }}</strong><span class="search-verification">{{ t(result.verified ? 'webSearch.verified' : 'webSearch.unverified') }}</span><Icon
					class="sources-chevron"
					icon="chevron-down"
				/>
			</summary>
			<div class="sources-body">
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
				<details class="source-diagnostics">
					<summary>{{ t('webSearch.technicalDetails') }}</summary><p>{{ result.protocol }} · {{ ((result.duration_ms || 0) / 1000).toFixed(2) }} s</p>		<code>{{ result.endpoint }}</code>
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
				</details>
			</div>
		</details>
	</section>
</template>

<style scoped lang="scss">
.web-evidence {
margin-block: 1rem;
border: 1px solid var(--grey-200);
border-radius: .85rem;
background: var(--grey-50, var(--grey-100));
font-size: .8rem;
overflow-wrap: anywhere;
}
.sources-disclosure > summary {
display: flex;
align-items: center;
gap: .65rem;
min-block-size: 44px;
padding: .7rem .9rem;
cursor: pointer;
list-style: none;
}
.sources-disclosure > summary::-webkit-details-marker {
display: none;
}
.sources-chevron {
margin-inline-start: auto;
flex-shrink: 0;
transition: transform .15s ease;
}
.sources-disclosure[open] > summary .sources-chevron {
transform: rotate(180deg);
}
.search-verification {
color: var(--text-light);
font-size: .7rem;
}
.sources-body {
border-block-start: 1px solid var(--grey-200);
padding: .85rem 1rem;
}
code {
white-space: pre-wrap;
overflow-wrap: anywhere;
}
ul {
margin: 0;
padding-inline-start: 1.25rem;
}
li + li {
margin-block-start: .65rem;
}
a {
text-decoration: underline;
text-underline-offset: .2em;
}
.source-diagnostics {
margin-block-start: 1rem;
color: var(--text-light);
}
.source-diagnostics summary {
cursor: pointer;
}
@media (width <= 480px) {
.search-verification {
display: none;
}
}
@media (prefers-reduced-motion: reduce) {
.sources-chevron {
transition: none;
}
}
</style>
