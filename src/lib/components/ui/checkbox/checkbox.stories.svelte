<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Checkbox } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Checkbox (tarea)',
		component: Checkbox,
		tags: ['autodocs']
	});
</script>

<Story name="Pendiente">
	{#snippet template(args)}
		<Checkbox aria-label="Tarea pendiente" {...args} />
	{/snippet}
</Story>

<Story name="Hecho" args={{ checked: true }}>
	{#snippet template(args)}
		<Checkbox aria-label="Tarea hecha" {...args} />
	{/snippet}
</Story>
