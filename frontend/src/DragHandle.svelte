<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { mousePos, registerMouseMove, registerMouseUp, type MoveCallback } from './dragstate';
	import { get } from 'svelte/store';

	let {
		children,
		onMove,
		dragging = $bindable()
	}: {
		children?: Snippet;
		onMouseUp?: () => void;
		onMouseDown?: () => void;
		onMove?: ({
			ix,
			iy,
			px,
			py,
			dpx,
			dpy,
			diy,
			dix
		}: {
			ix: number;
			iy: number;
			px: number;
			py: number;
			dpx: number;
			dpy: number;
			diy: number;
			dix: number;
		}) => void;
		dragging?: boolean;
	} = $props();

	let unregister = () => {};
	onDestroy(unregister);
	let t = $state('asddfS');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	onmousedown={() => {
		dragging = true;
		let last = get(mousePos);
		unregister = registerMouseMove((e) => {
			const event = {
				...e,
				dix: e.ix - last.ix,
				diy: e.iy - last.iy,
				dpx: e.px - last.px,
				dpy: e.py - last.py
			};
			onMove?.(event);
			t = JSON.stringify(event);
			last = e;
		});
		registerMouseUp(() => {
			dragging = false;
			unregister();
		}, true);
	}}
	class="w-full h-full"
>
	{@render children?.()}
</div>
