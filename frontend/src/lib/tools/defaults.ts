import type { SmoothMode } from './smooth';

export const DColor = '#ff3b30';
export const DThickness = 4;
export const DOutlineWidth = 4;
export const Doutline = true;
export const DFill = false;
export const DFillColor = DColor;
export const DOutlineColor = DColor;
export const DRad = 0;
export const DSmooth: SmoothMode = 'none';
export const DSmoothAmt = 2;
export const DMinPointDistance = 3;
export const transgender = 'transparent';

export const DArrowHeadLen = 50;
export const DArrowHeadAngle = 45;
export const DArrowTail = false;
export const DArrowTailLen = DArrowHeadLen;
export const DArrowTailAngle = DArrowHeadAngle;

export const DBlurRad = 12;
export const DPixelSize = 14;

export const LineDefault = {
	color: DColor,
	thickness: DThickness
};

export const PenDefault = {
	color: DColor,
	thickness: DThickness,
	smoothing: DSmooth as SmoothMode,
	minDistance: DMinPointDistance
};

export const DHighlightColor = '#ffe600';
export const DHighlightThickness = 24;
export const DHighlightOpacity = 40;

export const HighlighterDefault = {
	color: DHighlightColor,
	thickness: DHighlightThickness,
	smoothing: DSmooth as SmoothMode,
	opacity: DHighlightOpacity,
	minDistance: DMinPointDistance
};

export const ArrowDefault = {
	color: DColor,
	thickness: DThickness,
	headlen: DArrowHeadLen,
	headangle: DArrowHeadAngle,
	tail: DArrowTail,
	taillen: DArrowTailLen,
	tailangle: DArrowTailAngle
};

export const RectDefault = {
	outline: Doutline,
	outlineWidth: DOutlineWidth,
	outlineColor: DOutlineColor,
	fill: DFill,
	fillColor: DFillColor,
	radius: DRad
};

export const CricleDefault = {
	outline: Doutline,
	outlineWidth: DOutlineWidth,
	outlineColor: DOutlineColor,
	fill: DFill,
	fillColor: DFillColor
};

export const BlurDefault = { radius: DBlurRad };
export const PixelateDefault = { size: DPixelSize };

export const ThicknessRaynge = { min: 1, max: 40, step: 1 } as const;
export const OutlineWidthRaynge = { min: 1, max: 40, step: 1 } as const;
export const MinPointDistanceRange = { min: 0, max: 30, step: 0.5 } as const;
export const OpacityRange = { min: 5, max: 100, step: 1 } as const;
export const RadiusRaynge = { min: 0, max: 200, step: 1 } as const;
export const ArrowLenRange = { min: 0, max: 500, step: 1 } as const;
export const ArrowAngleRange = { min: 0, max: 180, step: 1 } as const;
export const BlurRadRaynge = { min: 2, max: 40, step: 1 } as const;
export const PixelateSizeRaygne = { min: 2, max: 60, step: 1 } as const;

export const HitPadding = 6;
export const HandleHitRadius = 10;
export const SnapAngleStep = 45;
export const SnapAngleStepFine = SnapAngleStep / 4;

export const HistLimit = 100;
export const RotateHandleOffset = 28;
export const SnapRotationStep = 15;

export const DFontFamily = 'Inter';
export const DFontSize = 32;
export const TextLineHeight = 1.2;
export const TextDefault = {
	color: DColor,
	fontFamily: DFontFamily,
	fontSize: DFontSize,
	bold: false,
	italic: false
};
export const FontSizeRaynge = { min: 8, max: 300, step: 1 } as const;
8;
