<script lang="ts">
	import { onMount } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';
	import './layout.css';
	import Editor from './Editor.svelte';
	import Tooltips from './Tooltips.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import { loadSettings } from '$lib/settings.svelte';
	import { HasSnapshot } from '$lib/wailsjs/go/main/ScreenshotService';
	let canvas = $state<HTMLCanvasElement>();
	let hasSnapshot = $state(false);
	let ready = $state(false);

	onMount(async () => {
		await loadSettings();
		hasSnapshot = await HasSnapshot();
		ready = true;

		if (!hasSnapshot) return;

		const image = new Image();

		image.src = `/shutter/snapshot.png?t=${Date.now()}`;

		await image.decode();
		if (!canvas) return;
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;

		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(image, 0, 0);
	});
</script>

<ModeWatcher />
<Tooltips />

{#if !ready}
	<div></div>
{:else if hasSnapshot}
	<Editor />
{:else}
	<SettingsPanel />
{/if}
