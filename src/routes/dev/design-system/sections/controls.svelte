<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as RadioGroup from '#lib/components/ui/radio-group/index.js';
	import * as InputOTP from '#lib/components/ui/input-otp/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';

	const variants = [
		'default',
		'secondary',
		'outline',
		'ghost',
		'destructive',
		'destructive-soft',
		'link'
	] as const;
	const sizes = ['xs', 'sm', 'default', 'lg'] as const;
</script>

<section class="flex flex-col gap-6" aria-labelledby="ds-controls">
	<h2 id="ds-controls" class="text-heading font-semibold">Controles</h2>

	<div class="flex flex-col gap-3">
		<h3 class="text-label font-medium text-muted-foreground">Botones · variantes</h3>
		<div class="flex flex-wrap items-center gap-3">
			{#each variants as v (v)}
				<Button variant={v}>{v}</Button>
			{/each}
			<Button disabled>disabled</Button>
		</div>
		<h3 class="text-label font-medium text-muted-foreground">Botones · tamaños</h3>
		<div class="flex flex-wrap items-center gap-3">
			{#each sizes as s (s)}
				<Button size={s}>{s}</Button>
			{/each}
		</div>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		<div class="flex flex-col gap-1.5">
			<Label for="ds-email">Correo electrónico</Label>
			<Input id="ds-email" placeholder="nombre@correo.com" />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="ds-invalid">Con error</Label>
			<Input id="ds-invalid" value="correo-invalido" aria-invalid="true" />
			<span class="text-caption text-destructive">Ingresa un correo válido.</span>
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="ds-disabled">Deshabilitado</Label>
			<Input id="ds-disabled" placeholder="No editable" disabled />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="ds-area">Área de texto</Label>
			<Textarea id="ds-area" placeholder="Escribe una nota…" />
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-8">
		<div class="flex items-center gap-2">
			<Checkbox id="ds-c1" />
			<Label for="ds-c1">Pendiente</Label>
		</div>
		<div class="flex items-center gap-2">
			<Checkbox id="ds-c2" checked />
			<Label for="ds-c2">Hecho</Label>
		</div>
		<div class="flex items-center gap-2">
			<Switch id="ds-s1" />
			<Label for="ds-s1">Apagado</Label>
		</div>
		<div class="flex items-center gap-2">
			<Switch id="ds-s2" checked />
			<Label for="ds-s2">Encendido</Label>
		</div>
		<RadioGroup.Root value="uni" class="flex gap-4">
			<div class="flex items-center gap-2">
				<RadioGroup.Item value="uni" id="ds-r1" />
				<Label for="ds-r1">Universidad</Label>
			</div>
			<div class="flex items-center gap-2">
				<RadioGroup.Item value="per" id="ds-r2" />
				<Label for="ds-r2">Personal</Label>
			</div>
		</RadioGroup.Root>
	</div>

	<div class="flex max-w-sm flex-col gap-2">
		<span class="text-label font-medium text-muted-foreground">Código de verificación</span>
		<InputOTP.Root maxlength={6} value="482">
			{#snippet children({ cells })}
				<InputOTP.Group>
					{#each cells as cell (cell)}
						<InputOTP.Slot {cell} />
					{/each}
				</InputOTP.Group>
			{/snippet}
		</InputOTP.Root>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<Badge>default</Badge>
		<Badge variant="secondary">secondary</Badge>
		<Badge variant="outline">outline</Badge>
		<Badge variant="amber">#parcial</Badge>
		<Badge variant="plum">#lecturas</Badge>
		<Badge variant="success">Sincronizado</Badge>
		<Badge variant="destructive">error</Badge>
	</div>

	<div class="flex max-w-sm flex-col gap-2">
		<span class="text-label font-medium text-muted-foreground">Skeleton</span>
		<Skeleton class="h-3.5 w-40" />
		<Skeleton class="h-2.5 w-full" />
		<Skeleton class="h-2.5 w-3/4" />
	</div>
</section>
