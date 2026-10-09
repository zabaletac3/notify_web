<script lang="ts">
	import { page } from '$app/state';
	import { getApp } from '#lib/app/index.js';
	import { AppIcon, MarkdownView, ThemeToggle } from '#lib/components/app/index.js';
	import { keyFromFragment } from '#lib/data/index.js';
	import type { SharedNoteContent } from '#lib/domain/index.js';

	const { share } = getApp();

	const slug = $derived(page.params.slug ?? '');
	// La clave viaja en el fragmento (`#k=…`): el navegador no se la envía al servidor.
	const key = $derived(keyFromFragment(page.url.hash));

	let content = $state<SharedNoteContent | null>(null);
	let status = $state<'loading' | 'ready' | 'invalid' | 'error'>('loading');

	$effect(() => {
		const current = { slug, key };
		content = null;
		if (!current.key) {
			status = 'invalid';
			return;
		}
		status = 'loading';
		let cancelled = false;
		void share.open(current.slug, current.key).then((result) => {
			if (cancelled) return;
			if (result.ok) {
				content = result.value;
				status = 'ready';
			} else {
				// Revocado, inexistente o con la clave equivocada: el mismo aviso para no dar pistas.
				status = result.error.kind === 'not-found' ? 'invalid' : 'error';
			}
		});
		return () => (cancelled = true);
	});
</script>

<svelte:head>
	<title>{content?.title || 'Nota compartida'} · AxoNote</title>
	<meta name="referrer" content="no-referrer" />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="relative min-h-screen bg-background">
	<div class="absolute top-4 right-4"><ThemeToggle /></div>
	<main class="mx-auto flex w-full max-w-180 flex-col gap-6 px-4 py-14 md:px-8">
		{#if status === 'loading'}
			<p class="text-center text-muted-foreground" role="status">Abriendo la nota…</p>
		{:else if status === 'ready' && content}
			<article class="flex flex-col gap-4">
				<h1 class="text-title font-bold">{content.title || 'Sin título'}</h1>
				<MarkdownView source={content.content} />
			</article>
			<p class="text-caption text-muted-foreground">Nota compartida con AxoNote · solo lectura</p>
		{:else}
			<div class="flex flex-col items-center gap-3 py-16 text-center" role="alert">
				<span
					class="grid size-18 place-content-center rounded-full bg-accent text-accent-foreground"
				>
					<AppIcon name="lock" size={30} />
				</span>
				<h1 class="text-heading font-semibold">
					{status === 'error'
						? 'No se pudo abrir la nota'
						: 'Este enlace no es válido o fue revocado'}
				</h1>
				<p class="text-sm text-muted-foreground">
					{status === 'error'
						? 'Revisa tu conexión e inténtalo de nuevo.'
						: 'Pide a quien te lo envió que lo comparta de nuevo.'}
				</p>
			</div>
		{/if}
	</main>
</div>
