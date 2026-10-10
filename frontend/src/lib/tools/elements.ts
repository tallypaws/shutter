import { v7 as uuid } from 'uuid';
import type {
	AnyElement,
	CircleElement,
	DrawElement,
	ElementHandle,
	RectElement,
	TextElement,
	BlurElement,
	PixelateElement,
	HandleKind,
	Point,
	Rect,
	ToolId,
	ToolModifiers,
	Box,
	ImageElement
} from './types';
import {
	boxToRect,
	getAngleDegrees,
	getDistance2D,
	normalizeBox,
	rectToBox,
	toDegrees,
	toRadians
} from '$lib/utils';
import {
	ArrowDefault,
	CricleDefault,
	HitPadding,
	LineDefault,
	PenDefault,
	HighlighterDefault,
	RectDefault,
	RotateHandleOffset,
	SnapRotationStep,
	SnapAngleStep,
	SnapAngleStepFine,
	TextDefault,
	BlurDefault,
	PixelateDefault
} from './defaults';
import { textCenter, textSize } from './text';

function assertNever(x: never): never {
	throw new Error(`Unhandled element: ${JSON.stringify(x)}`);
}

const noModifiers: ToolModifiers = { shift: false, alt: false, ctrl: false };

export function snapAngle(
	from: Point,
	to: Point,
	stepDegrees = SnapAngleStep,
	referenceAngleRad = 0
): Point {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const distance = Math.hypot(dx, dy);
	if (distance === 0) return to;

	const step = (stepDegrees * Math.PI) / 180;
	const angle =
		Math.round((Math.atan2(dy, dx) + referenceAngleRad) / step) * step - referenceAngleRad;

	return {
		x: from.x + Math.cos(angle) * distance,
		y: from.y + Math.sin(angle) * distance
	};
}

function withDefaults<D extends object>(defaults: D, options: Record<string, unknown>): D {
	const defined = Object.entries(options).filter(([, v]) => v !== undefined);
	return { ...defaults, ...Object.fromEntries(defined) } as D;
}

export function createElement(
	tool: ToolId,
	point: Point,
	options: Record<string, unknown>,
	modifiers: ToolModifiers = noModifiers
): AnyElement | null {
	switch (tool) {
		case 'line': {
			const o = withDefaults(LineDefault, options);
			return {
				id: uuid(),
				type: 'line',
				x1: point.x,
				y1: point.y,
				x2: point.x,
				y2: point.y,
				color: o.color,
				thickness: o.thickness
			};
		}
		case 'arrow': {
			const o = withDefaults(ArrowDefault, options);
			return {
				id: uuid(),
				type: 'arrow',
				x1: point.x,
				y1: point.y,
				x2: point.x,
				y2: point.y,
				color: o.color,
				thickness: o.thickness,
				head: true,
				headlen: o.headlen,
				headangle: o.headangle,
				tail: o.tail,
				taillen: o.taillen,
				tailangle: o.tailangle
			};
		}
		case 'rect': {
			const o = withDefaults(RectDefault, options);
			return {
				id: uuid(),
				type: 'rect',
				x1: point.x,
				y1: point.y,
				x2: point.x,
				y2: point.y,
				fill: o.fill,
				fillColor: o.fillColor,
				outline: o.outline,
				outlineColor: o.outlineColor,
				outlineWidth: o.outlineWidth,
				radius: o.radius,
				rotation: 0
			};
		}
		case 'circle': {
			const o = withDefaults(CricleDefault, options);
			return {
				id: uuid(),
				type: 'circle',
				cx: point.x,
				cy: point.y,
				rx: 0,
				ry: 0,
				rotation: 0,
				fill: o.fill,
				fillColor: o.fillColor,
				outline: o.outline,
				outlineColor: o.outlineColor,
				outlineWidth: o.outlineWidth
			};
		}
		case 'pen': {
			const o = withDefaults(PenDefault, options);
			return {
				id: uuid(),
				type: 'draw',
				points: [point],
				color: o.color,
				thickness: o.thickness,
				smoothing: o.smoothing,
				rotation: 0
			};
		}
		case 'highlighter': {
			const o = withDefaults(HighlighterDefault, options);
			return {
				id: uuid(),
				type: 'draw',
				points: [point],
				color: o.color,
				thickness: o.thickness,
				smoothing: o.smoothing,
				rotation: 0,
				opacity: o.opacity,
				highlighter: true
			};
		}
		case 'text': {
			const o = withDefaults(TextDefault, options);
			return {
				id: uuid(),
				type: 'text',
				x: point.x,
				y: point.y,
				text: '',
				sx: 1,
				sy: 1,
				rotation: 0,
				...o
			};
		}
		case 'blur': {
			const o = withDefaults(BlurDefault, options);
			return {
				id: uuid(),
				type: 'blur',
				x1: point.x,
				y1: point.y,
				x2: point.x,
				y2: point.y,
				radius: o.radius
			};
		}
		case 'pixelate': {
			const o = withDefaults(PixelateDefault, options);
			return {
				id: uuid(),
				type: 'pixelate',
				x1: point.x,
				y1: point.y,
				x2: point.x,
				y2: point.y,
				size: o.size
			};
		}
		case 'crop':
		case 'select':
		case 'image':
		case 'clone':
			return null;
		default:
			return assertNever(tool);
	}
}

