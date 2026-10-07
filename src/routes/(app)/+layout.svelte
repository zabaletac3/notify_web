<!-- Shell de la app (barra lateral + lista + editor). Pendiente de implementar (fase 3). -->
<script lang="ts">
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

{@render children()}
