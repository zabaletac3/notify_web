<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AppIcon from './app-icon.svelte';
	import { iconNames } from './icons.js';

	const { Story } = defineMeta({
		title: 'App/AppIcon',
		component: AppIcon,
		tags: ['autodocs'],
		argTypes: {
			name: { control: 'select', options: iconNames },
			size: { control: { type: 'number', min: 12, max: 48 } }
		},
		args: { name: 'folder', size: 24 }
	});
</script>

<Story name="Icono" />

<Story name="Todos los iconos" parameters={{ layout: 'padded' }}>
	{#snippet template()}
		<div class="grid grid-cols-6 gap-4">
			{#each iconNames as name (name)}
				<div class="flex flex-col items-center gap-2 text-caption text-muted-foreground">
					<AppIcon {name} size={24} class="text-foreground" />
					{name}
				</div>
			{/each}
		</div>
	{/snippet}
</Story>
