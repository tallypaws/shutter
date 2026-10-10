import {
	Circle,
	Copy,
	Crop,
	Droplet,
	Grid3x3,
	Highlighter,
	Image,
	MousePointer2,
	MoveUpRight,
	PencilLine,
	Slash,
	Square,
	Stamp,
	Type
} from '@lucide/svelte';
import type { AnyElement, ToolDefinition, ToolId } from './types';
import {
	ArrowDefault,
	BlurDefault,
	BlurRadRaynge,
	ArrowAngleRange,
	ArrowLenRange,
	HighlighterDefault,
	MinPointDistanceRange,
	OpacityRange,
	CricleDefault,
	FontSizeRaynge,
	LineDefault,
	OutlineWidthRaynge,
	PenDefault,
	PixelateDefault,
	PixelateSizeRaygne,
	RadiusRaynge,
	RectDefault,
	TextDefault,
	ThicknessRaynge
} from './defaults';

const penCursor = `url("data:image/svg+xml;utf8,${encodeURIComponent(
	`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='4' fill='none' stroke='white' stroke-width='3'/><circle cx='12' cy='12' r='4' fill='none' stroke='black' stroke-width='1'/></svg>`
)}") 12 12, crosshair`;

const smoothingOptions = [
	{ value: 'none', label: 'None' },
	{ value: 'curve', label: 'Curve' },
	{ value: 'spline', label: 'Spline' },
	{ value: 'chaikin', label: 'Chaikin' },
	{ value: 'average', label: 'Average' },
	{ value: 'simplify', label: 'Simplify' }
];

export const toolOrder: ToolId[] = [
	'crop',
	'select',
	'pen',
	'highlighter',
	'line',
	'arrow',
	'rect',
	'circle',
	'text',
	'blur',
	'pixelate',
	'clone',
	'image'
];