export function createImageElement(
	assetId: string,
	natural: { width: number; height: number },
	center: Point,
	area: { width: number; height: number }
): ImageElement {
	const scale = Math.min(1, (area.width * 0.6) / natural.width, (area.height * 0.6) / natural.height);
	const hw = (natural.width * scale) / 2;
	const hh = (natural.height * scale) / 2;
	return {
		id: uuid(),
		type: 'image',
		assetId,
		x1: center.x - hw,
		y1: center.y - hh,
		x2: center.x + hw,
		y2: center.y + hh,
		rotation: 0
	};
}

export function createImageElementAt(assetId: string, area: Rect): ImageElement {
	return {
		id: uuid(),
		type: 'image',
		assetId,
		x1: area.x,
		y1: area.y,
		x2: area.x + area.width,
		y2: area.y + area.height,
		rotation: 0
	};
}

export function updateElementEnd(
	el: AnyElement,
	point: Point,
	modifiers: ToolModifiers = noModifiers,
	origin: Point = point,
	minDistance = 0
): AnyElement {
	switch (el.type) {
		case 'line':
		case 'arrow': {
			const target = modifiers.shift ? snapAngle({ x: el.x1, y: el.y1 }, point) : point;
			return { ...el, x2: target.x, y2: target.y };
		}
		case 'rect': {
			const target = modifiers.shift
				? snapAngle({ x: el.x1, y: el.y1 }, point, SnapAngleStepFine)
				: point;
			return { ...el, x2: target.x, y2: target.y };
		}
		case 'circle': {
			let dx = point.x - origin.x;
			let dy = point.y - origin.y;
			if (modifiers.shift) {
				const size = Math.max(Math.abs(dx), Math.abs(dy));
				dx = Math.sign(dx || 1) * size;
				dy = Math.sign(dy || 1) * size;
			}
			if (modifiers.alt) {
				return {
					...el,
					cx: origin.x,
					cy: origin.y,
					rx: Math.abs(dx),
					ry: Math.abs(dy),
					rotation: 0
				};
			}
			return {
				...el,
				cx: origin.x + dx / 2,
				cy: origin.y + dy / 2,
				rx: Math.abs(dx) / 2,
				ry: Math.abs(dy) / 2,
				rotation: 0
			};
		}
		case 'draw': {
			const pts = el.points;
			const n = pts.length;
			const tail =
				minDistance > 0 &&
				n >= 2 &&
				getDistance2D(pts[n - 2].x, pts[n - 2].y, pts[n - 1].x, pts[n - 1].y) < minDistance;
			if (tail) pts[n - 1] = point;
			else pts.push(point);
			return el;
		}
		case 'blur':
		case 'pixelate': {
			let target = point;
			if (modifiers.shift) {
				const dx = point.x - el.x1;
				const dy = point.y - el.y1;
				const size = Math.max(Math.abs(dx), Math.abs(dy));
				target = { x: el.x1 + Math.sign(dx || 1) * size, y: el.y1 + Math.sign(dy || 1) * size };
			}
			return { ...el, x2: target.x, y2: target.y };
		}
		case 'text':
		case 'image':
			return el;
		default: {
			return assertNever(el);
		}
	}
}

export function finishElement(el: AnyElement): AnyElement {
	switch (el.type) {
		case 'rect':
		case 'blur':
		case 'pixelate': {
			return { ...el, ...normalizeBox(el) };
		}
		default: {
			return el;
		}
	}
}

