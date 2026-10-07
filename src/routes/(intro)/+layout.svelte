<script lang="ts">
	import { ThemeToggle } from '#lib/components/app/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="relative min-h-dvh">
	<div class="absolute top-3 right-3 z-20 md:top-4 md:right-4">
		<ThemeToggle />
	</div>
	{@render children()}
</div>
