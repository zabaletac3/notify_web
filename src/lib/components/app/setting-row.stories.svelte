<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SettingRow from './setting-row.svelte';

	const { Story } = defineMeta({
		title: 'App/SettingRow',
		component: SettingRow,
		tags: ['autodocs'],
		args: { label: 'Notas de la versión', chevron: true, href: '/changelog' }
	});
</script>

<Story name="Enlace">
	{#snippet template(args)}
		<SettingRow {...args} />
	{/snippet}
</Story>

<Story name="Texto" args={{ href: undefined, label: 'Tema', value: 'Sistema' }}>
	{#snippet template(args)}
		<SettingRow {...args} description="Claro u oscuro" />
	{/snippet}
</Story>

<Story name="Botón" args={{ href: undefined, label: 'Cambiar contraseña', action: 'Cambiar' }}>
	{#snippet template(args)}
		<SettingRow {...args} onclick={() => {}} />
	{/snippet}
</Story>
