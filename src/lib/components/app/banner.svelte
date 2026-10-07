<script lang="ts">
	type Props = {
		message: string;
		/** Texto del botón de acción (ej. "Reintentar"). */
		action?: string;
		onaction?: () => void;
	};

	let { message, action, onaction }: Props = $props();
</script>

<div class="flex items-center gap-2.5 bg-hover px-4 py-3" role="status">
	<span class="size-2 shrink-0 rounded-full bg-tag-amber"></span>
	<p class="flex-1 text-label leading-[18px] font-medium">{message}</p>
	{#if action}
		<button
			type="button"
			onclick={onaction}
			class="shrink-0 text-label font-semibold text-primary outline-none focus-visible:underline"
		>
			{action}
		</button>
	{/if}
</div>
