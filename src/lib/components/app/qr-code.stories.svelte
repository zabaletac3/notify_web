<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import QrCode from './qr-code.svelte';

	const { Story } = defineMeta({
		title: 'App/QrCode',
		component: QrCode,
		tags: ['autodocs'],
		args: {
			value:
				'otpauth://totp/AxoNote:ana@correo.com?secret=JBSWY3DPEHPK3PXP&issuer=AxoNote&algorithm=SHA1&digits=6&period=30'
		}
	});
</script>

<Story name="Autenticador">
	{#snippet template(args)}
		<QrCode {...args} />
	{/snippet}
</Story>

<Story name="Pequeño" args={{ size: 140 }}>
	{#snippet template(args)}
		<QrCode {...args} />
	{/snippet}
</Story>
