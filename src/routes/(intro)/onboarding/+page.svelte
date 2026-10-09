<script lang="ts">
	import { goto } from '$app/navigation';
	import { AppIcon } from '#lib/components/app/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';

	const steps = [
		{
			title: 'Escribe sin distracciones',
			text: 'Un editor limpio con listas, checklists y formato cuando lo necesitas.'
		},
		{
			title: 'Todo en su carpeta',
			text: 'Organiza tus notas con carpetas y etiquetas, y encuéntralas al instante.'
		},
		{
			title: 'En todos tus dispositivos',
			text: 'Tus notas se sincronizan entre Linux, Windows y Android.'
		}
	];

	let step = $state(0);
	const last = $derived(step === steps.length - 1);

	const finish = () => goto('/notes');
	const next = () => (last ? finish() : (step += 1));
</script>

<svelte:head><title>Primeros pasos · AxoNote</title></svelte:head>

{#snippet illustration()}
	<div
		class="flex h-85 flex-col items-center justify-center gap-2.5 rounded-[28px] bg-accent md:h-65"
		aria-hidden="true"
	>
		{#if step === 0}
			{#each [true, true, false] as done, i (i)}
				<div
					class="flex w-60 items-center gap-2.5 rounded-xl border bg-background px-3.5 py-3 md:w-83.25"
				>
					<span
						class={cn(
							'size-4.5 shrink-0 rounded-full',
							done ? 'bg-primary' : 'border-2 border-tertiary'
						)}
					></span>
					<span class="flex w-29 flex-col gap-1.5 md:w-40">
						<span class="h-2 rounded-full bg-tertiary"></span>
						<span class="h-1.75 w-[70%] rounded-full bg-hover"></span>
					</span>
				</div>
			{/each}
		{:else if step === 1}
			{#each [['Universidad', 12], ['Personal', 9], ['Ideas', 5]] as [name, count] (name)}
				<div
					class="flex w-60 items-center gap-2.5 rounded-xl border bg-background px-3.5 py-3 md:w-83.25"
				>
					<AppIcon name="folder" size={20} class="text-muted-foreground" />
					<span class="flex-1 text-sm font-medium">{name}</span>
					<span class="text-label text-tertiary">{count}</span>
				</div>
			{/each}
		{:else}
			<div class="flex items-center gap-4.5">
				<div
					class="flex h-29 w-38 gap-2 rounded-[10px] border-3 border-primary bg-background p-2.5 md:h-22 md:w-53"
				>
					<span class="w-4.5 rounded-full bg-hover"></span>
					<span class="flex flex-1 flex-col gap-1.5">
						<span class="h-1.75 w-[78%] rounded-full bg-tertiary"></span>
						<span class="h-1.5 rounded-full bg-hover"></span>
						<span class="h-1.5 w-[68%] rounded-full bg-hover"></span>
					</span>
				</div>
				<div
					class="flex h-39 w-18 flex-col gap-1.5 rounded-xl border-3 border-primary bg-background px-2 py-2.5 md:h-30 md:w-25"
				>
					<span class="h-1.75 w-6 rounded-full bg-tertiary"></span>
					<span class="h-1.5 w-7.5 rounded-full bg-hover"></span>
					<span class="h-1.5 w-6.5 rounded-full bg-hover"></span>
				</div>
			</div>
			<span
				class="flex items-center gap-2 rounded-2xl bg-background px-3 py-2 text-caption font-medium"
			>
				<span class="size-2 rounded-full bg-success"></span>Sincronizado
			</span>
		{/if}
	</div>
{/snippet}

{#snippet dots()}
	<div
		class="flex items-center justify-center gap-1.5"
		aria-label="Paso {step + 1} de {steps.length}"
	>
		{#each steps as step_, i (step_.title)}
			<span class={cn('h-2 rounded-full', i === step ? 'w-5.5 bg-primary' : 'w-2 bg-border')}
			></span>
		{/each}
	</div>
{/snippet}

<main class="flex min-h-dvh flex-col items-center justify-center bg-background md:bg-card md:px-6">
	<!-- Móvil -->
	<div class="flex min-h-dvh w-full flex-col md:hidden">
		<div class="flex h-12 items-center justify-end pr-16 pl-5">
			{#if !last}
				<button type="button" onclick={finish} class="text-sm font-semibold text-muted-foreground">
					Omitir
				</button>
			{/if}
		</div>
		<div class="flex flex-1 flex-col gap-7 px-6 pb-6">
			{@render illustration()}
			<div class="flex flex-col items-center gap-2.5 text-center">
				<h1 class="text-title leading-[34px] font-bold">{steps[step].title}</h1>
				<p class="text-body leading-[22px] text-muted-foreground">{steps[step].text}</p>
			</div>
			{@render dots()}
			<div class="flex-1"></div>
			<Button size="lg" class="rounded-[14px]" onclick={next}
				>{last ? 'Empezar' : 'Siguiente'}</Button
			>
		</div>
	</div>

	<!-- Escritorio -->
	<section
		class="hidden w-full max-w-150 flex-col gap-6 rounded-3xl border bg-background px-12 py-11 shadow-[0_12px_32px_rgb(31_29_26/0.08)] md:flex"
	>
		{@render illustration()}
		<div class="flex flex-col items-center gap-2.5 text-center">
			<h1 class="text-3xl leading-9 font-bold">{steps[step].title}</h1>
			<p class="text-body leading-[22px] text-muted-foreground">{steps[step].text}</p>
		</div>
		{@render dots()}
		<div class="flex items-center justify-between">
			{#if last}
				<span></span>
			{:else}
				<button type="button" onclick={finish} class="text-sm font-semibold text-muted-foreground">
					Omitir
				</button>
			{/if}
			<Button onclick={next}>{last ? 'Empezar' : 'Siguiente'}</Button>
		</div>
	</section>
</main>
