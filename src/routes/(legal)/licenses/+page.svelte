<script lang="ts">
	import licenses from '#lib/legal/licenses.json';
</script>

<svelte:head>
	<title>Licencias de código abierto · Apunte</title>
	<meta
		name="description"
		content="Librerías de código abierto que usa Apunte, con su versión y licencia."
	/>
</svelte:head>

<article class="flex flex-col gap-6">
	<header class="flex flex-col gap-2">
		<h1 class="text-title font-bold">Licencias de código abierto</h1>
		<p class="text-body text-muted-foreground">
			Apunte se apoya en estas librerías. Gracias a quienes las mantienen.
		</p>
	</header>

	<ul class="divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-card">
		{#each licenses as dependency (dependency.name + dependency.version)}
			<li class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3">
				<span class="min-w-40 flex-1 font-medium break-words">{dependency.name}</span>
				<span class="text-caption text-tertiary">{dependency.version}</span>
				<span class="text-caption text-muted-foreground">{dependency.license}</span>
			</li>
		{/each}
	</ul>
</article>
