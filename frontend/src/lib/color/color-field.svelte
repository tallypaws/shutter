<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import { cn } from '$lib/utils.js';
	import { clamp, round } from './color.js';

	let {
		value,
		label,
		live = true,
		step,
		min = -Infinity,
		max = Infinity,
		oncommit,
		class: className
	}: {
		value: string;
		label: string;
		live?: boolean;
		step?: number;
		min?: number;
		max?: number;
		oncommit: (raw: string) => void;
		class?: string;
	} = $props();

	let focused = $state(false);
	let draft = $state('');

	function handleFocus(e: FocusEvent) {
		focused = true;
		draft = value;
		(e.currentTarget as HTMLInputElement).select();
	}

	function handleInput(e: Event) {
		draft = (e.currentTarget as HTMLInputElement).value;
		if (live) oncommit(draft);
	}

	function handleBlur() {
		if (!live) oncommit(draft);
		focused = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		const el = e.currentTarget as HTMLInputElement;
		if (e.key === 'Enter') {
			el.blur();
			return;
		}
		if (!step || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
		e.preventDefault();
		const dir = e.key === 'ArrowUp' ? 1 : -1;
		const n = Number(draft);
		const base = Number.isFinite(n) ? n : Number(value);
		draft = String(round(clamp(base + dir * step * (e.shiftKey ? 10 : 1), min, max), 2));
		oncommit(draft);
	}
</script>

<label data-slot="color-field" class={cn('flex min-w-0 flex-col items-center gap-1', className)}>
	<Input
		class="h-8 px-1.5 text-center font-mono text-xs md:text-xs"
		inputmode={step ? 'decimal' : 'text'}
		spellcheck={false}
		autocomplete="off"
		value={focused ? draft : value}
		onfocus={handleFocus}
		oninput={handleInput}
		onblur={handleBlur}
		onkeydown={handleKeydown}
	/>
	<span class="text-[10px] font-medium text-muted-foreground uppercase">{label}</span>
</label>
