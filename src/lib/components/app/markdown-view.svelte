<script lang="ts">
	import { renderMarkdown } from '#lib/core/index.js';
	import { cn } from '#lib/utils.js';

	let { source, class: className }: { source: string; class?: string } = $props();

	const html = $derived(renderMarkdown(source));
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- HTML sanitizado por renderMarkdown -->
<div class={cn('markdown', className)}>{@html html}</div>

<style>
	.markdown {
		font-size: var(--text-prose);
		line-height: var(--text-prose--line-height);
		color: var(--foreground);
	}
	.markdown :global(p) {
		margin: 0 0 0.875rem;
	}
	.markdown :global(h1),
	.markdown :global(h2),
	.markdown :global(h3) {
		font-weight: 700;
		font-size: 1.375rem;
		line-height: 1.875rem;
		margin: 0.75rem 0 0.5rem;
	}
	.markdown :global(strong) {
		font-weight: 700;
	}
	.markdown :global(a) {
		color: var(--primary);
		text-decoration: underline;
	}
	.markdown :global(ul),
	.markdown :global(ol) {
		margin: 0 0 0.875rem;
		padding-left: 1.25rem;
	}
	.markdown :global(ul) {
		list-style: none;
		padding-left: 0.25rem;
	}
	.markdown :global(ul > li:not(:has(input))) {
		position: relative;
		padding-left: 1.125rem;
		margin-bottom: 0.375rem;
	}
	.markdown :global(ul > li:not(:has(input))::before) {
		content: '';
		position: absolute;
		left: 0;
		top: 0.6875rem;
		width: 6px;
		height: 6px;
		border-radius: 9999px;
		background: var(--primary);
	}
	.markdown :global(li:has(input)) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.markdown :global(li:has(input[checked])) {
		color: var(--muted-foreground);
	}
	/* Checkbox redondo de Apunte */
	.markdown :global(input[type='checkbox']) {
		appearance: none;
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
		margin: 0;
		border-radius: 9999px;
		border: 1.5px solid var(--tertiary);
		display: grid;
		place-content: center;
	}
	.markdown :global(input[type='checkbox'][checked]) {
		background: var(--primary);
		border-color: var(--primary);
	}
	.markdown :global(input[type='checkbox'][checked])::after {
		content: '';
		width: 0.3125rem;
		height: 0.5625rem;
		border: solid var(--primary-foreground);
		border-width: 0 1.75px 1.75px 0;
		transform: translateY(-1px) rotate(45deg);
	}
	.markdown :global(blockquote) {
		margin: 0 0 0.875rem;
		padding: 0.75rem 1rem;
		background: var(--card);
		border: 1px solid var(--primary);
		border-radius: 0.625rem;
		color: var(--muted-foreground);
		font-style: italic;
	}
	.markdown :global(blockquote p) {
		margin: 0;
	}
	.markdown :global(code) {
		background: var(--input-fill);
		border-radius: 0.375rem;
		padding: 0.0625rem 0.375rem;
		font-size: 0.9em;
	}
</style>
