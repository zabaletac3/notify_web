<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Badge } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Badge',
		component: Badge,
		tags: ['autodocs'],
		argTypes: {
			variant: {
				control: 'select',
				options: ['default', 'secondary', 'outline', 'amber', 'plum', 'success', 'destructive']
			}
		}
	});
</script>

<Story name="Etiqueta ámbar" args={{ variant: 'amber' }}>
	{#snippet template(args)}
		<Badge {...args}>#parcial</Badge>
	{/snippet}
</Story>

<Story name="Etiqueta ciruela" args={{ variant: 'plum' }}>
	{#snippet template(args)}
		<Badge {...args}>#lecturas</Badge>
	{/snippet}
</Story>

<Story name="Estado: sincronizado" args={{ variant: 'success' }}>
	{#snippet template(args)}
		<Badge {...args}>Sincronizado</Badge>
	{/snippet}
</Story>
