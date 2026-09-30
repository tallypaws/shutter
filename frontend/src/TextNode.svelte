<script lang="ts">
	import type { TextElement } from '$lib/tools/types';
	import { cssFont, measureText, textTransform } from '$lib/tools/text';

	let {
		el,
		editing,
		oninput,
		onexit
	}: {
		el: TextElement;
		editing: boolean;
		oninput: (text: string) => void;
		onexit: () => void;
	} = $props();

	let input = $state<HTMLTextAreaElement>();
	const size = $derived(measureText(el));
	const boxWidth = $derived(size.width + el.fontSize);

	$effect(() => {
		if (!editing || !input) return;
		const node = input;
		const t = setTimeout(() => {
			node.focus();
			node.setSelectionRange(node.value.length, node.value.length);
		}, 0);
		return () => clearTimeout(t);
	});
</script>

<g transform={textTransform(el)}>
<foreignObject
	x={0}
	y={0}
	width={boxWidth}
	height={size.height}
	style="overflow: visible; pointer-events: none"
>
	<textarea
		bind:this={input}
		value={el.text}
		readonly={!editing}
		tabindex={editing ? 0 : -1}
		wrap="off"
		rows="1"
		spellcheck="false"
		autocomplete="off"
		class="text-el"
		class:editing
		style:font={cssFont(el)}
		style:color={el.color}
		style:width="{boxWidth}px"
		style:height="{size.height}px"
		oninput={(e) => oninput(e.currentTarget.value)}
		onblur={onexit}
		onpointerdown={(e) => editing && e.stopPropagation()}
		onkeydown={(e) => e.key === 'Escape' && e.currentTarget.blur()}></textarea>
</foreignObject>
</g>

<style>
	.text-el {
		display: block;
		margin: 0;
		padding: 0;
		border: 0;
		outline: none;
		background: transparent;
		resize: none;
		overflow: hidden;
		white-space: pre;
		caret-color: currentColor;
		pointer-events: none;
		user-select: none;
	}
	.text-el.editing {
		pointer-events: auto;
		user-select: text;
		cursor: text;
	}
</style>
