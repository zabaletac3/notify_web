<script lang="ts">
	import { AppIcon, iconNames } from '#lib/components/app/index.js';
</script>

<section class="flex flex-col gap-4" aria-labelledby="ds-icons">
	<h2 id="ds-icons" class="text-heading font-semibold">Iconos · Lucide, trazo 1.75</h2>
	<div class="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
		{#each iconNames as name (name)}
			<div class="flex flex-col items-center gap-2 rounded-lg border bg-card p-3">
				<AppIcon {name} size={24} />
				<span class="text-caption text-muted-foreground">{name}</span>
			</div>
		{/each}
	</div>
</section>
