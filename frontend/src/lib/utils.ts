import { get, writable } from 'svelte/store';
import type { Box, Rect } from './tools/types';

export { cn } from 'cn';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};

export function onAnimationFrame(callback: (deltaTime: number) => void) {
	let frameId: number | null = null;
	let lastTime = performance.now();
	let HALT = false;

	function loop() {
		if (HALT) return;

		const currentTime = performance.now();
		const dt = currentTime - lastTime;
		lastTime = currentTime;

		callback(dt);

		frameId = requestAnimationFrame(loop);
	}

	frameId = requestAnimationFrame(loop);

	return () => {
		HALT = true;
		if (frameId !== null) {
			cancelAnimationFrame(frameId);
		}
	};
}

export function getAngleDegrees(x1: number, y1: number, x2: number, y2: number) {
	return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
}

export function toRadians(angle: number) {
	return (angle * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
	return radians * (180 / Math.PI);
}

export const getDistance2D = (x1: number, y1: number, x2: number, y2: number) =>
	Math.hypot(x2 - x1, y2 - y1);

export function normalizeBox(box: Box): Box;
export function normalizeBox(x1: number, y1: number, x2: number, y2: number): Box;

export function normalizeBox(arg1: number | Box, y1?: number, x2?: number, y2?: number): Box {
	let x1_val: number;
	let y1_val: number;
	let x2_val: number;
	let y2_val: number;

	if (typeof arg1 === 'object' && arg1 !== null) {
		x1_val = arg1.x1;
		y1_val = arg1.y1;
		x2_val = arg1.x2;
		y2_val = arg1.y2;
	} else {
		x1_val = arg1;
		y1_val = y1!;
		x2_val = x2!;
		y2_val = y2!;
	}

	return {
		x1: Math.min(x1_val, x2_val),
		y1: Math.min(y1_val, y2_val),
		x2: Math.max(x1_val, x2_val),
		y2: Math.max(y1_val, y2_val)
	};
}
export function boxToRect(box: Box): Rect;
export function boxToRect(x1: number, y1: number, x2: number, y2: number): Rect;

export function boxToRect(arg1: number | Box, y1?: number, x2?: number, y2?: number): Rect {
	let x1_val: number;
	let y1_val: number;
	let x2_val: number;
	let y2_val: number;

	if (typeof arg1 === 'object' && arg1 !== null) {
		x1_val = arg1.x1;
		y1_val = arg1.y1;
		x2_val = arg1.x2;
		y2_val = arg1.y2;
	} else {
		x1_val = arg1;
		y1_val = y1!;
		x2_val = x2!;
		y2_val = y2!;
	}

	return {
		x: Math.min(x1_val, x2_val),
		y: Math.min(y1_val, y2_val),
		width: Math.abs(x2_val - x1_val),
		height: Math.abs(y2_val - y1_val)
	};
}

export function rectToBox(rect: Rect): Box;
export function rectToBox(x: number, y: number, width: number, height: number): Box;

export function rectToBox(arg1: number | Rect, y?: number, width?: number, height?: number): Box {
	let x_val: number;
	let y_val: number;
	let w_val: number;
	let h_val: number;

	if (typeof arg1 === 'object' && arg1 !== null) {
		x_val = arg1.x;
		y_val = arg1.y;
		w_val = arg1.width;
		h_val = arg1.height;
	} else {
		x_val = arg1;
		y_val = y!;
		w_val = width!;
		h_val = height!;
	}

	return {
		x1: x_val,
		y1: y_val,
		x2: x_val + w_val,
		y2: y_val + h_val
	};
}

function withProps<F extends (...args: any[]) => any, P extends object>(fn: F, props: P): F & P {
	return Object.assign(fn, props);
}

const _mousexwritable = writable(0);
const _mouseywritable = writable(0);
export const mouseX = withProps(() => get(_mousexwritable), _mousexwritable);
export const mouseY = withProps(() => get(_mouseywritable), _mouseywritable);
