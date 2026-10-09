<script lang="ts">
	// Solo para pruebas: un recuadro del ancho útil de un diálogo (sm:max-w-110 con p-7 = 384 px) con las
	// filas de botones reales de `settings/account` (textos largos incluidos).
	import { Button } from '#lib/components/ui/button/index.js';
	import { dialogButtons, dialogButtonsStacked } from './dialog-actions.js';

	let { stacked = false }: { stacked?: boolean } = $props();
</script>

<div data-testid="box" class="w-96">
	<div class={stacked ? dialogButtonsStacked : dialogButtons}>
		{#if stacked}
			<Button type="button" variant="outline">Cerrar sesión</Button>
			<Button type="button" variant="destructive">Cerrar sesión y olvidar este dispositivo</Button>
		{:else}
			<Button type="button" variant="outline">Cancelar</Button>
			<Button type="button" variant="destructive">Salir igualmente</Button>
			<Button type="button">Sincronizar y salir</Button>
		{/if}
	</div>
</div>
