import type { Point } from '$lib/tools/types';
import type { Snippet } from 'svelte';

export type Direction =
	'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type TooltipContent = string | Snippet<[]>;

export type Anchor = HTMLElement | Point | 'mouse';

export type TooltipId = string | number;

export interface TooltipOptions {
	id?: string;
	content: TooltipContent;
	anchor: Anchor;
	direction?: Direction;
	timeout?: number;
	class?: string;
}

export interface TooltipItem {
	id: TooltipId;
	rev: number;
	content: TooltipContent;
	anchor: Anchor;
	direction: Direction;
	class?: string;
}

export interface TooltipHandle {
	readonly id: TooltipId;
	update(patch: Partial<Omit<TooltipOptions, 'id'>>): void;
	close(): void;
}

const SNAP_MS = 1000;
const EASE_MS = 45;

let nextId = 0;

const defaultDirection = (anchor: Anchor): Direction =>
	anchor instanceof HTMLElement ? 'bottom' : 'bottom-right';

class TooltipManager {
	items = $state.raw<TooltipItem[]>([]);
	pointer: Point = { x: 0, y: 0 };
	positions = new Map<TooltipId, Point>();

	#timers = new Map<TooltipId, ReturnType<typeof setTimeout>>();
	#lastRemoved: (Point & { time: number }) | null = null;

	has = (id: TooltipId) => this.items.some((i) => i.id === id);

	show = (opts: TooltipOptions): TooltipHandle => {
		const id: TooltipId = opts.id ?? nextId++;
		const next = {
			content: opts.content,
			anchor: opts.anchor,
			direction: opts.direction ?? defaultDirection(opts.anchor),
			class: opts.class
		};
		const cur = this.items.find((i) => i.id === id);
		if (cur) {
			const rev = next.content !== cur.content ? cur.rev + 1 : cur.rev;
			this.items = this.items.map((i) => (i === cur ? { ...next, id, rev } : i));
		} else {
			this.items = [...this.items, { ...next, id, rev: 0 }];
		}
		this.#arm(id, opts.timeout);
		return {
			id,
			update: (patch) => this.update(id, patch),
			close: () => this.hide(id)
		};
	};

	update = (id: TooltipId, patch: Partial<Omit<TooltipOptions, 'id'>>) => {
		const cur = this.items.find((i) => i.id === id);
		if (!cur) return;
		const { timeout, ...rest } = patch;
		const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
		const next = { ...cur, ...clean } as TooltipItem;
		if (next.content !== cur.content) next.rev = cur.rev + 1;
		this.items = this.items.map((i) => (i === cur ? next : i));
		if (timeout !== undefined) this.#arm(id, timeout);
	};

	hide = (id: TooltipId) => {
		if (!this.has(id)) return;
		clearTimeout(this.#timers.get(id));
		this.#timers.delete(id);
		const pos = this.positions.get(id);
		if (pos) this.#lastRemoved = { x: pos.x, y: pos.y, time: Date.now() };
		this.positions.delete(id);
		this.items = this.items.filter((i) => i.id !== id);
	};

	hideAll = () => {
		for (const i of this.items) this.hide(i.id);
	};

	takeStartPosition(): Point | null {
		const lr = this.#lastRemoved;
		if (lr && Date.now() - lr.time < SNAP_MS) return { x: lr.x, y: lr.y };
		return null;
	}

	#arm(id: TooltipId, timeout?: number) {
		clearTimeout(this.#timers.get(id));
		this.#timers.delete(id);
		if (timeout && timeout > 0) {
			this.#timers.set(
				id,
				setTimeout(() => this.hide(id), timeout)
			);
		}
	}
}

export const tooltips = new TooltipManager();

export const showTooltip = tooltips.show;

type Rect = { left: number; right: number; top: number; bottom: number };

