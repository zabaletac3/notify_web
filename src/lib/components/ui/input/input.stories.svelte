<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Input } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Input',
		component: Input,
		tags: ['autodocs'],
		args: { placeholder: 'nombre@correo.com' }
	});
</script>

<Story name="Vacío">
	{#snippet template(args)}
		<div class="w-80"><Input {...args} /></div>
	{/snippet}
</Story>

<Story name="Con valor" args={{ value: 'ana@correo.com' }}>
	{#snippet template(args)}
		<div class="w-80"><Input {...args} /></div>
	{/snippet}
</Story>

<Story name="Con error" args={{ value: 'correo-invalido', 'aria-invalid': 'true' }}>
	{#snippet template(args)}
		<div class="w-80"><Input {...args} /></div>
	{/snippet}
</Story>

<Story name="Deshabilitado" args={{ disabled: true, placeholder: 'No editable' }}>
	{#snippet template(args)}
		<div class="w-80"><Input {...args} /></div>
	{/snippet}
</Story>
