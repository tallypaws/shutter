<script lang="ts">
	import { onMount } from 'svelte';
	import { draw, fade, fly, scale } from 'svelte/transition';
	import Button from '$lib/components/ui/button/button.svelte';
	import { cn } from 'cn';
	import { Quit } from '$lib/wailsjs/runtime/runtime';
	import { clamp } from '@tally.paws/toolbox';
	import { mouseMoveListeners, mouseUpListeners } from './dragstate';
	import { get } from 'svelte/store';
	import DragHandle from './DragHandle.svelte';
	import { elementTypeToTool, toolDefinitions, toolOrder } from '$lib/tools/registry';

	import type {
		AnyElement,
		ElementDrag,
		Rect,
		TextElement,
		ToolId,
		ToolModifiers
	} from '$lib/tools/types';
	import {
		createElement,
		createImageElement,
		finishElement,
		getElementBounds,
		getElementHandles,
		getHandleCursor,
		hitTestElement,
		isDegenerate,
		moveElement,
		reflowText,
		resizeElement,
		rotationTransform,
		updateElementEnd
	} from '$lib/tools/elements';
	import { boxToRect, getAngleDegrees, normalizeBox } from '$lib/utils';
	import HandleShape from './HandleShape.svelte';
	import { smoothPath } from '$lib/tools/smooth';
	import {
		DSmooth,
		DSmoothAmt,
		HandleHitRadius,
		HistLimit,
		transgender
	} from '$lib/tools/defaults';
	import { showTooltip, tooltips } from './tooltip.svelte';
	import TextNode from './TextNode.svelte';
	import OptionFields from './OptionFields.svelte';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import {
		buildToolOptions,
		saveActionMeta,
		settings,
		shortcutSaveAction,
		type SaveActionId
	} from '$lib/settings.svelte';
	import { ensureFonts, exportPng, getSceneContext } from '$lib/render/scene';
	import { LayerRenderer } from '$lib/render/layers';
	import { pickImageFiles, registerImage } from '$lib/render/images';
	import { performSave, type SaveMode } from '$lib/save';
	import { fontEpoch } from '$lib/fontEpoch.svelte';
	import { HasSnapshot } from '$lib/wailsjs/go/main/ScreenshotService';

	const cropFadeOut = 0.6;

	let svg = $state<SVGSVGElement>();
	let imageUrl = $state('');
	let sourceWidth = $state(0);
	let sourceHeight = $state(0);

	let editingId = $state<string | null>(null);

	let crop = $state<Rect | null>(null);

	let baseBitmap = $state.raw<ImageBitmap | null>(null);
	let sceneCanvas = $state<HTMLCanvasElement>();
	let status = $state('');
	let statusTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(async () => {
		if (!(await HasSnapshot())) return;

		imageUrl = `/shutter/snapshot.png?t=${Date.now()}`;

		const blob = await (await fetch(imageUrl)).blob();
		let bitmap: ImageBitmap;
		try {
			bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
		} catch {
			bitmap = await createImageBitmap(blob);
		}

		sourceWidth = bitmap.width;
		sourceHeight = bitmap.height;
		baseBitmap = bitmap;
	});

	const layers = new LayerRenderer();

	let pendingDraw: (() => void) | null = null;
	let drawFrame = 0;

	function scheduleDraw(fn: () => void) {
		pendingDraw = fn;
		if (drawFrame) return;
		drawFrame = requestAnimationFrame(() => {
			drawFrame = 0;
			const f = pendingDraw;
			pendingDraw = null;
			f?.();
		});
	}

	$effect(() => {
		const canvas = sceneCanvas;
		const bitmap = baseBitmap;
		if (!canvas || !bitmap || !sourceWidth || !sourceHeight) return;

		const epoch = fontEpoch.n;
		const snap = $state.snapshot(elements) as AnyElement[];
		const skipId = editingId;
		const w = sourceWidth;
		const h = sourceHeight;

		ensureFonts(snap).then((loaded) => {
			if (loaded) fontEpoch.n++;
		});

		scheduleDraw(() =>
			layers.render(getSceneContext(canvas), bitmap, w, h, snap, { skipId, epoch })
		);
	});

	function flash(message: string) {
		status = message;
		clearTimeout(statusTimer);
		statusTimer = setTimeout(() => (status = ''), 3500);
	}

	async function runSave(mode: SaveMode): Promise<boolean> {
		endEditing();
		if (!baseBitmap) return false;
		try {
			const outcome = await performSave(
				exportPng(
					baseBitmap,
					sourceWidth,
					sourceHeight,
					snapshotElements(),
					crop ? { ...crop } : null
				),
				mode
			);
			if (!outcome) return false;

			const { path, copied } = outcome;
			if (!path) flash('Copied');
			else if (!mode.copy) flash(`Saved ${path}`);
			else if (copied) flash(`Saved ${path} and copied`);
			else flash(`Saved ${path}, but could not copy`);
			return !mode.copy || copied;
		} catch (err) {
			console.error('save failed', err);
			flash(mode.destination === 'none' ? 'Could not copy the image' : 'Could not save the image');
			return false;
		}
	}

	async function runAction(id: SaveActionId) {
		const mode = saveActionMeta[id].mode;
		if (!mode) {
			void Quit();
			return;
		}
		if ((await runSave(mode)) && settings.data.closeAfterSave) void Quit();
	}

	function pointerToImage(event: MouseEvent) {
		if (!svg) throw new Error('SVG not mounted');

		const point = new DOMPoint(event.clientX, event.clientY);

		const matrix = svg.getScreenCTM();

		if (!matrix) throw new Error('Unable to get SVG transform');

		const result = point.matrixTransform(matrix.inverse());

		return {
			x: result.x,
			y: result.y
		};
	}

	type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

	type CropDrag =
		| { type: 'create'; startX: number; startY: number }
		| { type: 'move'; startX: number; startY: number; original: Rect }
		| { type: 'resize'; handle: Handle; original: Rect };

	let cropDrag = $state<CropDrag | null>(null);
	let cursor: string | null = $state(null);
	let cursorOverride: boolean = $state(false);

	let magnifierVisible = $state(false);
	let magnifierPoint = $state<{ x: number; y: number } | null>(null);
	let magnifierAnchorX = $state(0);
	let magnifierAnchorY = $state(0);
	let magnifierProgress = $state(0);

	const magRadius = 90;
	const magZoom = 3;
	const magOffset = 120;
	const magFlipZone = 220;
	const magTweenSpeed = 30;
	const magProgressSpeed = 14;

	function smoothstep(edge0: number, edge1: number, x: number) {
		const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
		return t * t * (3 - 2 * t);
	}

	function desiredAnchor(point: { x: number; y: number }) {
		const rightLimit = sourceWidth - magRadius + 180;
		const bottomStart = magRadius + 0;

		const flipX = smoothstep(rightLimit - magFlipZone, rightLimit, point.x + magOffset);
		const ax = point.x + magOffset - flipX * (magOffset * 2);

		const flipY = smoothstep(-30, -30 + magFlipZone, bottomStart - (point.y - magOffset));
		const ay = point.y - magOffset + flipY * (magOffset * 2);

		return { x: ax, y: ay };
	}

	let rafId: number | null = null;
	let lastTick = 0;

	function tweenTick(now: number) {
		rafId = null;

		if (!magnifierPoint) return;

		const dt = lastTick ? Math.min((now - lastTick) / 1000, 0.05) : 0;
		lastTick = now;

		const target = desiredAnchor(magnifierPoint);
		const posT = 1 - Math.exp(-magTweenSpeed * dt);
		magnifierAnchorX += (target.x - magnifierAnchorX) * posT;
		magnifierAnchorY += (target.y - magnifierAnchorY) * posT;

		const progressTarget = magnifierVisible ? 1 : 0;
		const progT = 1 - Math.exp(-magProgressSpeed * dt);
		magnifierProgress += (progressTarget - magnifierProgress) * progT;

		if (!magnifierVisible && magnifierProgress < 0.01) {
			magnifierProgress = 0;
			magnifierPoint = null;
			return;
		}

		rafId = requestAnimationFrame(tweenTick);
	}

	function startMagnifier(point: { x: number; y: number }) {
		const wasHidden = !magnifierVisible;

		magnifierVisible = true;
		magnifierPoint = point;

		if (wasHidden) {
			magnifierAnchorX = point.x;
			magnifierAnchorY = point.y;
			magnifierProgress = 0;
		}

		lastTick = 0;
		if (rafId === null) {
			rafId = requestAnimationFrame(tweenTick);
		}
	}

	function stopMagnifier() {
		magnifierVisible = false;

		lastTick = 0;
		if (rafId === null && magnifierPoint) {
			rafId = requestAnimationFrame(tweenTick);
		}
	}

	function makeRect(x1: number, y1: number, x2: number, y2: number): Rect {
		return {
			x: Math.min(x1, x2),
			y: Math.min(y1, y2),
			width: Math.abs(x2 - x1),
			height: Math.abs(y2 - y1)
		};
	}

	const handleCursor: Record<Handle, string> = {
		nw: 'nw-resize',
		n: 'n-resize',
		ne: 'ne-resize',
		e: 'e-resize',
		se: 'se-resize',
		s: 's-resize',
		sw: 'sw-resize',
		w: 'w-resize'
	};

	const cornerSize = 12;
	const edgeThickness = 8;
	const edgeLength = 24;

	const handleSize: Record<Handle, { width: number; height: number }> = {
		nw: { width: cornerSize, height: cornerSize },
		ne: { width: cornerSize, height: cornerSize },
		se: { width: cornerSize, height: cornerSize },
		sw: { width: cornerSize, height: cornerSize },
		n: { width: edgeLength, height: edgeThickness },
		s: { width: edgeLength, height: edgeThickness },
		e: { width: edgeThickness, height: edgeLength },
		w: { width: edgeThickness, height: edgeLength }
	};

	function hitTestHandle(point: { x: number; y: number }, rect: Rect): Handle | null {
		for (const handle of handles) {
			const [hx, hy] = handlePosition(handle, rect);
			const size = handleSize[handle];
			if (Math.abs(point.x - hx) <= size.width / 2 && Math.abs(point.y - hy) <= size.height / 2) {
				return handle;
			}
		}
		return null;
	}

	function hoverCursor(point: { x: number; y: number }): string {
		if (crop) {
			const handle = hitTestHandle(point, crop);
			if (handle) return handleCursor[handle];

			const inside =
				point.x >= crop.x &&
				point.x <= crop.x + crop.width &&
				point.y >= crop.y &&
				point.y <= crop.y + crop.height;

			if (inside) return 'move';
		}
		return 'crosshair';
	}

	let activeTool = $state<ToolId>('crop');
	let activeToolDef = $derived(toolDefinitions[activeTool]);

	let elements = $state<AnyElement[]>([]);
	let selectedElementId = $state<string | null>(null);
	let selectedElement = $derived(elements.find((el) => el.id === selectedElementId) ?? null);
	let elementDrag = $state<ElementDrag | null>(null);

	let toolOptions = $state<Record<string, Record<string, unknown>>>(buildToolOptions());

	$effect(() => {
		toolOptions = buildToolOptions();
	});

	let settingsOpen = $state(false);

	function modifiersFromEvent(event: PointerEvent): ToolModifiers {
		return { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey };
	}

	let editedElement = $derived(
		activeTool === 'select' || activeTool === 'text' ? selectedElement : null
	);

	let optionFields = $derived(
		editedElement
			? (toolDefinitions[elementTypeToTool[editedElement.type]]?.optionFields ?? [])
			: (activeToolDef.optionFields ?? [])
	);

	function getOptionValue(key: string): unknown {
		if (editedElement) return (editedElement as unknown as Record<string, unknown>)[key];
		return toolOptions[activeTool]?.[key];
	}

	function setOptionValue(key: string, value: unknown) {
		if (editedElement) {
			const idx = elements.findIndex((el) => el.id === editedElement.id);
			if (idx !== -1) {
				const prev = elements[idx];
				const next = { ...prev, [key]: value } as AnyElement;
				elements[idx] = next.type === 'text' ? reflowText(prev as TextElement, next) : next;
			}
			return;
		}
		setToolOption(activeTool, key, value);
	}

	let undoStack: AnyElement[][] = [];
	let redoStack: AnyElement[][] = [];
	let dragBefore: AnyElement[] | null = null;

	function snapshotElements(): AnyElement[] {
		return $state.snapshot(elements) as AnyElement[];
	}

	function snapshotElement(el: AnyElement): AnyElement {
		return $state.snapshot(el) as AnyElement;
	}

	function pushHistory(before: AnyElement[]) {
		undoStack.push(before);
		if (undoStack.length > HistLimit) undoStack.shift();
		redoStack = [];
	}

	function commitDragHistory() {
		if (!dragBefore) return;
		if (JSON.stringify(dragBefore) !== JSON.stringify(snapshotElements())) {
			pushHistory(dragBefore);
		}
		dragBefore = null;
	}

	function undo() {
		const previous = undoStack.pop();
		if (!previous) return;
		redoStack.push(snapshotElements());
		elements = previous;
	}

	function redo() {
		const next = redoStack.pop();
		if (!next) return;
		undoStack.push(snapshotElements());
		elements = next;
	}

	function deleteSelectedElement() {
		const id = selectedElementId;
		if (!id) return;
		pushHistory(snapshotElements());
		elements = elements.filter((el) => el.id !== id);
		selectedElementId = null;
	}

	function isTypingTarget(target: EventTarget | null) {
		return (
			target instanceof HTMLElement &&
			!!target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')
		);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.defaultPrevented || isTypingTarget(event.target) || settingsOpen) return;
		if (elementDrag || cropDrag) return;

		const mod = event.ctrlKey || event.metaKey;
		const key = event.key.toLowerCase();
		if (event.key === 'Enter' && activeTool === 'select' && selectedElement?.type === 'text') {
			event.preventDefault();
			beginEditing(selectedElement.id);
			return;
		}

		if (mod && key === 's') {
			event.preventDefault();
			const id = shortcutSaveAction(event.shiftKey);
			if (id) void runAction(id);
			return;
		}

		if (mod && key === 'z') {
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
			return;
		}

		if (mod && key === 'y') {
			event.preventDefault();
			redo();
			return;
		}

		if ((event.key === 'Delete' || event.key === 'Backspace') && activeTool === 'select') {
			if (!selectedElement) return;
			event.preventDefault();
			deleteSelectedElement();
		}
		if (event.key === 'Escape' && activeTool === 'select') {
			selectedElement = null;
		}
	}

	async function importImages() {
		endEditing();
		const files = await pickImageFiles();
		if (!files.length || !sourceWidth || !sourceHeight) return;

		const area = crop ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
		const added: AnyElement[] = [];
		for (const file of files) {
			try {
				const bitmap = await createImageBitmap(file);
				const step = added.length * 24;
				added.push(
					createImageElement(
						registerImage(bitmap),
						bitmap,
						{ x: area.x + area.width / 2 + step, y: area.y + area.height / 2 + step },
						area
					)
				);
			} catch {
				flash(`Could not open ${file.name}`);
			}
		}
		if (!added.length) return;

		pushHistory(snapshotElements());
		elements.push(...added);
		selectTool('select');
		selectedElementId = added[added.length - 1].id;
	}

	function selectTool(id: ToolId) {
		if (id === 'image') {
			void importImages();
			return;
		}
		endEditing();
		if (id === activeTool || !toolDefinitions[id].implemented) return;
		commitDragHistory();
		activeTool = id;
		elementDrag = null;
		if (id !== 'select') selectedElementId = null;
		if (!cursorOverride) cursor = null;
	}

	function setToolOption(tool: ToolId, key: string, value: unknown) {
		toolOptions[tool] = { ...toolOptions[tool], [key]: value };
	}

	function handleCreatePointerDown(point: { x: number; y: number }, event: PointerEvent) {
		const el = createElement(
			activeTool,
			point,
			toolOptions[activeTool] ?? {},
			modifiersFromEvent(event)
		);
		if (!el) return;

		svg?.setPointerCapture(event.pointerId);
		dragBefore = snapshotElements();
		elements.push(el);
		selectedElementId = null;
		elementDrag = { type: 'create', id: el.id, origin: point };
	}

	function handleSelectPointerDown(point: { x: number; y: number }, event: PointerEvent) {
		if (selectedElement) {
			const handle = getElementHandles(selectedElement).find(
				(h) => Math.hypot(point.x - h.x, point.y - h.y) <= HandleHitRadius
			);
			if (handle) {
				svg?.setPointerCapture(event.pointerId);
				if (!cursorOverride) cursor = getHandleCursor(handle);
				dragBefore = snapshotElements();
				elementDrag = {
					type: 'resize',
					id: selectedElement.id,
					handleId: handle.id,
					original: snapshotElement(selectedElement)
				};
				return;
			}
		}

		for (let i = elements.length - 1; i >= 0; i--) {
			if (hitTestElement(point, elements[i])) {
				selectedElementId = elements[i].id;
				svg?.setPointerCapture(event.pointerId);
				if (!cursorOverride) cursor = 'move';
				dragBefore = snapshotElements();
				elementDrag = {
					type: 'move',
					id: elements[i].id,
					startX: point.x,
					startY: point.y,
					original: { ...elements[i] }
				};
				return;
			}
		}

		selectedElementId = null;
	}

	function hoverCursorForTool(point: { x: number; y: number }): string {
		if (activeTool === 'select') {
			if (selectedElement) {
				const handle = getElementHandles(selectedElement).find(
					(h) => Math.hypot(point.x - h.x, point.y - h.y) <= HandleHitRadius
				);
				if (handle) return getHandleCursor(handle);
			}

			for (let i = elements.length - 1; i >= 0; i--) {
				if (hitTestElement(point, elements[i])) return 'move';
			}

			return 'default';
		}

		return activeToolDef.cursor ?? (activeToolDef.createsElement ? 'crosshair' : 'default');
	}

	function startElementResize(event: PointerEvent, id: string, handleId: string) {
		event.stopPropagation();
		const el = elements.find((e) => e.id === id);
		if (!el) return;
		const handle = getElementHandles(el).find((h) => h.id === handleId);
		if (!handle) return;
		svg?.setPointerCapture(event.pointerId);
		if (!cursorOverride) cursor = getHandleCursor(handle);
		dragBefore = snapshotElements();
		elementDrag = { type: 'resize', id, handleId, original: snapshotElement(el) };
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		const point = pointerToImage(event);

		if (activeTool === 'crop') {
			svg?.setPointerCapture(event.pointerId);

			if (!crop) {
				cropDrag = { type: 'create', startX: point.x, startY: point.y };
				crop = { x: point.x, y: point.y, width: 0, height: 0 };
				if (!cursorOverride) cursor = 'crosshair';
				startMagnifier(point);
				showTooltip({
					anchor: 'mouse',
					content: `${Math.floor(crop.width)}x${Math.floor(crop.height)}`,
					id: 'crop-dimensions'
				});
				return;
			}

			const inside =
				point.x >= crop.x &&
				point.x <= crop.x + crop.width &&
				point.y >= crop.y &&
				point.y <= crop.y + crop.height;

			if (inside) {
				cropDrag = {
					type: 'move',
					startX: point.x,
					startY: point.y,
					original: { ...crop }
				};
				if (!cursorOverride) cursor = 'move';
			} else {
				cropDrag = { type: 'create', startX: point.x, startY: point.y };
				crop = { x: point.x, y: point.y, width: 0, height: 0 };
				if (!cursorOverride) cursor = 'crosshair';
				startMagnifier(point);
				showTooltip({
					anchor: 'mouse',
					content: `${Math.floor(crop.width)}x${Math.floor(crop.height)}`,
					id: 'crop-dimensions'
				});
			}
			return;
		}

		if (activeTool === 'select') {
			handleSelectPointerDown(point, event);
			return;
		}
		if (activeTool === 'text') {
			handleTextPointerDown(point);
			return;
		}
		if (activeToolDef.createsElement) {
			handleCreatePointerDown(point, event);
		}
	}

	function runMoveCB(event: PointerEvent) {
		Object.entries(get(mouseMoveListeners)).forEach(([id, cb]) => {
			const point = pointerToImage(event);

			cb({
				px: event.clientX,
				py: event.clientY,
				ix: point.x,
				iy: point.y
			});
		});
	}

	function handlePointerMove(event: PointerEvent) {
		const point = pointerToImage(event);

		runMoveCB(event);

		if (activeTool === 'crop') {
			if (!cropDrag) {
				if (!cursorOverride) cursor = hoverCursor(point);

				return;
			}

			if (cropDrag.type === 'create') {
				crop = makeRect(cropDrag.startX, cropDrag.startY, point.x, point.y);
				magnifierPoint = point;
				showTooltip({
					anchor: 'mouse',
					content: `${Math.floor(crop.width)}x${Math.floor(crop.height)}`,
					id: 'crop-dimensions'
				});
				return;
			}

			if (cropDrag.type === 'move') {
				const dx = point.x - cropDrag.startX;
				const dy = point.y - cropDrag.startY;

				const original = cropDrag.original;

				crop = {
					...original,
					x: Math.max(0, Math.min(sourceWidth - original.width, original.x + dx)),
					y: Math.max(0, Math.min(sourceHeight - original.height, original.y + dy))
				};

				return;
			}

			if (cropDrag.type === 'resize') {
				const original = cropDrag.original;

				let left = original.x;
				let right = original.x + original.width;
				let top = original.y;
				let bottom = original.y + original.height;

				if (cropDrag.handle.includes('w')) {
					left = point.x;
				}

				if (cropDrag.handle.includes('e')) {
					right = point.x;
				}

				if (cropDrag.handle.includes('n')) {
					top = point.y;
				}

				if (cropDrag.handle.includes('s')) {
					bottom = point.y;
				}

				if (right < left) {
					[left, right] = [right, left];
				}

				if (bottom < top) {
					[top, bottom] = [bottom, top];
				}

				crop = {
					x: Math.max(0, left),
					y: Math.max(0, top),
					width: Math.min(sourceWidth, right) - Math.max(0, left),
					height: Math.min(sourceHeight, bottom) - Math.max(0, top)
				};
				showTooltip({
					anchor: 'mouse',
					content: `${Math.floor(crop.width)}x${Math.floor(crop.height)}`,
					id: 'crop-dimensions'
				});
				showTooltip({
					anchor: 'mouse',
					content: `${Math.floor(crop.width)}x${Math.floor(crop.height)}`,
					id: 'crop-dimensions'
				});
				magnifierPoint = point;
			}

			return;
		}

		if (!elementDrag) {
			if (!cursorOverride) cursor = hoverCursorForTool(point);
			return;
		}

		const drag = elementDrag;

		if (drag.type === 'create') {
			const idx = elements.findIndex((el) => el.id === drag.id);
			if (idx !== -1)
				elements[idx] = updateElementEnd(
					elements[idx],
					point,
					modifiersFromEvent(event),
					drag.origin
				);
			return;
		}

		if (drag.type === 'move') {
			const idx = elements.findIndex((el) => el.id === drag.id);
			if (idx === -1) return;

			const dx = point.x - drag.startX;
			const dy = point.y - drag.startY;

			elements[idx] = moveElement(drag.original, dx, dy);
			return;
		}

		if (drag.type === 'resize') {
			const idx = elements.findIndex((el) => el.id === drag.id);
			if (idx === -1) return;

			elements[idx] = resizeElement(
				elements[idx],
				drag.handleId,
				point,
				modifiersFromEvent(event),
				drag.original
			);
		}
	}

	function runUpCB(event: PointerEvent) {
		Object.entries(get(mouseUpListeners)).forEach(([id, cb]) => {
			cb();
		});
	}

	function handlePointerUp(event: PointerEvent) {
		runUpCB(event);

		if (activeTool === 'crop') {
			if (!cropDrag) return;
			svg?.releasePointerCapture(event.pointerId);
			cropDrag = null;
			stopMagnifier();

			tooltips.hide('crop-dimensions');

			if (crop && (crop.width < 2 || crop.height < 2)) {
				crop = null;
			}

			if (!cursorOverride) cursor = crop ? hoverCursor(pointerToImage(event)) : 'crosshair';
			return;
		}

		if (!elementDrag) return;

		const drag = elementDrag;

		if (drag.type === 'create') {
			const idx = elements.findIndex((el) => el.id === drag.id);
			if (idx !== -1 && isDegenerate(elements[idx])) {
				elements.splice(idx, 1);
				selectedElementId = null;
			} else if (idx !== -1) {
				elements[idx] = finishElement(elements[idx]);
			}
		}

		commitDragHistory();
		svg?.releasePointerCapture(event.pointerId);
		elementDrag = null;
		if (!cursorOverride) cursor = hoverCursorForTool(pointerToImage(event));
	}

	function handlePosition(handle: Handle, rect: Rect) {
		const left = rect.x;
		const right = rect.x + rect.width;
		const top = rect.y;
		const bottom = rect.y + rect.height;
		const centerX = rect.x + rect.width / 2;
		const centerY = rect.y + rect.height / 2;

		return {
			nw: [left, top],
			n: [centerX, top],
			ne: [right, top],
			e: [right, centerY],
			se: [right, bottom],
			s: [centerX, bottom],
			sw: [left, bottom],
			w: [left, centerY]
		}[handle];
	}

	const handles: Handle[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];

	function startResize(event: PointerEvent, handle: Handle) {
		event.stopPropagation();
		if (!crop || !svg) return;

		if (!cursorOverride) cursor = handleCursor[handle];
		svg.setPointerCapture(event.pointerId);

		cropDrag = {
			type: 'resize',
			handle,
			original: { ...crop }
		};

		startMagnifier(pointerToImage(event));
	}

	// svelte-ignore non_reactive_update
	let container: HTMLDivElement;

	function toscreenx(sourceX: number) {
		if (!container) throw new Error('container is undefined');
		const scale = container.clientWidth / sourceWidth;
		return sourceX * scale;
	}

	function toscreeny(sourceY: number) {
		if (!container) throw new Error('container is undefined');
		const scale = container.clientHeight / sourceHeight;
		return sourceY * scale;
	}

	let nearBottom = $derived(!!(crop && crop.y + crop.height > sourceHeight - 80));

	let toolbarDiv: HTMLDivElement = $state(null as unknown as HTMLDivElement);

	function beginEditing(id: string) {
		if (editingId === id) return;
		endEditing();
		dragBefore = snapshotElements();
		selectedElementId = id;
		editingId = id;
	}
	function endEditing(id: string | null = editingId) {
		if (!id || editingId !== id) return;
		editingId = null;
		const idx = elements.findIndex((e) => e.id === id);
		if (idx !== -1 && isDegenerate(elements[idx])) {
			elements.splice(idx, 1);
			selectedElementId = null;
		}
		commitDragHistory();
	}
	function hitText(point: { x: number; y: number }) {
		for (let i = elements.length - 1; i >= 0; i--) {
			const el = elements[i];
			if (el.type === 'text' && hitTestElement(point, el)) return el;
		}
		return null;
	}

	function handleTextPointerDown(point: { x: number; y: number }) {
		const existing = hitText(point);
		if (existing) return beginEditing(existing.id);

		endEditing();
		const el = createElement('text', point, toolOptions.text ?? {});
		if (!el) return;
		dragBefore = snapshotElements();
		elements.push(el);
		selectedElementId = el.id;
		editingId = el.id;
	}

	function handleDoubleClick(event: MouseEvent) {
		if (activeTool !== 'select' && activeTool !== 'text') return;
		const hit = hitText(pointerToImage(event));
		if (hit) beginEditing(hit.id);
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="w-full h-full relative select-none"
	bind:this={container}
	onpointermove={runMoveCB}
	onpointerup={runUpCB}
>
	<!-- <div class={cn('absolute pointer-events-none select-none', cursorOverride && 'text-red-400')}>
		<pre>{cursor || 'null'}
			{JSON.stringify(elements, null, 2)}
		</pre>
	</div> -->
	<svg
		bind:this={svg}
		class="stage"
		viewBox={`0 0 ${sourceWidth} ${sourceHeight}`}
		preserveAspectRatio="xMidYMid meet"
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		ondblclick={handleDoubleClick}
		style={[cursor && `cursor: ${cursor}`].filter(Boolean).join(';')}
	>
		{#if baseBitmap}
			<foreignObject
				x="0"
				y="0"
				width={sourceWidth}
				height={sourceHeight}
				style="pointer-events: none"
			>
				<canvas
					bind:this={sceneCanvas}
					width={sourceWidth}
					height={sourceHeight}
					style="display: block; width: 100%; height: 100%"
					class="select-none pointer-events-none"
				></canvas>
			</foreignObject>
		{/if}
		{#each elements as el (el.id)}
			{#if el.type === 'text' && editingId === el.id}
				<TextNode
					{el}
					editing
					oninput={(text) => {
						const i = elements.findIndex((e) => e.id === el.id);
						if (i !== -1) {
							const prev = elements[i] as TextElement;
							elements[i] = reflowText(prev, { ...prev, text });
						}
					}}
					onexit={() => endEditing(el.id)}
				/>
			{/if}
		{/each}
		<rect
			x="0"
			y="0"
			width={sourceWidth}
			height={crop ? crop.y : 0}
			fill="black"
			opacity={crop ? cropFadeOut : 0}
			style="transition: opacity 200ms;"
			pointer-events="none"
		/>
		<rect
			x="0"
			y={crop ? crop.y + crop.height : 0}
			width={sourceWidth}
			height={sourceHeight - (crop ? crop.y - crop.height : 0)}
			fill="black"
			opacity={crop ? cropFadeOut : 0}
			style="transition: opacity 200ms;"
			pointer-events="none"
		/>
		<rect
			x="0"
			y={crop ? crop.y : 0}
			width={crop ? crop.x : 0}
			height={crop ? crop.height : 0}
			fill="black"
			opacity={crop ? cropFadeOut : 0}
			style="transition: opacity 200ms;"
			pointer-events="none"
		/>
		<rect
			x={crop ? crop.x + crop.width : 0}
			y={crop ? crop.y : 0}
			width={crop ? sourceWidth - crop.x - crop.width : 0}
			height={crop ? crop.height : 0}
			fill="black"
			opacity={crop ? cropFadeOut : 0}
			style="transition: opacity 200ms;"
			pointer-events="none"
		/>

		{#if crop}
			<rect
				x={crop.x}
				y={crop.y}
				width={crop.width}
				height={crop.height}
				fill="none"
				stroke="white"
				stroke-width="2"
				stroke-dasharray="6 4"
				pointer-events="none"
			/>
			<rect
				x={crop.x}
				y={crop.y}
				width={crop.width}
				height={crop.height}
				fill="none"
				stroke="black"
				stroke-width="1"
				stroke-dasharray="6 4"
				stroke-dashoffset=""
				pointer-events="none"
			/>
		{/if}

		{#if crop && activeTool === 'crop'}
			{#each handles as handle}
				{const [x, y] = $derived(handlePosition(handle, crop))}
				{const size = $derived(handleSize[handle])}
				<rect
					x={x - size.width / 2}
					y={y - size.height / 2}
					width={size.width}
					height={size.height}
					class="crop-handle"
					fill="white"
					rx="2"
					style="opacity: {cropDrag ? 0 : 1};"
					onpointerdown={(event) => startResize(event, handle)}
				/>
			{/each}
		{/if}

		{#if activeTool === 'select' && selectedElement}
			{const bounds = $derived(getElementBounds(selectedElement))}

			<g pointer-events="none" transition:fly|global={{ duration: 100 }}>
				<rect
					x={bounds.x}
					y={bounds.y}
					width={bounds.width}
					height={bounds.height}
					fill="none"
					stroke="#aaa"
					stroke-width="1.5"
					stroke-dasharray="5 4"
					rx="6"
					transform={rotationTransform(selectedElement)}
				/>
			</g>
			{#if selectedElement}
				{#key selectedElement.id}
					{#each getElementHandles(selectedElement).toReversed() as handle (handle.id)}
						<g transition:fly|global={{ duration: 100 }}>
							<HandleShape
								{handle}
								cursor={getHandleCursor(handle)}
								onpointerdown={(event) => startElementResize(event, selectedElement!.id, handle.id)}
							/>
						</g>
					{/each}
				{/key}
			{/if}
		{/if}

		{#if magnifierPoint && imageUrl}
			{const cx = $derived(
				magnifierPoint.x + (magnifierAnchorX - magnifierPoint.x) * magnifierProgress
			)}
			{const cy = $derived(
				magnifierPoint.y + (magnifierAnchorY - magnifierPoint.y) * magnifierProgress
			)}
			{const r = $derived(magRadius * magnifierProgress)}
			<g pointer-events="none" opacity={magnifierProgress}>
				<defs>
					<clipPath id="magnifierClip">
						<circle {cx} {cy} {r} />
					</clipPath>
				</defs>

				<g clip-path="url(#magnifierClip)">
					<rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill="#111" />
					<image
						href={imageUrl}
						x={cx - magnifierPoint.x * magZoom}
						y={cy - magnifierPoint.y * magZoom}
						width={sourceWidth * magZoom}
						height={sourceHeight * magZoom}
						style="image-rendering: pixelated;"
					/>
				</g>

				<line
					x1={cx - r}
					y1={cy}
					x2={cx + r}
					y2={cy}
					stroke="red"
					stroke-width="1"
					opacity="0.85"
				/>
				<line
					x1={cx}
					y1={cy - r}
					x2={cx}
					y2={cy + r}
					stroke="red"
					stroke-width="1"
					opacity="0.85"
				/>

				<circle {cx} {cy} {r} fill="none" stroke="white" stroke-width="2" />
				<circle {cx} {cy} r={Math.max(0, r - 1)} fill="none" stroke="black" stroke-width="1" />
			</g>
		{/if}
	</svg>
	{#if status}
		<div
			class="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-popover px-3 py-1.5 text-xs outline"
			transition:fade={{ duration: 150 }}
		>
			{status}
		</div>
	{/if}
	<div
		class={cn(
			'absolute top-4 left-1/2 -translate-x-1/2 z-10 transition-opacity',
			elementDrag && 'pointer-events-none opacity-30'
		)}
	>
		<SaveBar
			actions={settings.data.saveActions}
			onaction={runAction}
			onsettings={() => (settingsOpen = true)}
		/>
	</div>
	{#if crop && !cropDrag}
		{const buffer = 15}
		{let x = $derived(
			clamp(
				toscreeny(crop.x + crop.width / 2),
				toolbarDiv?.clientWidth / 2 + buffer,
				container.clientWidth - toolbarDiv?.clientWidth / 2 - buffer
			)
		)}
		{let y = $derived(toscreenx(crop.y + crop.height + (nearBottom ? -60 : 15)))}
		<div
			class={cn(
				'h-10 bg-popover px-2 py-3 absolute -translate-x-1/2',
				'rounded-xl outline flex flex-row justify-center items-center gap-1 transition-opacity',
				elementDrag && 'pointer-events-none opacity-30',
				!elementDrag && 'pointer-events-auto'
			)}
			style={`
							top: ${y}px;
							left: ${x}px;
							`}
			transition:fly={{ y: nearBottom ? -15 : 15, opacity: 0, duration: 300 }}
			bind:this={toolbarDiv}
		>
			{let dragging = $state(false)}
			<div
				class={cn(
					'absolute left-1/2 -translate-x-1/2 -top-1 rounded-md flex justify-center items-center outline h-1.5 w-10 bg-foreground',
					!dragging && 'cursor-grab',
					dragging && 'cursor-grabbing'
				)}
			>
				<DragHandle
					onMove={({ dpx, dpy }) => {
						x += dpx;
						y += dpy;
					}}
					bind:dragging={
						() => dragging,
						(v) => {
							dragging = v;
							cursorOverride = v;
							cursor = v ? 'grabbing' : null;
						}
					}
				/>
			</div>
			{#each toolOrder as toolId (toolId)}
				{const def = toolDefinitions[toolId]}
				<Button
					variant={activeTool === toolId ? 'default' : 'secondary'}
					size="icon"
					disabled={!def.implemented}
					title={def.label}
					onclick={() => selectTool(toolId)}
				>
					{const Icon = def.icon}
					<Icon />
				</Button>
			{/each}
		</div>

		{#if optionFields.length > 0}
			{#key optionFields}
				{const optionsGap = 5}
				{const optionsHeight = 40}
				{let optionsY = $derived(
					nearBottom ? y - optionsHeight - optionsGap : y + optionsHeight + optionsGap
				)}
				<div
					class={cn(
						'h-10 bg-popover px-3 absolute -translate-x-1/2',
						'rounded-xl outline flex flex-row items-center gap-3 pointer-events-auto transition-opacity',
						elementDrag && 'pointer-events-none opacity-30',
						!elementDrag && 'pointer-events-auto'
					)}
					style={`
									top: ${optionsY}px;
									left: ${x}px;
									`}
					transition:fly|global={{ y: nearBottom ? -15 : 15, opacity: 0, duration: 200 }}
				>
					<OptionFields fields={optionFields} get={getOptionValue} set={setOptionValue} />
				</div>
			{/key}
		{/if}
	{/if}
	{#if settingsOpen}
		<SettingsPanel onclose={() => (settingsOpen = false)} />
	{/if}
</div>

<style>
	.crop-handle {
		transition: opacity 200ms ease-out;
	}
</style>
