<script lang="ts" generics="T extends string">
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';

	type Props = {
		label: string;
		value: T;
		options: { value: T; label: string }[];
		onchange: (value: T) => void;
	};

	let { label, value, options, onchange }: Props = $props();

	const current = $derived(options.find((o) => o.value === value)?.label ?? '');
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
	>
		<span class="flex-1 text-body font-medium">{label}</span>
		<span class="text-sm text-muted-foreground">{current}</span>
		<span class="text-xl leading-none text-tertiary" aria-hidden="true">›</span>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.RadioGroup {value} onValueChange={(v) => onchange(v as T)}>
			{#each options as option (option.value)}
				<DropdownMenu.RadioItem value={option.value}>{option.label}</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
