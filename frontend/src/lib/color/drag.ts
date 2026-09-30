export type DragPoint = {
	x: number;
	y: number;
	start: boolean;
};

export function createDrag(update: (point: DragPoint) => void) {
	let active = false;

	function report(e: PointerEvent, start: boolean) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		update({
			x: (e.clientX - rect.left) / rect.width,
			y: (e.clientY - rect.top) / rect.height,
			start
		});
	}

	function end(e: PointerEvent) {
		active = false;
		const el = e.currentTarget as HTMLElement;
		if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
	}

	return {
		onpointerdown(e: PointerEvent) {
			if (e.button !== 0) return;
			const el = e.currentTarget as HTMLElement;
			e.preventDefault();
			el.focus();
			el.setPointerCapture(e.pointerId);
			active = true;
			report(e, true);
		},
		onpointermove(e: PointerEvent) {
			if (active) report(e, false);
		},
		onpointerup: end,
		onpointercancel: end
	};
}

export function arrowDelta(e: KeyboardEvent): { dx: number; dy: number } | null {
	const n = e.shiftKey ? 10 : 1;
	switch (e.key) {
		case 'ArrowLeft':
			return { dx: -n, dy: 0 };
		case 'ArrowRight':
			return { dx: n, dy: 0 };
		case 'ArrowUp':
			return { dx: 0, dy: n };
		case 'ArrowDown':
			return { dx: 0, dy: -n };
		default:
			return null;
	}
}
