import {
	Circle,
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
	Type
} from '@lucide/svelte';
import type { AnyElement, ToolDefinition, ToolId } from './types';
import {
	ArrowDefault,
	BlurDefault,
	BlurRadRaynge,
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

export const toolOrder: ToolId[] = [
	'crop',
	'select',
	'pen',
	'line',
	'arrow',
	'rect',
	'circle',
	'text',
	'blur',
	'pixelate',
	'image'
];

export const toolDefinitions: Record<ToolId, ToolDefinition> = {
	crop: {
		id: 'crop',
		label: 'Crop',
		icon: Crop,
		implemented: true,
		createsElement: false
	},
	select: {
		id: 'select',
		label: 'Select',
		icon: MousePointer2,
		implemented: true,
		createsElement: false
	},
	// useless, just use transparent pen or rect
	// highlight: {
	// 	id: 'highlight',
	// 	label: 'Highlight',
	// 	icon: Highlighter,
	// 	implemented: false,
	// 	createsElement: true
	// },
	pen: {
		id: 'pen',
		label: 'Pen',
		icon: PencilLine,
		implemented: true,
		createsElement: true,
		cursor: penCursor,
		optionFields: [
			{ key: 'color', type: 'color', label: 'Color' },
			{ key: 'thickness', type: 'number', label: 'Thickness', ...ThicknessRaynge },
			{
				key: 'smoothing',
				type: 'select',
				options: [
					{ value: 'none', label: 'None' },
					{ value: 'curve', label: 'Curve' },
					{ value: 'spline', label: 'Spline' },
					{ value: 'chaikin', label: 'Chaikin' },
					{ value: 'average', label: 'Average' },
					{ value: 'simplify', label: 'Simplify' }
				]
			}
		],
		defaultOptions: { ...PenDefault }
	},
	line: {
		id: 'line',
		label: 'Line',
		icon: Slash,
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
		implemented: true,
		createsElement: true,
		optionFields: [
			{ key: 'color', type: 'color', label: 'Color' },
			{ key: 'thickness', type: 'number', label: 'Thickness', ...ThicknessRaynge },
			{ key: 'tail', type: 'checkbox', label: 'Tail' }
			// { key: 'headlen', type: 'number', label: 'Head Length', min: 0, max: 500, step: 1 },
			// { key: 'headangle', type: 'number', label: 'Head Angle', min: 0, max: 180, step: 1 }
		],
		defaultOptions: { ...ArrowDefault }
	},
	rect: {
		id: 'rect',
		label: 'Rectangle',
		icon: Square,
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
		implemented: true,
		createsElement: false
	},

	blur: {
		id: 'blur',
		label: 'Blur',
		icon: Droplet,
		implemented: true,
		createsElement: true,
		optionFields: [{ key: 'radius', type: 'number', label: 'Radius', ...BlurRadRaynge }],
		defaultOptions: { ...BlurDefault }
	},
	pixelate: {
		id: 'pixelate',
		label: 'Pixelate',
		icon: Grid3x3,
		implemented: true,
		createsElement: true,
		optionFields: [{ key: 'size', type: 'number', label: 'Block size', ...PixelateSizeRaygne }],
		defaultOptions: { ...PixelateDefault }
	}
};

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
