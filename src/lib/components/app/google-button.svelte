<script lang="ts">
	import { toast } from 'svelte-sonner';

	let { label }: { label: string } = $props();

	// El acceso con Google aún no existe en la capa de datos (llegará con el backend).
	const soon = () => toast.info('Disponible pronto');
</script>

<button
	type="button"
	onclick={soon}
	class="flex h-13 w-full items-center justify-center gap-2.5 rounded-[14px] border bg-background text-body font-semibold outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
>
	<!-- Marcador de la "G" de Google: reemplazar por el logo oficial al conectar el acceso. -->
	<span class="text-lg font-bold" style="color: #4285f4" aria-hidden="true">G</span>
	{label}
</button>
