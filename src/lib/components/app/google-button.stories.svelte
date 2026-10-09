<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import GoogleButton from './google-button.svelte';

	const { Story } = defineMeta({
		title: 'App/GoogleButton',
		component: GoogleButton,
		tags: ['autodocs'],
		args: {
			label: 'Continuar con Google',
			visible: true,
			onclick: () => {}
		}
	});
</script>

<Story name="Predeterminado">
	{#snippet template(args)}
		<div class="w-90">
			<GoogleButton {...args} />
		</div>
	{/snippet}
</Story>
