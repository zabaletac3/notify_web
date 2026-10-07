<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Input } from '#lib/components/ui/input/index.js';

	type Props = {
		id: string;
		label: string;
		value: string;
		type?: 'text' | 'email' | 'password';
		placeholder?: string;
		autocomplete?: HTMLInputElement['autocomplete'];
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
		error,
		children
	}: Props = $props();
</script>

<div class="flex flex-col gap-1.5">
	<label for={id} class="text-label font-medium">{label}</label>
	<Input
		{id}
		{type}
		{placeholder}
		{autocomplete}
		bind:value
		aria-invalid={error ? true : undefined}
		aria-describedby={error ? `${id}-error` : undefined}
	/>
	{#if error}<p id="{id}-error" class="text-caption text-destructive">{error}</p>{/if}
	{@render children?.()}
</div>
