<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '#lib/components/ui/button/index.js';
</script>

<svelte:head><title>Bienvenido · Apunte</title></svelte:head>

<main class="flex min-h-dvh flex-col bg-background md:flex-row">
	<!-- Panel de marca (≥ 768 px) -->
	<section
		class="hidden w-140 shrink-0 flex-col justify-between gap-5 bg-primary p-16 text-primary-foreground md:flex"
	>
		<span
			class="grid size-14 place-content-center rounded-[14px] bg-primary-foreground text-3xl font-bold text-primary"
			aria-hidden="true">A</span
		>
		<div class="flex flex-col gap-5">
			<p class="text-[44px] leading-[50px] font-bold">Tus ideas, siempre a mano.</p>
			<p class="text-lg leading-[27px]">
				Notas limpias y rápidas para Linux, Windows y Android. Todo sincronizado.
			</p>
		</div>
	</section>

	<!-- Marca (móvil) -->
	<section class="flex flex-1 flex-col items-center justify-center gap-3 px-6 md:hidden">
		<span
			class="grid size-24 place-content-center rounded-3xl bg-primary text-5xl font-bold text-primary-foreground"
			aria-hidden="true">A</span
		>
		<h1 class="text-[34px] font-bold">Apunte</h1>
		<p class="text-center text-base leading-6 text-muted-foreground">
			Tus notas, claras y siempre contigo.
		</p>
	</section>

	<section class="flex flex-col items-center justify-center px-6 pb-6 md:flex-1 md:px-24 md:pb-0">
		<div class="flex w-full max-w-95 flex-col gap-3 md:gap-3.5">
			<div class="hidden flex-col gap-3.5 md:flex">
				<h1 class="text-3xl font-bold">Bienvenido a Apunte</h1>
				<p class="text-body leading-[22px] text-muted-foreground">
					Crea una cuenta para sincronizar tus notas o inicia sesión si ya tienes una.
				</p>
			</div>
			<Button size="lg" class="rounded-[14px]" onclick={() => goto('/register')}
				>Crear cuenta</Button
			>
			<Button size="lg" variant="outline" class="rounded-[14px]" onclick={() => goto('/login')}>
				Ya tengo una cuenta
			</Button>
			<a
				href="/notes"
				class="hidden justify-center text-sm font-semibold text-primary outline-none focus-visible:underline md:flex"
			>
				Continuar sin cuenta
			</a>
			<p class="text-center text-caption leading-[17px] text-tertiary md:hidden">
				Al continuar aceptas los
				<a
					href="/terms"
					target="_blank"
					rel="noopener"
					class="font-semibold text-primary underline underline-offset-2">Términos de uso</a
				>
				y la
				<a
					href="/privacy"
					target="_blank"
					rel="noopener"
					class="font-semibold text-primary underline underline-offset-2">Política de privacidad</a
				>.
			</p>
		</div>
	</section>
</main>
