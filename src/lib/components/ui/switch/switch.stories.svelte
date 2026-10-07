<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Switch } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Switch',
		component: Switch,
		tags: ['autodocs']
	});
</script>

<Story name="Apagado">
	{#snippet template(args)}
		<Switch aria-label="Solo con Wi-Fi" {...args} />
	{/snippet}
</Story>

<Story name="Encendido" args={{ checked: true }}>
	{#snippet template(args)}
		<Switch aria-label="Sincronizar automáticamente" {...args} />
	{/snippet}
</Story>
