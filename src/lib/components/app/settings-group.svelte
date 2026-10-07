<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { title?: string; children: Snippet };
	let { title, children }: Props = $props();
</script>

<section class="flex flex-col gap-2">
	{#if title}
		<h2 class="text-micro font-semibold tracking-wider text-tertiary uppercase">{title}</h2>
	{/if}
	<div class="divide-y divide-border overflow-hidden rounded-[14px] border bg-card">
		{@render children()}
	</div>
</section>
