<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SidebarItem from './sidebar-item.svelte';

	const { Story } = defineMeta({
		title: 'App/SidebarItem',
		component: SidebarItem,
		tags: ['autodocs'],
		args: { icon: 'folder', label: 'Universidad', count: 12 }
	});
</script>

<Story name="Abierto">
	{#snippet template(args)}
		<div class="w-62 bg-sidebar p-3">
			<SidebarItem {...args} />
		</div>
	{/snippet}
</Story>

<Story name="Recogido" args={{ collapsed: true }}>
	{#snippet template(args)}
		<div class="w-16 bg-sidebar p-3">
			<SidebarItem {...args} />
		</div>
	{/snippet}
</Story>
