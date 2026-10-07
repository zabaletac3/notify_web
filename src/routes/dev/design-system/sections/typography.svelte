<script lang="ts">
	const scale = [
		{ cls: 'text-title font-bold', name: 'Título · 28 bold', sample: 'Crea tu cuenta' },
		{
			cls: 'text-heading font-semibold',
			name: 'Encabezado · 18 semibold',
			sample: 'Resumen: Bases de datos II'
		},
		{
			cls: 'text-body',
			name: 'Cuerpo · 15 regular',
			sample: 'Guarda tus notas y sincronízalas en todos tus dispositivos.'
		},
		{
			cls: 'text-body font-semibold',
			name: 'Cuerpo énfasis · 15 semibold',
			sample: 'Iniciar sesión'
		},
		{ cls: 'text-label font-medium', name: 'Etiqueta · 13 medium', sample: 'Correo electrónico' },
		{
			cls: 'text-caption text-muted-foreground',
			name: 'Ayuda · 12 regular',
			sample: 'Usa letras, números y un símbolo.'
		},
		{
			cls: 'text-body italic',
			name: 'Cursiva · 15 italic',
			sample: 'Una nota con texto en cursiva'
		}
	];
</script>

<section class="flex flex-col gap-4" aria-labelledby="ds-type">
	<h2 id="ds-type" class="text-heading font-semibold">Tipografía · Inter</h2>
	<div class="flex flex-col gap-4">
		{#each scale as t (t.name)}
			<div class="flex flex-col gap-0.5">
				<span class="text-caption text-tertiary">{t.name}</span>
				<span class={t.cls}>{t.sample}</span>
			</div>
		{/each}
	</div>
</section>
