<script lang="ts">
	import { mode, toggleMode } from 'mode-watcher';
	import { Button } from '#lib/components/ui/button/index.js';
	import AppIcon from './app-icon.svelte';
</script>

<Button
	variant="ghost"
	size="icon-sm"
	onclick={toggleMode}
	aria-label={mode.current === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
>
	<AppIcon name={mode.current === 'dark' ? 'sun' : 'moon'} size={18} />
</Button>
