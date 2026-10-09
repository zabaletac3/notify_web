<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RecoveryCodesPanel from './recovery-codes-panel.svelte';

	const codes = [
		'ABCDE-FGHJK',
		'MNPQR-STVWX',
		'YZ234-56789',
		'AB2CD-3EFGH',
		'JKLMN-PQRST',
		'VWXYZ-23456',
		'789AB-CDEFG',
		'HJKLM-NPQRS',
		'TVWXY-Z2345',
		'6789A-BCDEF'
	];

	const { Story } = defineMeta({
		title: 'App/RecoveryCodesPanel',
		component: RecoveryCodesPanel,
		tags: ['autodocs'],
		args: { codes, email: 'ana@correo.com', oncontinue: () => {} }
	});
</script>

<Story name="Diez códigos">
	{#snippet template(args)}
		<RecoveryCodesPanel {...args} />
	{/snippet}
</Story>