export function hitTestElement(mousePoint: Point, el: AnyElement): boolean {
	switch (el.type) {
		case 'line':
		case 'arrow':
			return (
				distanceToSegment(mousePoint, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <=
				el.thickness / 2 + HitPadding
			);
		case 'rect': {
			const frame = boxFrame(el, el.rotation);
			const q = toLocal(frame, mousePoint);
			return insideBox(el.x1, el.y1, el.x2, el.y2, frame.cx + q.x, frame.cy + q.y, el.outlineWidth);
		}
		case 'image': {
			const frame = boxFrame(el, el.rotation);
			const q = toLocal(frame, mousePoint);
			return insideBox(el.x1, el.y1, el.x2, el.y2, frame.cx + q.x, frame.cy + q.y, 2);
		}

		case 'circle': {
			const pad = el.outlineWidth / 2 + HitPadding;
			const q = toLocal(el, mousePoint);
			const rx = el.rx + pad;
			const ry = el.ry + pad;
			return (q.x / rx) ** 2 + (q.y / ry) ** 2 <= 1;
		}
		case 'draw': {
			const q = el.rotation ? toLocalDraw(el, mousePoint) : mousePoint;
			let lastPoint: Point | null = null;
			for (const elPoint of el.points) {
				const distance = lastPoint
					? distanceToSegment(q, elPoint, lastPoint)
					: getDistance2D(q.x, q.y, elPoint.x, elPoint.y);
				if (distance <= el.thickness / 2 + HitPadding) return true;
				lastPoint = elPoint;
			}
			return false;
		}
		case 'blur':
		case 'pixelate':
			return insideBox(el.x1, el.y1, el.x2, el.y2, mousePoint.x, mousePoint.y, 2);
		case 'text': {
			const c = textCenter(el);
			const t = textSize(el);
			const q = toLocal({ cx: c.x, cy: c.y, rotation: el.rotation }, mousePoint);
			return (
				Math.abs(q.x) <= t.width / 2 + HitPadding && Math.abs(q.y) <= t.height / 2 + HitPadding
			);
		}
		default:
			return assertNever(el);
	}
}

export function getElementBounds(el: AnyElement): Rect {
	switch (el.type) {
		case 'line':
		case 'arrow': {
			const pad = el.thickness / 2 + HitPadding;
			return {
				x: Math.min(el.x1, el.x2) - pad,
				y: Math.min(el.y1, el.y2) - pad,
				width: Math.abs(el.x2 - el.x1) + pad * 2,
				height: Math.abs(el.y2 - el.y1) + pad * 2
			};
		}
		case 'rect': {
			const pad = el.outlineWidth / 2 + HitPadding;
			return {
				x: Math.min(el.x1, el.x2) - pad,
				y: Math.min(el.y1, el.y2) - pad,
				width: Math.abs(el.x2 - el.x1) + pad * 2,
				height: Math.abs(el.y2 - el.y1) + pad * 2
			};
		}
		case 'image':
			return boxToRect(
				Math.min(el.x1, el.x2) - HitPadding,
				Math.min(el.y1, el.y2) - HitPadding,
				Math.max(el.x1, el.x2) + HitPadding,
				Math.max(el.y1, el.y2) + HitPadding
			);
		case 'circle': {
			const pad = el.outlineWidth / 2 + HitPadding;
			return {
				x: el.cx - el.rx - pad,
				y: el.cy - el.ry - pad,
				width: (el.rx + pad) * 2,
				height: (el.ry + pad) * 2
			};
		}
		case 'draw': {
			const points = el.points;

			if (!points || points.length === 0) {
				return boxToRect(0, 0, 0, 0);
			}

			let minx = points[0].x;
			let maxx = points[0].x;
			let miny = points[0].y;
			let maxy = points[0].y;

			for (let i = 1; i < points.length; i++) {
				const p = points[i];
				if (p.x < minx) minx = p.x;
				if (p.x > maxx) maxx = p.x;
				if (p.y < miny) miny = p.y;
				if (p.y > maxy) maxy = p.y;
			}
			const pad = el.thickness / 2 + HitPadding;

			return boxToRect(minx - pad, miny - pad, maxx + pad, maxy + pad);
		}
		case 'blur':
		case 'pixelate':
			return boxToRect(
				Math.min(el.x1, el.x2) - HitPadding,
				Math.min(el.y1, el.y2) - HitPadding,
				Math.max(el.x1, el.x2) + HitPadding,
				Math.max(el.y1, el.y2) + HitPadding
			);
		case 'text': {
			const t = textSize(el);
			return {
				x: el.x - HitPadding,
				y: el.y - HitPadding,
				width: t.width + HitPadding * 2,
				height: t.height + HitPadding * 2
			};
		}
		default:
			return assertNever(el);
	}
}

export function getElementHandles(el: AnyElement): ElementHandle[] {
	switch (el.type) {
		case 'line':
			return [
				{ id: 'start', x: el.x1, y: el.y1, kind: 'dot' },
				{ id: 'end', x: el.x2, y: el.y2, kind: 'dot' }
			];
		case 'arrow' /**
		 		{const angle = $derived(getAngleDegrees(el.x1, el.y1, el.x2, el.y2))}

				{const radians = $derived((angle * Math.PI) / 180)}
				{const firstheadRadians = $derived(radians + (el.headangle * Math.PI) / 180)}
				{const firstx = $derived(el.x2 - Math.cos(firstheadRadians) * el.headlen)}
				{const firsty = $derived(el.y2 - Math.sin(firstheadRadians) * el.headlen)}
		 */: {
			const angle = getAngleDegrees(el.x1, el.y1, el.x2, el.y2);
			const rad = (angle * Math.PI) / 180;
			const headRad = rad + (el.headangle * Math.PI) / 180;
			const tailRad = rad + (el.tailangle * Math.PI) / 180;
			const headx = el.x2 - Math.cos(headRad) * el.headlen;
			const heady = el.y2 - Math.sin(headRad) * el.headlen;
			const tailx = el.x1 - Math.cos(tailRad) * el.taillen;
			const taily = el.y1 - Math.sin(tailRad) * el.taillen;

			const handles: ElementHandle[] = [
				{ id: 'start', x: el.x1, y: el.y1, kind: 'dot' },
				{ id: 'end', x: el.x2, y: el.y2, kind: 'dot' },
				{ id: 'head', x: headx, y: heady, kind: 'head' }
			];

			if (el.tail) {
				handles.push({ id: 'tail', x: tailx, y: taily, kind: 'head' });
			}

			return handles;
		}
		case 'rect': {
			const frame = boxFrame(el, el.rotation);
			const lx1 = (el.x1 - el.x2) / 2;
			const lx2 = -lx1;
			const ly1 = (el.y1 - el.y2) / 2;
			const ly2 = -ly1;
			const minLx = Math.min(lx1, lx2);
			const minLy = Math.min(ly1, ly2);
			const maxR = Math.min(Math.abs(lx2 - lx1), Math.abs(ly2 - ly1)) / 2;
			const off = Math.min(Math.max(12, el.radius), maxR);
			const side = (a: number, b: number): 1 | -1 => (a >= b ? 1 : -1);
			const at = (
				id: string,
				kind: ElementHandle['kind'],
				lx: number,
				ly: number,
				dir?: ElementHandle['dir']
			): ElementHandle => {
				const p = fromLocal(frame, lx, ly);
				return { id, kind, x: p.x, y: p.y, dir, rotation: el.rotation };
			};

			return [
				at('radius', 'radius', minLx + off, minLy + off),

				at('x1y1', 'corner', lx1, ly1, { x: side(lx1, lx2), y: side(ly1, ly2) }),
				at('x2y2', 'corner', lx2, ly2, { x: side(lx2, lx1), y: side(ly2, ly1) }),
				at('x1y2', 'corner', lx1, ly2, { x: side(lx1, lx2), y: side(ly2, ly1) }),
				at('x2y1', 'corner', lx2, ly1, { x: side(lx2, lx1), y: side(ly1, ly2) }),

				at('x1', 'vertical', lx1, 0),
				at('x2', 'vertical', lx2, 0),
				at('y1', 'horizontal', 0, ly1),
				at('y2', 'horizontal', 0, ly2),

				at('rotate', 'rotate', 0, minLy - RotateHandleOffset)
			];
		}
		case 'image': {
			const frame = boxFrame(el, el.rotation);
			const lx1 = (el.x1 - el.x2) / 2;
			const lx2 = -lx1;
			const ly1 = (el.y1 - el.y2) / 2;
			const ly2 = -ly1;
			const minLy = Math.min(ly1, ly2);
			const side = (a: number, b: number): 1 | -1 => (a >= b ? 1 : -1);
			const at = (
				id: string,
				kind: ElementHandle['kind'],
				lx: number,
				ly: number,
				dir?: ElementHandle['dir']
			): ElementHandle => {
				const p = fromLocal(frame, lx, ly);
				return { id, kind, x: p.x, y: p.y, dir, rotation: el.rotation };
			};

			return [
				at('x1y1', 'corner', lx1, ly1, { x: side(lx1, lx2), y: side(ly1, ly2) }),
				at('x2y2', 'corner', lx2, ly2, { x: side(lx2, lx1), y: side(ly2, ly1) }),
				at('x1y2', 'corner', lx1, ly2, { x: side(lx1, lx2), y: side(ly2, ly1) }),
				at('x2y1', 'corner', lx2, ly1, { x: side(lx2, lx1), y: side(ly1, ly2) }),

				at('x1', 'vertical', lx1, 0),
				at('x2', 'vertical', lx2, 0),
				at('y1', 'horizontal', 0, ly1),
				at('y2', 'horizontal', 0, ly2),

				at('rotate', 'rotate', 0, minLy - RotateHandleOffset)
			];
		}
		case 'circle': {
			const rotation = el.rotation;
			const at = (
				id: string,
				kind: ElementHandle['kind'],
				lx: number,
				ly: number,
				dir?: ElementHandle['dir']
			) => {
				const p = fromLocal(el, lx, ly);
				return { id, kind, x: p.x, y: p.y, dir, rotation } satisfies ElementHandle;
			};

			return [
				at('nw', 'corner', -el.rx, -el.ry, { x: -1, y: -1 }),
				at('ne', 'corner', el.rx, -el.ry, { x: 1, y: -1 }),
				at('se', 'corner', el.rx, el.ry, { x: 1, y: 1 }),
				at('sw', 'corner', -el.rx, el.ry, { x: -1, y: 1 }),
				at('n', 'horizontal', 0, -el.ry),
				at('s', 'horizontal', 0, el.ry),
				at('e', 'vertical', el.rx, 0),
				at('w', 'vertical', -el.rx, 0),

				at('rotate', 'rotate', 0, -el.ry - el.outlineWidth / 2 - RotateHandleOffset)
			];
		}
		case 'draw': {
			const frame = drawFrame(el);
			const minLy = -getElementBounds(el).height / 2;
			const p = fromLocal(frame, 0, minLy - RotateHandleOffset);
			return [
				{ id: 'rotate', kind: 'rotate', x: p.x, y: p.y, rotation: el.rotation } satisfies ElementHandle
			];
		}
		case 'blur':
		case 'pixelate': {
			const sx = el.x2 >= el.x1 ? 1 : -1;
			const sy = el.y2 >= el.y1 ? 1 : -1;
			const mx = (el.x1 + el.x2) / 2;
			const my = (el.y1 + el.y2) / 2;
			return [
				{
					id: 'x1y1',
					x: el.x1,
					y: el.y1,
					kind: 'corner',
					dir: { x: -sx as 1 | -1, y: -sy as 1 | -1 }
				},
				{ id: 'x2y2', x: el.x2, y: el.y2, kind: 'corner', dir: { x: sx, y: sy } },
				{ id: 'x1y2', x: el.x1, y: el.y2, kind: 'corner', dir: { x: -sx as 1 | -1, y: sy } },
				{ id: 'x2y1', x: el.x2, y: el.y1, kind: 'corner', dir: { x: sx, y: -sy as 1 | -1 } },
				{ id: 'x1', x: el.x1, y: my, kind: 'vertical' },
				{ id: 'x2', x: el.x2, y: my, kind: 'vertical' },
				{ id: 'y1', x: mx, y: el.y1, kind: 'horizontal' },
				{ id: 'y2', x: mx, y: el.y2, kind: 'horizontal' }
			];
		}
		case 'text': {
			const c = textCenter(el);
			const t = textSize(el);
			const frame: Frame = { cx: c.x, cy: c.y, rotation: el.rotation };
			const hw = t.width / 2 + HitPadding;
			const hh = t.height / 2 + HitPadding;
			const at = (
				id: string,
				kind: ElementHandle['kind'],
				lx: number,
				ly: number,
				dir?: ElementHandle['dir']
			): ElementHandle => {
				const p = fromLocal(frame, lx, ly);
				return { id, kind, x: p.x, y: p.y, dir, rotation: el.rotation };
			};
			return [
				at('nw', 'corner', -hw, -hh, { x: -1, y: -1 }),
				at('ne', 'corner', hw, -hh, { x: 1, y: -1 }),
				at('se', 'corner', hw, hh, { x: 1, y: 1 }),
				at('sw', 'corner', -hw, hh, { x: -1, y: 1 }),
				at('n', 'horizontal', 0, -hh),
				at('s', 'horizontal', 0, hh),
				at('e', 'vertical', hw, 0),
				at('w', 'vertical', -hw, 0),
				at('rotate', 'rotate', 0, -hh - RotateHandleOffset)
			];
		}
		default:
			return assertNever(el);
	}
}

const cursors = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

export function getHandleCursor(handle: ElementHandle): string {
	let axis: number;
	switch (handle.kind) {
		case 'corner':
			axis = handle.dir!.x * handle.dir!.y > 0 ? 45 : 135;
			break;
		case 'horizontal':
			axis = 90;
			break;
		case 'vertical':
			axis = 0;
			break;
		default:
			return 'grab';
	}
	const angle = (((axis + (handle.rotation ?? 0)) % 180) + 180) % 180;
	return cursors[Math.round(angle / 45) % 4];
}

export function moveElement(el: AnyElement, dx: number, dy: number): AnyElement {
	switch (el.type) {
		case 'line':
		case 'arrow':
		case 'rect':
		case 'image':
		case 'blur':
		case 'pixelate':
			return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
		case 'circle':
			return { ...el, cx: el.cx + dx, cy: el.cy + dy };
		case 'draw': {
			return { ...el, points: el.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
		}
		case 'text':
			return { ...el, x: el.x + dx, y: el.y + dy };
		default:
			return assertNever(el);
	}
}

export function cloneElement(el: AnyElement, dx = 0, dy = 0): AnyElement {
	const copy = moveElement(structuredClone(el), dx, dy);
	return { ...copy, id: uuid() };
}

export function resizeElement(
	el: AnyElement,
	handleId: string,
	point: Point,
	modifiers: ToolModifiers = noModifiers,
	original: AnyElement = el
): AnyElement {
	switch (el.type) {
		case 'arrow': {
			if (handleId === 'head') {
				const angle = toRadians(getAngleDegrees(el.x1, el.y1, el.x2, el.y2));
				const target = modifiers.shift
					? snapAngle({ x: el.x2, y: el.y2 }, point, SnapAngleStep, -angle)
					: point;

				const angleHead = toRadians(getAngleDegrees(target.x, target.y, el.x2, el.y2));
				const distance = getDistance2D(target.x, target.y, el.x2, el.y2);
				return { ...el, headlen: distance, headangle: toDegrees(angleHead - angle) };
			} else if (handleId === 'tail') {
				const angle = toRadians(getAngleDegrees(el.x1, el.y1, el.x2, el.y2));
				const target = modifiers.shift
					? snapAngle({ x: el.x1, y: el.y1 }, point, SnapAngleStep, -angle)
					: point;

				const angleTail = toRadians(getAngleDegrees(target.x, target.y, el.x1, el.y1));
				const distance = getDistance2D(target.x, target.y, el.x1, el.y1);
				return { ...el, taillen: distance, tailangle: toDegrees(angleTail - angle) };
			}
		}
		case 'line': {
			if (handleId === 'start') {
				const target = modifiers.shift ? snapAngle({ x: el.x2, y: el.y2 }, point) : point;
				return { ...el, x1: target.x, y1: target.y };
			}
			if (handleId === 'end') {
				const target = modifiers.shift ? snapAngle({ x: el.x1, y: el.y1 }, point) : point;
				return { ...el, x2: target.x, y2: target.y };
			}
			return el;
		}
		case 'rect': {
			const frame = boxFrame(el, el.rotation);

			if (handleId === 'rotate') {
				return { ...el, rotation: rotationFromPointer(frame, point, modifiers.shift) };
			}

			const q = toLocal(frame, point);
			let lx1 = el.x1 - frame.cx;
			let lx2 = el.x2 - frame.cx;
			let ly1 = el.y1 - frame.cy;
			let ly2 = el.y2 - frame.cy;
			const snap = (from: Point) => (modifiers.shift ? snapAngle(from, q, SnapAngleStepFine) : q);

			switch (handleId) {
				case 'x1y1': {
					const t = snap({ x: lx2, y: ly2 });
					lx1 = t.x;
					ly1 = t.y;
					break;
				}
				case 'x1y2': {
					const t = snap({ x: lx2, y: ly1 });
					lx1 = t.x;
					ly2 = t.y;
					break;
				}
				case 'x2y1': {
					const t = snap({ x: lx1, y: ly2 });
					lx2 = t.x;
					ly1 = t.y;
					break;
				}
				case 'x2y2': {
					const t = snap({ x: lx1, y: ly1 });
					lx2 = t.x;
					ly2 = t.y;
					break;
				}
				case 'x1':
					lx1 = q.x;
					break;
				case 'x2':
					lx2 = q.x;
					break;
				case 'y1':
					ly1 = q.y;
					break;
				case 'y2':
					ly2 = q.y;
					break;
				case 'radius': {
					const offset = (q.x - Math.min(lx1, lx2) + (q.y - Math.min(ly1, ly2))) / 2;
					const maxR = Math.min(Math.abs(lx2 - lx1), Math.abs(ly2 - ly1)) / 2;
					return { ...el, radius: Math.min(Math.max(offset, 0), maxR) };
				}
				default:
					return el;
			}

			const ox = (lx1 + lx2) / 2;
			const oy = (ly1 + ly2) / 2;
			const c = fromLocal(frame, ox, oy);
			return {
				...el,
				x1: c.x + lx1 - ox,
				x2: c.x + lx2 - ox,
				y1: c.y + ly1 - oy,
				y2: c.y + ly2 - oy
			};
		}
		case 'circle': {
			if (handleId === 'rotate') {
				return { ...el, rotation: rotationFromPointer(el, point, modifiers.shift) };
			}
			const base = original.type === 'circle' ? original : el;
			return resizeCircleBox(base, handleId, point, modifiers);
		}
		case 'draw': {
			if (handleId === 'rotate') {
				return { ...el, rotation: rotationFromPointer(drawFrame(el), point, modifiers.shift) };
			}
			const handleIdx = +handleId;
			if (Number.isNaN(handleId) || !Number.isFinite(handleIdx)) return el;
			el.points[handleIdx] = point;
			return el;
		}
		case 'image':
			return resizeImage(el, handleId, point, modifiers, original);
		case 'blur':
		case 'pixelate':
			return resizeRegion(el, handleId, point);
		case 'text':
			return resizeText(el, handleId, point, modifiers);
		default:
			return assertNever(el);
	}
}

function resizeImage(
	el: ImageElement,
	handleId: string,
	point: Point,
	modifiers: ToolModifiers,
	original: AnyElement
): ImageElement {
	const frame = boxFrame(el, el.rotation);

	if (handleId === 'rotate') {
		return { ...el, rotation: rotationFromPointer(frame, point, modifiers.shift) };
	}

	const q = toLocal(frame, point);
	let lx1 = el.x1 - frame.cx;
	let lx2 = el.x2 - frame.cx;
	let ly1 = el.y1 - frame.cy;
	let ly2 = el.y2 - frame.cy;

	const base = original.type === 'image' ? original : el;
	const ratio = Math.abs(base.x2 - base.x1) / Math.abs(base.y2 - base.y1);
	const corner = (ax: number, ay: number): Point => {
		if (modifiers.shift || !Number.isFinite(ratio) || ratio === 0) return q;
		const sx = q.x >= ax ? 1 : -1;
		const sy = q.y >= ay ? 1 : -1;
		const w = Math.max(1, Math.abs(q.x - ax), Math.abs(q.y - ay) * ratio);
		return { x: ax + sx * w, y: ay + (sy * w) / ratio };
	};

	switch (handleId) {
		case 'x1y1': {
			const t = corner(lx2, ly2);
			lx1 = t.x;
			ly1 = t.y;
			break;
		}
		case 'x1y2': {
			const t = corner(lx2, ly1);
			lx1 = t.x;
			ly2 = t.y;
			break;
		}
		case 'x2y1': {
			const t = corner(lx1, ly2);
			lx2 = t.x;
			ly1 = t.y;
			break;
		}
		case 'x2y2': {
			const t = corner(lx1, ly1);
			lx2 = t.x;
			ly2 = t.y;
			break;
		}
		case 'x1':
			lx1 = q.x;
			break;
		case 'x2':
			lx2 = q.x;
			break;
		case 'y1':
			ly1 = q.y;
			break;
		case 'y2':
			ly2 = q.y;
			break;
		default:
			return el;
	}

	const ox = (lx1 + lx2) / 2;
	const oy = (ly1 + ly2) / 2;
	const c = fromLocal(frame, ox, oy);
	return {
		...el,
		x1: c.x + lx1 - ox,
		x2: c.x + lx2 - ox,
		y1: c.y + ly1 - oy,
		y2: c.y + ly2 - oy
	};
}

function resizeRegion<T extends BlurElement | PixelateElement>(
	el: T,
	handleId: string,
	point: Point
): T {
	let { x1, y1, x2, y2 } = el;
	switch (handleId) {
		case 'x1y1':
			[x1, y1] = [point.x, point.y];
			break;
		case 'x2y2':
			[x2, y2] = [point.x, point.y];
			break;
		case 'x1y2':
			[x1, y2] = [point.x, point.y];
			break;
		case 'x2y1':
			[x2, y1] = [point.x, point.y];
			break;
		case 'x1':
			x1 = point.x;
			break;
		case 'x2':
			x2 = point.x;
			break;
		case 'y1':
			y1 = point.y;
			break;
		case 'y2':
			y2 = point.y;
			break;
		default:
			return el;
	}
	return { ...el, x1, y1, x2, y2 };
}

function resizeText(
	el: TextElement,
	handleId: string,
	point: Point,
	modifiers: ToolModifiers
): TextElement {
	const c = textCenter(el);
	const frame: Frame = { cx: c.x, cy: c.y, rotation: el.rotation };

	if (handleId === 'rotate') {
		return { ...el, rotation: rotationFromPointer(frame, point, modifiers.shift) };
	}

	const dir = boxHandleDirs[handleId];
	if (!dir) return el;

	const t = textSize(el);
	const nat = t.natural;
	if (nat.width <= 0 || nat.height <= 0) return el;

	const q = toLocal(frame, point);
	const minSize = 8;
	const hw = t.width / 2;
	const hh = t.height / 2;

	const extent = (s: number, half: number, qv: number) =>
		s === 0 ? half * 2 : Math.max(minSize, s * (qv - s * HitPadding + s * half));

	let w = extent(dir.sx, hw, q.x);
	let h = extent(dir.sy, hh, q.y);

	if (modifiers.shift && dir.sx !== 0 && dir.sy !== 0) {
		const k = Math.max(w / t.width, h / t.height);
		w = t.width * k;
		h = t.height * k;
	}

	const lcx = dir.sx === 0 ? 0 : (dir.sx * (w - t.width)) / 2;
	const lcy = dir.sy === 0 ? 0 : (dir.sy * (h - t.height)) / 2;
	const nc = fromLocal(frame, lcx, lcy);

	return {
		...el,
		sx: w / nat.width,
		sy: h / nat.height,
		x: nc.x - w / 2,
		y: nc.y - h / 2
	};
}

export function reflowText(prev: TextElement, next: TextElement): TextElement {
	if (prev.rotation === 0) return next;
	const pc = textCenter(prev);
	const pt = textSize(prev);
	const tl = fromLocal(
		{ cx: pc.x, cy: pc.y, rotation: prev.rotation },
		-pt.width / 2,
		-pt.height / 2
	);
	const nt = textSize(next);
	const r = toRadians(next.rotation);
	const cx = tl.x + (nt.width / 2) * Math.cos(r) - (nt.height / 2) * Math.sin(r);
	const cy = tl.y + (nt.width / 2) * Math.sin(r) + (nt.height / 2) * Math.cos(r);
	return { ...next, x: cx - nt.width / 2, y: cy - nt.height / 2 };
}

export function isDegenerate(el: AnyElement): boolean {
	switch (el.type) {
		case 'line':
		case 'arrow':
		case 'rect':
		case 'blur':
		case 'pixelate':
			return Math.hypot(el.x2 - el.x1, el.y2 - el.y1) < 2;
		case 'image':
			return Math.abs(el.x2 - el.x1) < 2 || Math.abs(el.y2 - el.y1) < 2;
		case 'circle':
			return el.rx < 1 && el.ry < 1;
		case 'draw':
			return false;
		case 'text':
			return el.text.trim() === '';
		default:
			return assertNever(el);
	}
}

type Frame = { cx: number; cy: number; rotation: number };

function boxFrame(el: Box, rotation: number): Frame {
	return { cx: (el.x1 + el.x2) / 2, cy: (el.y1 + el.y2) / 2, rotation: rotation };
}

function drawFrame(el: DrawElement): Frame {
	return boxFrame(rectToBox(getElementBounds(el)), el.rotation);
}

function toLocalDraw(el: DrawElement, p: Point): Point {
	const frame = drawFrame(el);
	const q = toLocal(frame, p);
	return { x: frame.cx + q.x, y: frame.cy + q.y };
}

function rotationFromPointer(frame: Frame, point: Point, snap: boolean): number {
	const degrees = toDegrees(Math.atan2(point.y - frame.cy, point.x - frame.cx)) + 90;
	return normalizeDegrees(
		snap ? Math.round(degrees / SnapRotationStep) * SnapRotationStep : degrees
	);
}

function normalizeDegrees(degrees: number): number {
	return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

export function rotationTransform(el: AnyElement): string | undefined {
	switch (el.type) {
		case 'rect':
		case 'image':
			return el.rotation
				? `rotate(${el.rotation} ${(el.x1 + el.x2) / 2} ${(el.y1 + el.y2) / 2})`
				: undefined;
		case 'draw': {
			const box = rectToBox(getElementBounds(el));
			return el.rotation
				? `rotate(${el.rotation} ${(box.x1 + box.x2) / 2} ${(box.y1 + box.y2) / 2})`
				: undefined;
		}
		case 'circle':
			return el.rotation ? `rotate(${el.rotation} ${el.cx} ${el.cy})` : undefined;
		case 'text': {
			const c = textCenter(el);
			return el.rotation ? `rotate(${el.rotation} ${c.x} ${c.y})` : undefined;
		}
		default:
			return undefined;
	}
}

function toLocal(el: Frame, p: Point): Point {
	const r = toRadians(-el.rotation);
	const dx = p.x - el.cx;
	const dy = p.y - el.cy;
	return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}

function fromLocal(el: Frame, lx: number, ly: number): Point {
	const r = toRadians(el.rotation);
	return {
		x: el.cx + lx * Math.cos(r) - ly * Math.sin(r),
		y: el.cy + lx * Math.sin(r) + ly * Math.cos(r)
	};
}

const boxHandleDirs: Record<string, { sx: number; sy: number }> = {
	nw: { sx: -1, sy: -1 },
	ne: { sx: 1, sy: -1 },
	se: { sx: 1, sy: 1 },
	sw: { sx: -1, sy: 1 },
	n: { sx: 0, sy: -1 },
	s: { sx: 0, sy: 1 },
	e: { sx: 1, sy: 0 },
	w: { sx: -1, sy: 0 }
};

function boxAxis(s: number, r0: number, q: number, symmetric: boolean, forcedRadius?: number) {
	if (s === 0) return { r: forcedRadius ?? r0, c: 0 };
	if (symmetric) return { r: forcedRadius ?? Math.abs(q), c: 0 };
	const fixed = -s * r0;
	if (forcedRadius === undefined) return { r: Math.abs(q - fixed) / 2, c: (q + fixed) / 2 };
	return { r: forcedRadius, c: fixed + (q >= fixed ? 1 : -1) * forcedRadius };
}

function resizeCircleBox(
	el: CircleElement,
	handleId: string,
	point: Point,
	modifiers: ToolModifiers
): CircleElement {
	const dir = boxHandleDirs[handleId];
	if (!dir) return el;

	const q = toLocal(el, point);
	let x = boxAxis(dir.sx, el.rx, q.x, modifiers.alt);
	let y = boxAxis(dir.sy, el.ry, q.y, modifiers.alt);

	if (modifiers.shift) {
		const r = dir.sx !== 0 && dir.sy !== 0 ? Math.max(x.r, y.r) : dir.sx !== 0 ? x.r : y.r;
		x = boxAxis(dir.sx, el.rx, q.x, modifiers.alt, r);
		y = boxAxis(dir.sy, el.ry, q.y, modifiers.alt, r);
	}

	const c = fromLocal(el, x.c, y.c);
	return { ...el, cx: c.x, cy: c.y, rx: x.r, ry: y.r };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lengthSq = dx * dx + dy * dy;
	let t = lengthSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
	t = Math.max(0, Math.min(1, t));
	const cx = a.x + t * dx;
	const cy = a.y + t * dy;
	return Math.hypot(p.x - cx, p.y - cy);
}

interface Point2D {
	x: number;
	y: number;
}

interface BoundingBox2D {
	min: Point2D;
	max: Point2D;
}

function insideBox(point: Point2D, box: BoundingBox2D, tolerance?: number): boolean;

function insideBox(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	px: number,
	py: number,
	tolerance?: number
): boolean;

function insideBox(
	arg1: Point2D | number,
	arg2: BoundingBox2D | number,
	arg3?: number,
	arg4?: number,
	arg5?: number,
	arg6?: number,
	arg7?: number
): boolean {
	let minX: number, maxX: number, minY: number, maxY: number;
	let px: number, py: number;
	let tolerance = 0;

	if (typeof arg1 === 'number') {
		const x1 = arg1;
		const y1 = arg2 as number;
		const x2 = arg3!;
		const y2 = arg4!;
		px = arg5!;
		py = arg6!;
		tolerance = arg7 ?? 0;

		minX = Math.min(x1, x2);
		maxX = Math.max(x1, x2);
		minY = Math.min(y1, y2);
		maxY = Math.max(y1, y2);
	} else {
		const point = arg1;
		const box = arg2 as BoundingBox2D;
		tolerance = arg3 ?? 0;

		px = point.x;
		py = point.y;

		minX = Math.min(box.min.x, box.max.x);
		maxX = Math.max(box.min.x, box.max.x);
		minY = Math.min(box.min.y, box.max.y);
		maxY = Math.max(box.min.y, box.max.y);
	}

	minX -= tolerance;
	maxX += tolerance;
	minY -= tolerance;
	maxY += tolerance;

	return px >= minX && px <= maxX && py >= minY && py <= maxY;
}