function anchorRect(anchor: Anchor): Rect {
	if (anchor === 'mouse') {
		const { x, y } = tooltips.pointer;
		return { left: x, right: x, top: y, bottom: y };
	}
	if (anchor instanceof HTMLElement) return anchor.getBoundingClientRect();
	return { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
}

function computeTarget(item: TooltipItem, w: number, h: number): Point {
	const r = anchorRect(item.anchor);
	const gap = item.anchor instanceof HTMLElement ? 6 : 14;
	const parts = item.direction.split('-');
	const v = parts.find((p) => p === 'top' || p === 'bottom');
	const hz = parts.find((p) => p === 'left' || p === 'right');

	let x = (r.left + r.right) / 2 - w / 2;
	let y = (r.top + r.bottom) / 2 - h / 2;

	if (v === 'top') y = r.top - h - gap;
	else if (v === 'bottom') y = r.bottom + gap;
	if (hz === 'left') x = r.left - w - gap;
	else if (hz === 'right') x = r.right + gap;

	const pad = 4;
	x = Math.max(pad, Math.min(x, window.innerWidth - w - pad));
	y = Math.max(pad, Math.min(y, window.innerHeight - h - pad));
	return { x, y };
}

export function place(node: HTMLElement, id: TooltipId) {
	let cur: Point | null = tooltips.takeStartPosition();
	let last = performance.now();
	let raf = 0;

	const frame = (now: number) => {
		raf = requestAnimationFrame(frame);

		const item = tooltips.items.find((i) => i.id === id);
		if (!item) return;

		if (item.anchor instanceof HTMLElement && !item.anchor.isConnected) {
			tooltips.hide(id);
			return;
		}

		const target = computeTarget(item, node.offsetWidth, node.offsetHeight);
		if (!cur) {
			cur = target;
		} else {
			const k = 1 - Math.exp(-(now - last) / EASE_MS);
			cur.x += (target.x - cur.x) * k;
			cur.y += (target.y - cur.y) * k;
			if (Math.abs(target.x - cur.x) < 0.1 && Math.abs(target.y - cur.y) < 0.1) {
				cur.x = target.x;
				cur.y = target.y;
			}
		}
		last = now;

		tooltips.positions.set(id, cur);
		node.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
	};

	frame(performance.now());

	return {
		destroy() {
			cancelAnimationFrame(raf);
		}
	};
}

export function flash(node: HTMLElement, rev: number) {
	return {
		update(next: number) {
			if (next === rev) return;
			rev = next;
			node.animate(
				[
					{ backgroundColor: 'var(--tooltip-flash-bg, rgb(90, 90, 90))' },
					{ backgroundColor: 'var(--tooltip-bg, rgb(40, 40, 40))' }
				],
				{ duration: 500, easing: 'ease-out' }
			);
		}
	};
}

export function trackPointer() {
	const move = (e: MouseEvent) => {
		tooltips.pointer.x = e.clientX;
		tooltips.pointer.y = e.clientY;
	};
	window.addEventListener('mousemove', move, { passive: true });
	return () => window.removeEventListener('mousemove', move);
}

export function attachDomTooltips(root: Document | HTMLElement = document) {
	let current: { el: HTMLElement; handle: TooltipHandle } | null = null;

	const close = () => {
		current?.handle.close();
		current = null;
	};

	const over = (e: MouseEvent) => {
		const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tooltip]');
		if (!el || el === current?.el) return;
		close();
		const text = el.dataset.tooltip;
		if (!text) return;
		current = {
			el,
			handle: tooltips.show({
				id: el.dataset.tooltipId,
				content: text,
				anchor: el.dataset.tooltipFollow !== undefined ? 'mouse' : el,
				direction: el.dataset.tooltipDirection as Direction | undefined
			})
		};
	};

	const out = (e: MouseEvent) => {
		if (!current) return;
		const to = e.relatedTarget as Node | null;
		if (to && current.el.contains(to)) return;
		close();
	};

	root.addEventListener('mouseover', over as any);
	root.addEventListener('mouseout', out as any);
	return () => {
		root.removeEventListener('mouseover', over as any);
		root.removeEventListener('mouseout', out as any);
		close();
	};
}

export interface TooltipActionConfig {
	content: TooltipContent;
	id?: string;
	direction?: Direction;
	follow?: boolean;
	timeout?: number;
	class?: string;
}

export type TooltipActionOptions = TooltipContent | TooltipActionConfig;

const normalize = (o: TooltipActionOptions): TooltipActionConfig =>
	typeof o === 'string' || typeof o === 'function' ? { content: o } : o;

export function tooltip(node: HTMLElement, options: TooltipActionOptions) {
	let cfg = normalize(options);
	let handle: TooltipHandle | null = null;

	const leave = () => {
		handle?.close();
		handle = null;
	};
	const enter = () => {
		if (!cfg.id) leave();
		handle = tooltips.show({
			id: cfg.id,
			content: cfg.content,
			anchor: cfg.follow ? 'mouse' : node,
			direction: cfg.direction,
			timeout: cfg.timeout,
			class: cfg.class
		});
	};

	node.addEventListener('mouseenter', enter);
	node.addEventListener('mouseleave', leave);
	node.addEventListener('focusin', enter);
	node.addEventListener('focusout', leave);

	return {
		update(next: TooltipActionOptions) {
			cfg = normalize(next);
			handle?.update({ content: cfg.content, direction: cfg.direction, class: cfg.class });
		},
		destroy() {
			leave();
			node.removeEventListener('mouseenter', enter);
			node.removeEventListener('mouseleave', leave);
			node.removeEventListener('focusin', enter);
			node.removeEventListener('focusout', leave);
		}
	};
}
