<script lang="ts">
	// Cada token: [nombre en Figma, variable CSS]. Se pinta con la variable para ver claro/oscuro.
	const tokens: [string, string][] = [
		['bg/editor', 'background'],
		['bg/app', 'card'],
		['bg/sidebar', 'sidebar'],
		['bg/selected', 'accent'],
		['bg/hover', 'hover'],
		['bg/input', 'input-fill'],
		['border/default', 'border'],
		['text/primary', 'foreground'],
		['text/secondary', 'muted-foreground'],
		['text/tertiary', 'tertiary'],
		['accent/default', 'primary'],
		['accent/on', 'primary-foreground'],
		['tag/amber', 'tag-amber'],
		['tag/plum', 'tag-plum'],
		['status/danger', 'destructive'],
		['status/danger-bg', 'destructive-soft'],
		['status/success', 'success']
	];
</script>

<section class="flex flex-col gap-4" aria-labelledby="ds-colors">
	<h2 id="ds-colors" class="text-heading font-semibold">Colores</h2>
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
		{#each tokens as [figma, css] (css)}
			<div class="flex flex-col gap-1.5">
				<div class="h-14 rounded-lg border" style:background-color="var(--{css})"></div>
				<span class="text-label font-medium">{figma}</span>
				<span class="text-caption text-muted-foreground">--{css}</span>
			</div>
		{/each}
	</div>
</section>
