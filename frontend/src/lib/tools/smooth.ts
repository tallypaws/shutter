import type { Point } from "./types";
import { DThickness } from "./defaults";


export function toPolylinePath(points: Point[]): string {
	if (points.length === 0) return '';
	if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;

	let d = `M ${points[0].x} ${points[0].y}`;
	for (let i = 1; i < points.length; i++) {
		d += ` L ${points[i].x} ${points[i].y}`;
	}
	return d;
}

export function toMidpointCurvePath(points: Point[]): string {
	if (points.length < 3) return toPolylinePath(points);

	let d = `M ${points[0].x} ${points[0].y}`;
	for (let i = 1; i < points.length - 1; i++) {
		const mx = (points[i].x + points[i + 1].x) / 2;
		const my = (points[i].y + points[i + 1].y) / 2;
		d += ` Q ${points[i].x} ${points[i].y} ${mx} ${my}`;
	}
	const last = points[points.length - 1];
	d += ` L ${last.x} ${last.y}`;
	return d;
}

export function toCatmullRomPath(points: Point[], tension = 1): string {
	if (points.length < 3) return toPolylinePath(points);

	const k = tension / 6;
	let d = `M ${points[0].x} ${points[0].y}`;
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i - 1] ?? points[i];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[i + 2] ?? p2;

		const c1x = p1.x + (p2.x - p0.x) * k;
		const c1y = p1.y + (p2.y - p0.y) * k;
		const c2x = p2.x - (p3.x - p1.x) * k;
		const c2y = p2.y - (p3.y - p1.y) * k;

		d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
	}
	return d;
}

export function toChaikinPath(points: Point[], iterations = 2): string {
	if (points.length < 3) return toPolylinePath(points);

	let pts = points;
	for (let it = 0; it < iterations; it++) {
		const next: Point[] = [pts[0]];
		for (let i = 0; i < pts.length - 1; i++) {
			const a = pts[i];
			const b = pts[i + 1];
			next.push(
				{ x: a.x + (b.x - a.x) * 0.25, y: a.y + (b.y - a.y) * 0.25 },
				{ x: a.x + (b.x - a.x) * 0.75, y: a.y + (b.y - a.y) * 0.75 }
			);
		}
		next.push(pts[pts.length - 1]);
		pts = next;
	}
	return toPolylinePath(pts);
}

export function movingAverage(points: Point[], radius: number): Point[] {
	if (radius < 1 || points.length < 3) return points;

	return points.map((p, i) => {
		if (i === 0 || i === points.length - 1) return p;
		const r = Math.min(radius, i, points.length - 1 - i);
		let x = 0,
			y = 0,
			w = 0;
		for (let j = -r; j <= r; j++) {
			const weight = r + 1 - Math.abs(j);
			x += points[i + j].x * weight;
			y += points[i + j].y * weight;
			w += weight;
		}
		return { x: x / w, y: y / w };
	});
}

export function simplifyRDP(points: Point[], tolerance: number): Point[] {
	if (points.length < 3 || tolerance <= 0) return points;

	const a = points[0];
	const b = points[points.length - 1];
	let maxDist = 0;
	let splitIndex = 0;

	for (let i = 1; i < points.length - 1; i++) {
		const d = distanceToSegment(points[i], a, b);
		if (d > maxDist) {
			maxDist = d;
			splitIndex = i;
		}
	}

	if (maxDist <= tolerance) return [a, b];

	const left = simplifyRDP(points.slice(0, splitIndex + 1), tolerance);
	const right = simplifyRDP(points.slice(splitIndex), tolerance);
	return [...left.slice(0, -1), ...right];
}

export function resample(points: Point[], spacing: number): Point[] {
	if (points.length < 2 || spacing <= 0) return points;

	const result: Point[] = [points[0]];
	let prev = points[0];
	let carry = 0;

	for (let i = 1; i < points.length; i++) {
		const curr = points[i];
		let segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
		let remaining = spacing - carry;

		while (segLen >= remaining) {
			const t = remaining / segLen;
			const nx = prev.x + (curr.x - prev.x) * t;
			const ny = prev.y + (curr.y - prev.y) * t;
			result.push({ x: nx, y: ny });
			prev = { x: nx, y: ny };
			segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
			remaining = spacing;
			carry = 0;
		}

		carry += segLen;
		prev = curr;
	}

	const last = points[points.length - 1];
	const lastResult = result[result.length - 1];
	if (lastResult.x !== last.x || lastResult.y !== last.y) result.push(last);
	return result;
}


function distanceToSegment(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lengthSq = dx * dx + dy * dy;
	let t = lengthSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}


export type SmoothMode = 'none' | 'curve' | 'spline' | 'chaikin' | 'average' | 'simplify';

export interface SmoothOptions {
	mode: SmoothMode;
	amount?: number;
	thickness?: number;
}

export function smoothPath(points: Point[], options: SmoothOptions): string {
	const amt = (options.amount ?? 50) / 100;
	const thickness = options.thickness ?? DThickness;

	switch (options.mode) {
		case 'none':
			return toPolylinePath(points);
		case 'curve':
			return toMidpointCurvePath(points);
		case 'spline':
			return toCatmullRomPath(points);
		case 'chaikin':
			return toChaikinPath(points, Math.round(1 + amt * 3));
		case 'average': {
			const evened = resample(points, Math.max(2, thickness / 2));
			return toCatmullRomPath(movingAverage(evened, Math.round(amt * 12)));
		}
		case 'simplify': {
			const simplified = simplifyRDP(points, amt * thickness * 2);
			return toCatmullRomPath(simplified);
		}
		default:
			return toPolylinePath(points);
	}
}