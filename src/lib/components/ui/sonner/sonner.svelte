<script lang="ts">
	import { mode } from 'mode-watcher';
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import { Loader2Icon } from '@lucide/svelte';

	let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
	theme={mode.current}
	class="toaster group"
	style="--width: 380px; --normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
	toastOptions={{
		classes: {
			toast: 'w-95! gap-3! rounded-xl! px-3.5! py-3! text-sm! font-medium!',
			actionButton: 'ml-auto! h-auto! bg-transparent! p-0! text-sm! font-semibold! text-primary!'
		}
	}}
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<span class="size-2.5 rounded-full bg-success"></span>
	{/snippet}
	{#snippet errorIcon()}
		<span class="size-2.5 rounded-full bg-destructive"></span>
	{/snippet}
	{#snippet infoIcon()}
		<span class="size-2.5 rounded-full bg-primary"></span>
	{/snippet}
	{#snippet warningIcon()}
		<span class="size-2.5 rounded-full bg-tag-amber"></span>
	{/snippet}
</Sonner>
