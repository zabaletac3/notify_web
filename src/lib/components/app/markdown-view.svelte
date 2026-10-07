<script lang="ts">
	import { renderMarkdown } from '#lib/core/index.js';
	import { cn } from '#lib/utils.js';

	let { source, class: className }: { source: string; class?: string } = $props();

	const html = $derived(renderMarkdown(source));
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- HTML sanitizado por renderMarkdown -->
<div class={cn('prose-apunte', className)}>{@html html}</div>
