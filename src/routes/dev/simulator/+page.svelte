<script lang="ts">
	import { ThemeToggle } from '#lib/components/app/index.js';
	import ScenarioPanel from '#lib/dev/scenario-panel.svelte';
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-6 p-8">
	<header class="flex items-center justify-between">
		<div class="flex flex-col gap-1">
			<h1 class="text-title font-bold">Simulador de escenarios</h1>
			<p class="text-body text-muted-foreground">
				Activa condiciones (sin conexión, errores, conflictos…) para ver cada estado de la app sin
				backend.
			</p>
		</div>
		<ThemeToggle />
	</header>
	<ScenarioPanel />
</main>
