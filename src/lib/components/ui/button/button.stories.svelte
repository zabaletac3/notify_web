<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Button',
		component: Button,
		tags: ['autodocs'],
		argTypes: {
			variant: {
				control: 'select',
				options: [
					'default',
					'secondary',
					'outline',
					'ghost',
					'destructive',
					'destructive-soft',
					'link'
				]
			},
			size: { control: 'select', options: ['xs', 'sm', 'default', 'lg'] },
			disabled: { control: 'boolean' }
		},
		args: { variant: 'default', size: 'default', disabled: false }
	});
</script>

<Story name="Primario">
	{#snippet template(args)}
		<Button {...args}>Crear cuenta</Button>
	{/snippet}
</Story>

<Story name="Secundario" args={{ variant: 'outline' }}>
	{#snippet template(args)}
		<Button {...args}>Ya tengo una cuenta</Button>
	{/snippet}
</Story>

<Story name="Peligro" args={{ variant: 'destructive' }}>
	{#snippet template(args)}
		<Button {...args}>Eliminar mi cuenta</Button>
	{/snippet}
</Story>

<Story name="Deshabilitado" args={{ disabled: true }}>
	{#snippet template(args)}
		<Button {...args}>Verificar</Button>
	{/snippet}
</Story>
