import type { Component } from 'svelte';
import type { SmoothMode } from './smooth';

export type ToolId =
	| 'crop'
	| 'select'
	| 'pen'
	| 'highlighter'
	| 'line'
	| 'arrow'
	| 'rect'
	| 'circle'
	| 'text'
	| 'image'
	| 'blur'
	| 'pixelate'
	| 'clone';

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Box = {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
};
export type ToolModifiers = {
	shift: boolean;
	alt: boolean;
	ctrl: boolean;
};

export interface BaseElement {
	id: string;
}

export interface LineElement extends BaseElement {
	type: 'line';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: string;
	thickness: number;
}

export interface ArrowElement extends BaseElement {
	type: 'arrow';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: string;
	thickness: number;
	headlen: number;
	headangle: number;
}

export interface ArrowElement extends BaseElement {
	type: 'arrow';
	x1: number;
	y1: number;
	x2: number;
	y2: number;

	color: string;
	thickness: number;
	head: boolean;
	headlen: number;
	headangle: number;
	tail: boolean;
	taillen: number;
	tailangle: number;
}

export interface RectElement extends BaseElement {
	type: 'rect';
	x1: number;
	y1: number;
	x2: number;
	y2: number;

	fill: boolean;
	fillColor: string;
	outline: boolean;
	outlineColor: string;
	outlineWidth: number;
	radius: number;
	rotation: number;
}

export interface CircleElement extends BaseElement {
	type: 'circle';
	cx: number;
	cy: number;
	rx: number;
	ry: number;
	rotation: number;

	fill: boolean;
	fillColor: string;
	outline: boolean;
	outlineColor: string;
	outlineWidth: number;
}

export interface DrawElement extends BaseElement {
	type: 'draw';
	points: Point[];
	color: string;
	thickness: number;
	smoothing: SmoothMode;
	rotation: number;
	opacity?: number;
	highlighter?: boolean;
}

export interface TextElement extends BaseElement {
	type: 'text';
	x: number;
	y: number;
	text: string;
	fontFamily: string;
	fontSize: number;
	color: string;
	bold: boolean;
	italic: boolean;
	sx: number;
	sy: number;
	rotation: number;
}

export interface ImageElement extends BaseElement {
	type: 'image';
	assetId: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	rotation: number;
}

export interface BlurElement extends BaseElement {
	type: 'blur';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	radius: number;
}

export interface PixelateElement extends BaseElement {
	type: 'pixelate';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	size: number;
}

export type AnyElement =
	| LineElement
	| ArrowElement
	| RectElement
	| CircleElement
	| DrawElement
	| TextElement
	| ImageElement
	| BlurElement
	| PixelateElement;

export type ElementHandle = {
	id: string;
	x: number;
	y: number;
	kind: HandleKind;
	dir?: { x: 1 | -1; y: 1 | -1 };
	rotation?: number;
};

interface OptionFieldBase {
	key: string;
	label?: string;
	enabledBy?: string;
}

export type ColorOptionField = OptionFieldBase & { type: 'color' };
export type CheckboxOptionField = OptionFieldBase & { type: 'checkbox' };
export type NumberOptionField = OptionFieldBase & {
	type: 'number';
	min: number;
	max: number;
	step?: number;
	unit?: string;
	slider?: boolean;
};

export type SelectOptionField = OptionFieldBase & {
	type: 'select';
	options: { value: string; label: string }[];
	default?: string;
	placeholder?: string;
};

export type SeparatorOptionField = { type: 'separator' };

export type FontOptionField = OptionFieldBase & { type: 'font'; placeholder?: string };

export type ToolOptionField =
	| ColorOptionField
	| CheckboxOptionField
	| NumberOptionField
	| SeparatorOptionField
	| SelectOptionField
	| FontOptionField;

export interface ToolDefinition {
	id: ToolId;
	label: string;
	icon: Component;
	/** Single key (no modifiers) that activates the tool. Must be unique across tools. */
	hotkey?: string;

	implemented: boolean;
	createsElement: boolean;
	cursor?: string;
	optionFields?: ToolOptionField[];
	defaultFields?: ToolOptionField[];
	defaultOptions?: Record<string, unknown>;
}

export type ElementDrag =
	| { type: 'create'; id: string; origin: Point }
	| { type: 'move'; id: string; startX: number; startY: number; original: AnyElement }
	| { type: 'resize'; id: string; handleId: string; original: AnyElement };

export type HandleKind =
	'dot' | 'corner' | 'horizontal' | 'vertical' | 'radius' | 'head' | 'rotate';