export const toolDefinitions: Record<ToolId, ToolDefinition> = {
	crop: {
		id: 'crop',
		label: 'Crop',
		icon: Crop,
		hotkey: 'c',
		implemented: true,
		createsElement: false
	},
	select: {
		id: 'select',
		label: 'Select',
		icon: MousePointer2,
		hotkey: 'v',
		implemented: true,
		createsElement: false
	},
	pen: {
		id: 'pen',
		label: 'Pen',
		icon: PencilLine,
		hotkey: 'p',
		implemented: true,
		createsElement: true,
		cursor: penCursor,
		optionFields: [
			{ key: 'color', type: 'color', label: 'Color' },
			{ key: 'thickness', type: 'number', label: 'Thickness', ...ThicknessRaynge },
			{
				key: 'smoothing',
				type: 'select',
				options: smoothingOptions
			}
		],
		defaultFields: [
			{ key: 'color', type: 'color', label: 'Color' },
			{ key: 'thickness', type: 'number', label: 'Thickness', ...ThicknessRaynge },
			{
				key: 'smoothing',
				type: 'select',
				options: smoothingOptions
			},
			{ type: 'separator' },
			{
				key: 'minDistance',
				type: 'number',
				label: 'Point spacing',
				unit: 'px',
				...MinPointDistanceRange
			}
		],
		defaultOptions: { ...PenDefault }
	},
	highlighter: {
		id: 'highlighter',
		label: 'Highlighter',
		icon: Highlighter,
		hotkey: 'h',
		implemented: true,
		createsElement: true,
		cursor: penCursor,
		optionFields: [
			{ key: 'color', type: 'color', label: 'Color' },
			{ key: 'thickness', type: 'number', label: 'Thickness', ...ThicknessRaynge },
			{ key: 'opacity', type: 'number', label: 'Opacity', unit: '%', ...OpacityRange },
			{
				key: 'smoothing',
				type: 'select',
				options: smoothingOptions
			}
		],
		defaultFields: [
			{ key: 'color', type: 'color', label: 'Color' },
			{ key: 'thickness', type: 'number', label: 'Thickness', ...ThicknessRaynge },
			{ key: 'opacity', type: 'number', label: 'Opacity', unit: '%', ...OpacityRange },
			{
				key: 'smoothing',
				type: 'select',
				options: smoothingOptions
			},
			{ type: 'separator' },
			{
				key: 'minDistance',
				type: 'number',
				label: 'Point spacing',
				unit: 'px',
				...MinPointDistanceRange
			}
		],
		defaultOptions: { ...HighlighterDefault }
	},
	line: {
		id: 'line',
		label: 'Line',
		icon: Slash,
		hotkey: 'l',
		implemented: true,
		createsElement: true,
		optionFields: [
			{ key: 'color', type: 'color', label: 'Color' },
			{ key: 'thickness', type: 'number', label: 'Thickness', ...ThicknessRaynge }
		],
		defaultOptions: { ...LineDefault }
	},
	arrow: {
		id: 'arrow',
		label: 'Arrow',
		icon: MoveUpRight,
		hotkey: 'a',
		implemented: true,
		createsElement: true,
		optionFields: [
			{ key: 'color', type: 'color', label: 'Color' },
			{ key: 'thickness', type: 'number', label: 'Thickness', ...ThicknessRaynge },
			{ key: 'tail', type: 'checkbox', label: 'Tail' }
		],
		defaultFields: [
			{ key: 'color', type: 'color', label: 'Color' },
			{ key: 'thickness', type: 'number', label: 'Thickness', ...ThicknessRaynge },
			{ type: 'separator' },
			{ key: 'headlen', type: 'number', label: 'Head length', unit: 'px', ...ArrowLenRange },
			{ key: 'headangle', type: 'number', label: 'Head angle', unit: '°', ...ArrowAngleRange },
			{ type: 'separator' },
			{ key: 'tail', type: 'checkbox', label: 'Tail' },
			{
				key: 'taillen',
				type: 'number',
				label: 'Tail length',
				unit: 'px',
				enabledBy: 'tail',
				...ArrowLenRange
			},
			{
				key: 'tailangle',
				type: 'number',
				label: 'Tail angle',
				unit: '°',
				enabledBy: 'tail',
				...ArrowAngleRange
			}
		],
		defaultOptions: { ...ArrowDefault }
	},
	rect: {
		id: 'rect',
		label: 'Rectangle',
		icon: Square,
		hotkey: 'r',
		implemented: true,
		createsElement: true,
		optionFields: [
			{ key: 'outline', type: 'checkbox', label: 'outline' },
			{
				key: 'outlineWidth',
				type: 'number',
				...OutlineWidthRaynge,
				slider: false,
				enabledBy: 'outline'
			},
			{ key: 'outlineColor', type: 'color', enabledBy: 'outline' },
			{ type: 'separator' },
			{ key: 'fill', type: 'checkbox', label: 'fill' },
			{ key: 'fillColor', type: 'color', enabledBy: 'fill' },
			{ type: 'separator' },
			{ key: 'radius', type: 'number', label: 'radius', ...RadiusRaynge, slider: false }
		],
		defaultOptions: { ...RectDefault }
	},
	circle: {
		id: 'circle',
		label: 'Circle',
		icon: Circle,
		hotkey: 'o',
		implemented: true,
		createsElement: true,
		optionFields: [
			{ key: 'outline', type: 'checkbox', label: 'outline' },
			{
				key: 'outlineWidth',
				type: 'number',
				...OutlineWidthRaynge,
				slider: false,
				enabledBy: 'outline'
			},
			{ key: 'outlineColor', type: 'color', enabledBy: 'outline' },
			{ type: 'separator' },
			{ key: 'fill', type: 'checkbox', label: 'fill' },
			{ key: 'fillColor', type: 'color', enabledBy: 'fill' }
		],
		defaultOptions: { ...CricleDefault }
	},
	text: {
		id: 'text',
		label: 'Text',
		icon: Type,
		hotkey: 't',
		implemented: true,
		createsElement: true,
		cursor: 'text',
		optionFields: [
			{ key: 'fontFamily', type: 'font', placeholder: 'Font' },
			{
				key: 'fontSize',
				type: 'number',
				label: 'Size',
				...FontSizeRaynge,
				slider: false,
				unit: 'px'
			},
			{ key: 'color', type: 'color' },
			{ key: 'bold', type: 'checkbox', label: 'Bold' },
			{ key: 'italic', type: 'checkbox', label: 'Italic' }
		],
		defaultOptions: { ...TextDefault }
	},
	image: {
		id: 'image',
		label: 'Image',
		icon: Image,
		hotkey: 'i',
		implemented: true,
		createsElement: false
	},

	blur: {
		id: 'blur',
		label: 'Blur',
		icon: Droplet,
		hotkey: 'b',
		implemented: true,
		createsElement: true,
		optionFields: [{ key: 'radius', type: 'number', label: 'Radius', ...BlurRadRaynge }],
		defaultOptions: { ...BlurDefault }
	},
	pixelate: {
		id: 'pixelate',
		label: 'Pixelate',
		icon: Grid3x3,
		hotkey: 'm',
		implemented: true,
		createsElement: true,
		optionFields: [{ key: 'size', type: 'number', label: 'Block size', ...PixelateSizeRaygne }],
		defaultOptions: { ...PixelateDefault }
	},
	clone: {
		id: 'clone',
		label: 'Clone',
		icon: Stamp,
		hotkey: 's',
		implemented: true,
		createsElement: false,
		cursor: 'crosshair'
	}
};

export const toolByHotkey: ReadonlyMap<string, ToolId> = (() => {
	const map = new Map<string, ToolId>();
	for (const id of toolOrder) {
		const key = toolDefinitions[id].hotkey?.toLowerCase();
		if (!key) continue;
		const taken = map.get(key);
		if (taken) throw new Error(`Hotkey "${key}" is used by both ${taken} and ${id}`);
		map.set(key, id);
	}
	return map;
})();

export function toolTooltip(id: ToolId): string {
	const { label, hotkey } = toolDefinitions[id];
	return hotkey ? `${label} (${hotkey.toUpperCase()})` : label;
}

export function elementToolId(el: AnyElement): ToolId {
	if (el.type === 'draw') return el.highlighter ? 'highlighter' : 'pen';
	return elementTypeToTool[el.type];
}

export const elementTypeToTool: Record<AnyElement['type'], ToolId> = {
	line: 'line',
	arrow: 'arrow',
	rect: 'rect',
	circle: 'circle',
	draw: 'pen',
	text: 'text',
	image: 'image',
	blur: 'blur',
	pixelate: 'pixelate'
};
