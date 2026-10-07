<script lang="ts">
	import { toggleMode } from 'mode-watcher';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';

	// Tokens de color expuestos como utilidades (ver src/lib/styles/theme.css).
	const colors = [
		'background',
		'card',
		'muted',
		'secondary',
		'hover',
		'input-fill',
		'accent',
		'sidebar',
		'primary',
		'destructive',
		'destructive-soft',
		'success',
		'tag-amber',
		'tag-plum'
	];
</script>

<main class="mx-auto flex max-w-4xl flex-col gap-10 p-8">
	<header class="flex items-center justify-between">
		<h1 class="text-3xl font-bold">Sistema de diseño</h1>
		<Button variant="outline" onclick={toggleMode}>Claro / oscuro</Button>
	</header>

	<section class="flex flex-col gap-4">
		<h2 class="text-xl font-semibold">Colores</h2>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
			{#each colors as c (c)}
				<div class="flex flex-col gap-1.5">
					<div class="h-14 rounded-lg border bg-{c}" style:background-color="var(--{c})"></div>
					<span class="text-sm font-medium">{c}</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="text-xl font-semibold">Componentes</h2>
		<div class="flex flex-wrap items-center gap-3">
			<Button>Primario</Button>
			<Button variant="secondary">Secundario</Button>
			<Button variant="outline">Contorno</Button>
			<Button variant="ghost">Fantasma</Button>
			<Button variant="destructive">Peligro</Button>
			<Badge>Etiqueta</Badge>
			<Switch />
		</div>
		<Input placeholder="Campo de texto" class="max-w-sm" />
	</section>
</main>
