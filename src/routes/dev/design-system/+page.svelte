<script lang="ts">
	import { ThemeToggle } from '#lib/components/app/index.js';
	import Colors from './sections/colors.svelte';
	import Typography from './sections/typography.svelte';
	import Icons from './sections/icons.svelte';
	import Controls from './sections/controls.svelte';
	import Overlays from './sections/overlays.svelte';
</script>

<main class="mx-auto flex max-w-5xl flex-col gap-12 p-8">
	<header class="flex items-center justify-between">
		<div class="flex flex-col gap-1">
			<h1 class="text-title font-bold">Sistema de diseño</h1>
			<p class="text-body text-muted-foreground">
				Tokens y componentes de Apunte. Referencia viva: debe verse igual que el marco "Componentes"
				de Figma, en claro y oscuro.
			</p>
		</div>
		<ThemeToggle />
	</header>

	<Colors />
	<Typography />
	<Icons />
	<Controls />
	<Overlays />
</main>
