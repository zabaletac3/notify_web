<script lang="ts">
	import { changelog } from '#lib/legal/changelog.js';
</script>

<svelte:head>
	<title>Notas de la versión · Apunte</title>
	<meta
		name="description"
		content="Historial de versiones de Apunte y las funciones que se han ido añadiendo."
	/>
</svelte:head>

<article class="flex flex-col gap-6">
	<header class="flex flex-col gap-2">
		<h1 class="text-title font-bold">Notas de la versión</h1>
		<p class="text-body text-muted-foreground">
			Un resumen de lo que ha cambiado en cada versión de Apunte.
		</p>
	</header>

	{#each changelog as entry (entry.version)}
		<section class="flex flex-col gap-2 border-l-2 border-border pl-4">
			<h2 class="text-heading font-semibold">Versión {entry.version}</h2>
			<time datetime={entry.date} class="text-caption text-tertiary">{entry.date}</time>
			<ul class="flex list-disc flex-col gap-1.5 pl-5 text-body">
				{#each entry.changes as change (change)}
					<li>{change}</li>
				{/each}
			</ul>
		</section>
	{/each}
</article>
