import { writable } from 'svelte/store';
import { v7 } from 'uuid';

export type MoveCallback = ({
	ix,
	iy,
	px,
	py
}: {
	ix: number;
	iy: number;
	px: number;
	py: number;
}) => void;

export const mouseMoveListeners = writable<Record<string, MoveCallback>>({});
export const mouseUpListeners = writable<Record<string, () => void>>({});
export const mouseDownListeners = writable<Record<string, () => void>>({});

export function registerMouseMove(cb: MoveCallback) {
	const id = v7();
	mouseMoveListeners.update((l) => {
		l[id] = cb;
		return l;
	});

	return () => {
		mouseMoveListeners.update((l) => {
			delete l[id];
			return l;
		});
	};
}

export function registerMouseUp(cb: () => void, once = false) {
	const id = v7();
	const stop = () => {
		mouseUpListeners.update((l) => {
			delete l[id];
			return l;
		});
	};
	mouseUpListeners.update((l) => {
		l[id] = once
			? () => {
					stop();
					cb();
				}
			: cb;
		return l;
	});

	return stop;
}
export function registerMouseDown(cb: () => void) {
	const id = v7();
	mouseDownListeners.update((l) => {
		l[id] = cb;
		return l;
	});

	return () => {
		mouseDownListeners.update((l) => {
			delete l[id];
			return l;
		});
	};
}

export const mousePos = writable({
	ix: 0,
	iy: 0,
	px: 0,
	py: 0
});

registerMouseMove((e) => {
	mousePos.set(e);
});
