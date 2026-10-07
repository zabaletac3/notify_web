<script lang="ts">
	import { passwordStrength } from '#lib/domain/index.js';
	import { cn } from '#lib/utils.js';

	type Props = {
		password: string;
		/** `bar`: una barra que se llena (registro). `segments`: 4 tramos (nueva contraseña). */
		variant?: 'bar' | 'segments';
	};

	let { password, variant = 'bar' }: Props = $props();

	const strength = $derived(passwordStrength(password));
</script>

{#if variant === 'bar'}
	<div class="h-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
		<div
			class="h-full rounded-full bg-primary transition-[width]"
			style:width="{strength.score * 25}%"
		></div>
	</div>
{:else}
	<div class="flex gap-1.5" aria-hidden="true">
		{#each [1, 2, 3, 4] as segment (segment)}
			<div
				class={cn(
					'h-1 flex-1 rounded-full',
					segment <= strength.score ? 'bg-primary' : 'bg-border'
				)}
			></div>
		{/each}
	</div>
{/if}
<p class="sr-only" aria-live="polite">Seguridad de la contraseña: {strength.label}</p>
