<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import AppIcon from './app-icon.svelte';

	type Props = {
		id: string;
		label: string;
		value: string;
		type?: 'text' | 'email' | 'password';
		placeholder?: string;
		autocomplete?: HTMLInputElement['autocomplete'];
		autocapitalize?: 'off' | 'none' | 'sentences' | 'words' | 'characters';
		spellcheck?: boolean;
		/** Mensaje de error ya traducido. */
		error?: string;
		/** Ayuda o medidor bajo el campo. */
		children?: Snippet;
	};

	let {
		id,
		label,
		value = $bindable(),
		type = 'text',
		placeholder,
		autocomplete,
		autocapitalize,
		spellcheck,
		error,
		children
	}: Props = $props();

	const isPassword = $derived(type === 'password');
	let revealed = $state(false);
	const inputType = $derived(isPassword && revealed ? 'text' : type);
</script>

<div class="flex flex-col gap-1.5">
	<label for={id} class="text-label font-medium">{label}</label>
	<div class="relative">
		<Input
			{id}
			type={inputType}
			{placeholder}
			{autocomplete}
			{autocapitalize}
			{spellcheck}
			class={isPassword ? 'pr-12' : undefined}
			bind:value
			aria-invalid={error ? true : undefined}
			aria-describedby={error ? `${id}-error` : undefined}
		/>
		{#if isPassword}
			<button
				type="button"
				class="absolute top-1/2 right-1 grid h-11 w-11 -translate-y-1/2 place-content-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
				aria-label={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
				aria-pressed={revealed}
				onmousedown={(e) => e.preventDefault()}
				onclick={() => (revealed = !revealed)}
			>
				<AppIcon name={revealed ? 'eye-off' : 'eye'} size={20} />
			</button>
		{/if}
	</div>
	{#if error}<p id="{id}-error" class="text-caption text-destructive">{error}</p>{/if}
	{@render children?.()}
</div>
