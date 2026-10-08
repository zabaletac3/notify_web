<script lang="ts">
	import Banner from './banner.svelte';
	import type { LegalDocument } from '#lib/legal/types.js';

	type Props = { doc: LegalDocument };
	let { doc }: Props = $props();

	const draft = $derived(doc.status === 'borrador');
	const effectiveLabel = $derived(
		doc.effectiveDate ? `Vigente desde ${doc.effectiveDate}` : 'Fecha de vigencia por definir'
	);

	/** Parte el texto en tramos y marca los pendientes `[[REVISAR…]]` mientras sea borrador. */
	function highlight(text: string): { text: string; draft: boolean }[] {
		if (!draft || !text.includes('[[REVISAR')) return [{ text, draft: false }];
		const parts: { text: string; draft: boolean }[] = [];
		const re = /\[\[REVISAR[\s\S]*?\]\]/g;
		let last = 0;
		let match: RegExpExecArray | null;
		while ((match = re.exec(text))) {
			if (match.index > last) parts.push({ text: text.slice(last, match.index), draft: false });
			parts.push({ text: match[0], draft: true });
			last = match.index + match[0].length;
		}
		if (last < text.length) parts.push({ text: text.slice(last), draft: false });
		return parts;
	}
</script>

{#snippet rich(text: string)}
	{#each highlight(text) as segment, index (index)}{#if segment.draft}<mark
				class="rounded-sm bg-tag-amber/20 px-0.5 font-medium text-foreground">{segment.text}</mark
			>{:else}{segment.text}{/if}{/each}
{/snippet}

<article class="flex flex-col gap-6">
	<header class="flex flex-col gap-2">
		<h1 class="text-title font-bold break-words">{doc.title}</h1>
		<p class="text-caption text-tertiary">Versión {doc.version} · {effectiveLabel}</p>
		{#if draft}
			<Banner message="Borrador pendiente de revisión legal" />
		{/if}
	</header>

	<p class="text-body">{@render rich(doc.intro)}</p>

	<nav aria-label="Índice" class="rounded-[14px] border border-border bg-card px-4 py-3">
		<p class="text-label font-semibold text-muted-foreground">En esta página</p>
		<ol class="mt-1 flex flex-col gap-0.5">
			{#each doc.sections as section (section.id)}
				<li>
					<a
						href={`#${section.id}`}
						class="text-label text-primary underline-offset-2 outline-none hover:underline focus-visible:underline focus-visible:ring-3 focus-visible:ring-ring/50"
					>
						{section.title}
					</a>
				</li>
			{/each}
		</ol>
	</nav>

	{#each doc.sections as section (section.id)}
		<section class="flex flex-col gap-3">
			<h2 id={section.id} class="scroll-mt-20 text-heading font-semibold">{section.title}</h2>
			{#each section.blocks as block, index (index)}
				{#if 'p' in block}
					<p class="text-body">{@render rich(block.p)}</p>
				{:else if 'ul' in block}
					<ul class="flex list-disc flex-col gap-1.5 pl-5 text-body">
						{#each block.ul as item, itemIndex (itemIndex)}
							<li>{@render rich(item)}</li>
						{/each}
					</ul>
				{:else}
					<div class="flex gap-2.5 rounded-xl border border-border bg-hover px-4 py-3">
						<span class="mt-1.5 size-2 shrink-0 rounded-full bg-tag-amber" aria-hidden="true"
						></span>
						<p class="text-label font-medium">{@render rich(block.callout)}</p>
					</div>
				{/if}
			{/each}
		</section>
	{/each}
</article>
