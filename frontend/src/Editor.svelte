<script lang="ts">
	import { onMount } from 'svelte';
	import { draw, fade, fly, scale } from 'svelte/transition';
	import Button, { buttonVariants } from '$lib/components/ui/button/button.svelte';
	import { cn } from 'cn';
	import { Quit, WindowHide, WindowMinimise } from '$lib/wailsjs/runtime/runtime';
	import { clamp } from '@tally.paws/toolbox';
	import { mouseMoveListeners, mouseUpListeners } from './dragstate';
	import { get } from 'svelte/store';
	import DragHandle from './DragHandle.svelte';
	import {
		elementToolId,
		toolByHotkey,
		toolDefinitions,
		toolOrder,
		toolTooltip
	} from '$lib/tools/registry';
	import { Layers, Redo2, Undo2 } from '@lucide/svelte';
	import { Separator } from '$lib/components/ui/separator';
	import { readClipboardImages } from '$lib/clipboardImage';

	import type {
		AnyElement,
		ElementDrag,
		ImageElement,
		Rect,
		TextElement,
		ToolId,
		ToolModifiers
	} from '$lib/tools/types';
	import {
		createElement,
		createImageElement,
		cloneElement,
		createImageElementAt,
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
	import { boxToRect, getAngleDegrees, mouseX, mouseY, normalizeBox } from '$lib/utils';
	import HandleShape from './HandleShape.svelte';
	import { smoothPath } from '$lib/tools/smooth';
	import {
		DSmooth,
		DSmoothAmt,
		HandleHitRadius,
		HistLimit,
		transgender
	} from '$lib/tools/defaults';
	import { showTooltip, tooltip, tooltips } from './tooltip.svelte';
	import TextNode from './TextNode.svelte';
	import OptionFields from './OptionFields.svelte';
	import LayersPanel from './LayersPanel.svelte';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import {
		buildToolOptions,
		saveActionMeta,
		settings,
		shortcutSaveAction,
		type SaveActionId
	} from '$lib/settings.svelte';
	import { captureRegion, ensureFonts, exportPng, getSceneContext } from '$lib/render/scene';
	import { snapRegion } from '$lib/render/effects';
	import { LayerRenderer } from '$lib/render/layers';
	import { getImage, pickImageFiles, registerImage } from '$lib/render/images';
	import { performSave, type SaveMode } from '$lib/save';
	import { fontEpoch } from '$lib/fontEpoch.svelte';
	import { HasSnapshot } from '$lib/wailsjs/go/main/ScreenshotService';
	import ImageBitmapImg from './ImageBitmapImg.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Kbd } from '$lib/components/ui/kbd';

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
		if ((await runSave(mode)) && settings.data.closeAfterSave) {
			WindowHide();

			if (mode.copy) {
				for (let i = 0; i < 60; i++) {
					if (await clipboardHasValidPng()) break;
					await new Promise((resolve) => setTimeout(resolve, 15));
				}
			}

			Quit();
		}
	}

	async function clipboardHasValidPng(): Promise<boolean> {
		try {
			const items = await navigator.clipboard.read();

			for (const item of items) {
				if (!item.types.includes('image/png')) continue;

				const blob = await item.getType('image/png');

				if (blob.size === 0) continue;

				const bitmap = await createImageBitmap(blob);

				const valid = bitmap.width > 0 && bitmap.height > 0;

				bitmap.close();

				if (valid) return true;
			}
		} catch (err) {
			console.error('Clipboard verification failed:', err);
		}

		return false;
	}

	function pointerToImage(event: { clientX: number; clientY: number }) {
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
			? (toolDefinitions[elementToolId(editedElement)]?.optionFields ?? [])
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

	let undoDepth = $state(0);
	let redoDepth = $state(0);
	function syncHistoryDepth() {
		undoDepth = undoStack.length;
		redoDepth = redoStack.length;
	}

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
		syncHistoryDepth();
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
		syncHistoryDepth();
	}

	function redo() {
		const next = redoStack.pop();
		if (!next) return;
		undoStack.push(snapshotElements());
		elements = next;
		syncHistoryDepth();
	}

	function deleteSelectedElement() {
		const id = selectedElementId;
		if (!id) return;
		pushHistory(snapshotElements());
		elements = elements.filter((el) => el.id !== id);
		selectedElementId = null;
	}

	const ElementClipboardMarker = 'shutter-element';
	const DuplicateOffset = 12;
	let elementClipboard: AnyElement | null = null;

	function isPending(id: string) {
		return pendingImages.some((p) => p.id === id);
	}

	function copySelectedElement(): boolean {
		if (!selectedElement || isPending(selectedElement.id)) return false;
		elementClipboard = snapshotElement(selectedElement);
		void navigator.clipboard?.writeText(ElementClipboardMarker).catch(() => {});
		return true;
	}

	function cutSelectedElement() {
		if (copySelectedElement()) deleteSelectedElement();
	}

	function insertClone(source: AnyElement, dx: number, dy: number): AnyElement {
		const copy = cloneElement(source, dx, dy);
		endEditing();
		pushHistory(snapshotElements());
		elements.push(copy);
		selectedElementId = copy.id;
		if (activeTool !== 'select') selectTool('select');
		return copy;
	}

	function duplicateSelectedElement() {
		if (!selectedElement || isPending(selectedElement.id)) return;
		insertClone(selectedElement, DuplicateOffset, DuplicateOffset);
	}

	let pasteKeyHeld = false;
	let followId: string | null = null;
	let followLast: { x: number; y: number } | null = null;

	function pasteElementAtPointer() {
		if (!elementClipboard || !pasteKeyHeld || followId || !svg) return;
		const pointer = pointerToImage({ clientX: mouseX(), clientY: mouseY() });
		const bounds = getElementBounds(elementClipboard);
		const copy = insertClone(
			elementClipboard,
			pointer.x - (bounds.x + bounds.width / 2),
			pointer.y - (bounds.y + bounds.height / 2)
		);
		followId = copy.id;
		followLast = pointer;
	}

	function followPointer(event: PointerEvent) {
		if (!followId || !followLast) return;
		const point = pointerToImage(event);
		const dx = point.x - followLast.x;
		const dy = point.y - followLast.y;
		followLast = point;
		const index = elements.findIndex((el) => el.id === followId);
		if (index !== -1 && (dx || dy)) elements[index] = moveElement(elements[index], dx, dy);
	}

	function endFollow() {
		followId = null;
		followLast = null;
	}

	function releasePasteKey() {
		pasteKeyHeld = false;
		endFollow();
	}

	function handlePasteKeyUp(event: KeyboardEvent) {
		const key = event.key.toLowerCase();
		if (key === 'v' || key === 'control' || key === 'meta') releasePasteKey();
	}

	let layersOpen = $state(false);

	let layerElements = $derived(elements.filter((el) => !pendingImages.some((p) => p.id === el.id)));

	function selectLayer(id: string) {
		selectTool('select');
		selectedElementId = id;
	}

	function applyLayerOrder(order: string[]) {
		const before = snapshotElements();
		const pending = new Set(pendingImages.map((p) => p.id));
		const byId = new Map(before.map((el) => [el.id, el]));

		const next = [...before];
		let i = 0;
		for (let slot = 0; slot < next.length; slot++) {
			if (pending.has(next[slot].id)) continue;
			const el = byId.get(order[i++]);
			if (el) next[slot] = el;
		}

		if (next.every((el, idx) => el.id === before[idx].id)) return;
		pushHistory(before);
		elements = next;
	}

	function reorderLayers(topToBottom: string[]) {
		applyLayerOrder(topToBottom.toReversed());
	}

	function stepLayer(id: string, step: number) {
		const order = layerElements.map((el) => el.id);
		const from = order.indexOf(id);
		if (from === -1) return;
		const to = clamp(from + step, 0, order.length - 1);
		if (to === from) return;
		order.splice(to, 0, ...order.splice(from, 1));
		applyLayerOrder(order);
	}

	function isTypingTarget(target: EventTarget | null) {
		return (
			target instanceof HTMLElement &&
			!!target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')
		);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.defaultPrevented || isTypingTarget(event.target) || settingsOpen) return;
		if (cloneDrag && event.key === 'Escape') {
			event.preventDefault();
			cancelClone();
			return;
		}
		if (elementDrag || cropDrag || cloneDrag) return;

		if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey) {
			if (
				event.target instanceof HTMLElement &&
				event.target.closest(
					'[role="dialog"], [role="listbox"], [role="menu"], [data-popover-content], [data-select-content]'
				)
			) {
				return;
			}
			event.preventDefault();
			if (editingId) {
				endEditing();
			} else if (pendingImages.length) {
				selectTool('select');
			} else if (layersOpen) {
				layersOpen = false;
			} else {
				closeEditor();
			}
			return;
		}

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

		if (mod && !event.altKey && !event.shiftKey && (key === 'c' || key === 'x')) {
			if (!selectedElement || activeTool === 'crop') return;
			event.preventDefault();
			if (key === 'c') copySelectedElement();
			else cutSelectedElement();
			return;
		}

		if (mod && !event.altKey && !event.shiftKey && key === 'd') {
			if (!selectedElement) return;
			event.preventDefault();
			if (!event.repeat) duplicateSelectedElement();
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

		if (!mod && !event.altKey && activeTool === 'select' && selectedElement) {
			const steps: Record<string, number> = { '[': -1, ']': 1, '{': -Infinity, '}': Infinity };
			const step = steps[event.key];
			if (step !== undefined) {
				event.preventDefault();
				stepLayer(selectedElement.id, step);
				return;
			}
		}

		if (!mod && !event.altKey && !event.shiftKey && !event.repeat) {
			const hotkeyTool = toolByHotkey.get(key);
			if (hotkeyTool) {
				event.preventDefault();
				selectTool(hotkeyTool);
				return;
			}
		}

		if ((event.key === 'Delete' || event.key === 'Backspace') && activeTool === 'select') {
			if (!selectedElement) return;
			event.preventDefault();
			deleteSelectedElement();
		}
	}

	function closeEditor() {
		void Quit();
	}

	const pendingImages: ImageElement[] = $state([]);

	async function placeImage() {
		const image = pendingImages.shift();
		if (!image) return;
		pushHistory(snapshotElements());

		const { x, y } = pointerToImage({ clientX: mouseX(), clientY: mouseY() });

		const width = image.x2 - image.x1;
		const height = image.y2 - image.y1;

		image.x1 = x;
		image.y1 = y;
		image.x2 = x + width;
		image.y2 = y + height;

		const index = elements.findIndex((e) => e.id === image.id);
		elements[index] = image;
		if (pendingImages.length === 0) activeTool = 'select';
	}

	function addBitmaps(bitmaps: ImageBitmap[]) {
		if (!bitmaps.length || !sourceWidth || !sourceHeight) return false;
		const area = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };

		const added = bitmaps.map((bitmap) =>
			createImageElement(
				registerImage(bitmap),
				bitmap,
				{ x: -bitmap.width / 2, y: -bitmap.height / 2 },
				area
			)
		);

		endEditing();
		elements.push(...added);
		pendingImages.push(...added);
		activeTool = 'image';
		return true;
	}

	let pasteInFlight = false;
	let pasteEventSeen = false;

	async function pasteImages(dt: DataTransfer | null) {
		if (pasteInFlight) return;
		pasteInFlight = true;
		try {
			const marked = dt?.getData('text/plain') === ElementClipboardMarker;
			if (elementClipboard && (marked || !dt)) {
				pasteElementAtPointer();
				return;
			}
			const bitmaps = await readClipboardImages(dt);
			if (!bitmaps.length && elementClipboard) {
				pasteElementAtPointer();
				return;
			}
			if (!addBitmaps(bitmaps)) flash('No image found on the clipboard');
		} catch (error) {
			console.error('paste failed', error);
			flash('Could not paste the image');
		} finally {
			pasteInFlight = false;
		}
	}

	function handlePaste(event: ClipboardEvent) {
		pasteEventSeen = true;
		if (isTypingTarget(event.target) || settingsOpen) return;

		event.preventDefault();
		void pasteImages(event.clipboardData);
	}

	function handlePasteShortcut(event: KeyboardEvent) {
		if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v') return;
		if (event.altKey || isTypingTarget(event.target) || settingsOpen) return;

		pasteKeyHeld = true;
		pasteEventSeen = false;
		setTimeout(() => {
			if (!pasteEventSeen) void pasteImages(null);
		}, 120);
	}

	onMount(() => {
		window.addEventListener('paste', handlePaste);
		window.addEventListener('keydown', handlePasteShortcut);
		window.addEventListener('keyup', handlePasteKeyUp);
		window.addEventListener('pointermove', followPointer);
		window.addEventListener('blur', releasePasteKey);
		return () => {
			window.removeEventListener('keyup', handlePasteKeyUp);
			window.removeEventListener('pointermove', followPointer);
			window.removeEventListener('blur', releasePasteKey);
			window.removeEventListener('paste', handlePaste);
			window.removeEventListener('keydown', handlePasteShortcut);
		};
	});

	async function importImages() {
		endEditing();
		const files = await pickImageFiles();
		if (!files.length || !sourceWidth || !sourceHeight) {
			activeTool = 'select';
			return;
		}

		// const added: ImageElement[] = [];
		// for (const file of files) {
		// 	try {
		// 		addImage(file);
		// 	} catch {
		// 		flash(`Could not open ${file.name}`);
		// 	}
		// }
		// if (!added.length) return;

		// // elements.push(...added);
		// pendingImages.push(...added);
		// // selectedElementId = added[added.length - 1].id;

		const area = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
		const added: ImageElement[] = [];
		for (const file of files) {
			try {
				const bitmap = await createImageBitmap(file);
				added.push(
					createImageElement(
						registerImage(bitmap),
						bitmap,
						{ x: -bitmap.width / 2, y: -bitmap.height / 2 },
						area
					)
				);
			} catch {
				flash(`Could not open ${file.name}`);
			}
		}
		if (!added.length) return;

		elements.push(...added);
		pendingImages.push(...added);
	}

	function selectTool(id: ToolId) {
		if (id === 'image') {
			activeTool = id;

			void importImages();
			return;
		} else {
			while (pendingImages.length) {
				const img = pendingImages.shift();
				if (!img) continue;
				getImage(img.assetId!)?.close();
				const index = elements.findIndex((e) => e.id === img.id);
				elements.splice(index);
			}
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

	let cloneDrag = $state<{ pointerId: number; startX: number; startY: number } | null>(null);
	let cloneRect = $state<Rect | null>(null);
	let cloneBusy = false;

	function clonePoint(point: { x: number; y: number }) {
		return { x: clamp(point.x, 0, sourceWidth), y: clamp(point.y, 0, sourceHeight) };
	}

	function handleClonePointerDown(point: { x: number; y: number }, event: PointerEvent) {
		if (cloneBusy || !baseBitmap) return;
		endEditing();
		const start = clonePoint(point);
		svg?.setPointerCapture(event.pointerId);
		cloneDrag = { pointerId: event.pointerId, startX: start.x, startY: start.y };
		cloneRect = { x: start.x, y: start.y, width: 0, height: 0 };
		selectedElementId = null;
	}

	function handleCloneMove(point: { x: number; y: number }, event: PointerEvent) {
		if (!cloneDrag) return;
		let end = clonePoint(point);
		if (event.shiftKey) {
			const dx = end.x - cloneDrag.startX;
			const dy = end.y - cloneDrag.startY;
			const size = Math.max(Math.abs(dx), Math.abs(dy));
			end = clonePoint({
				x: cloneDrag.startX + Math.sign(dx || 1) * size,
				y: cloneDrag.startY + Math.sign(dy || 1) * size
			});
		}
		cloneRect = makeRect(cloneDrag.startX, cloneDrag.startY, end.x, end.y);
		showTooltip({
			anchor: 'mouse',
			content: `${Math.round(cloneRect.width)}x${Math.round(cloneRect.height)}`,
			id: 'clone-dimensions'
		});
	}

	function endCloneDrag() {
		if (cloneDrag) {
			try {
				svg?.releasePointerCapture(cloneDrag.pointerId);
			} catch {}
		}
		cloneDrag = null;
		cloneRect = null;
		tooltips.hide('clone-dimensions');
	}

	function cancelClone() {
		endCloneDrag();
		if (!cursorOverride) cursor = 'crosshair';
	}

	async function finishClone() {
		const rect = cloneRect;
		endCloneDrag();
		if (!rect || !baseBitmap || cloneBusy) return;

		const region = snapRegion(
			{ x1: rect.x, y1: rect.y, x2: rect.x + rect.width, y2: rect.y + rect.height },
			sourceWidth,
			sourceHeight
		);
		if (!region) return;

		cloneBusy = true;
		try {
			const bitmap = await captureRegion(
				baseBitmap,
				sourceWidth,
				sourceHeight,
				snapshotElements(),
				region
			);
			const el = createImageElementAt(registerImage(bitmap), {
				x: region.x,
				y: region.y,
				width: region.w,
				height: region.h
			});

			pushHistory(snapshotElements());
			elements.push(el);
			selectedElementId = el.id;
			activeTool = 'select';
			if (!cursorOverride) cursor = 'move';
		} catch (error) {
			console.error('clone failed', error);
			flash('Could not clone the area');
		} finally {
			cloneBusy = false;
		}
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

		if (activeTool === 'image') {
			placeImage();
			return;
		}

		if (activeTool === 'text') {
			handleTextPointerDown(point);
			return;
		}

		if (activeTool === 'clone') {
			handleClonePointerDown(point, event);
			return;
		}
		if (activeToolDef.createsElement) {
			handleCreatePointerDown(point, event);
		}
	}

	function runMoveCB(event: PointerEvent) {
		mouseY.set(event.clientY);
		mouseX.set(event.clientX);
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

		if (activeTool === 'image') {
			if (!cursorOverride) cursor = 'crosshair';
			return;
		}

		if (activeTool === 'clone') {
			handleCloneMove(point, event);
			if (!cloneDrag && !cursorOverride) cursor = 'crosshair';
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
					drag.origin,
					Number(toolOptions[activeTool]?.minDistance) || 0
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

		if (activeTool === 'clone') {
			if (cloneDrag) void finishClone();
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

	function toScreenX(sourceX: number) {
		if (!container) throw new Error('container is undefined');
		const scale = container.clientWidth / sourceWidth;
		return sourceX * scale;
	}

	function toScreenY(sourceY: number) {
		if (!container) throw new Error('container is undefined');
		const scale = container.clientHeight / sourceHeight;
		return sourceY * scale;
	}

	let nearBottom = $derived(!!(crop && crop.y + crop.height > sourceHeight - 80));

	let toolbarDiv: HTMLDivElement = $state(null as unknown as HTMLDivElement);

	const topBarInset = 16;
	let topBarEl = $state<HTMLDivElement>();
	let topBarOffset = $state({ x: 0, y: 0 });
	let topBarDragging = $state(false);

	function moveTopBar(dx: number, dy: number) {
		if (!container || !topBarEl) return;
		const { clientWidth: cw, clientHeight: ch } = container;
		const { offsetWidth: bw, offsetHeight: bh } = topBarEl;

		const maxX = Math.max(0, (cw - bw) / 2);
		const minY = -topBarInset;
		const maxY = Math.max(minY, ch - bh - topBarInset);

		topBarOffset = {
			x: clamp(topBarOffset.x + dx, -maxX, maxX),
			y: clamp(topBarOffset.y + dy, minY, maxY)
		};
	}

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

	// idea from rayne sorry your ui is too good i have to steal it

	const hlPadding = 8;
	const hlButtonSize = 32;
	const hlGap = 4;

	const hlStiffness = 620;
	const hlDamping = 50;
	const hlStretchAmount = 0.00002;
	const hlMaxStretch = 0.45;
	const hlMaxSquash = 0.3;
	const hlVolume = 0.95;
	const hlScaleSmoothing = 35;
	const hlRestEpsilon = 0.05;
	const hlSubstep = 1 / 240;

	function hlTarget() {
		const i = toolOrder.findIndex((e) => e === activeTool);
		return hlPadding + i * (hlButtonSize + hlGap);
	}

	let hlX = $state(hlTarget());
	let hlSX = $state(1);
	let hlSY = $state(1);
	let hlVel = 0;
	let hlRaf: number | null = null;
	let hlLast = 0;

	function hlTick(now: number) {
		hlRaf = null;

		const frameDt = hlLast ? Math.min((now - hlLast) / 1000, 0.05) : 0;
		hlLast = now;

		const target = hlTarget();
		let accelAlong = 0;

		let remaining = frameDt;
		while (remaining > 0) {
			const dt = Math.min(hlSubstep, remaining);
			remaining -= dt;

			const accel = hlStiffness * (target - hlX) - hlDamping * hlVel;
			hlVel += accel * dt;
			hlX += hlVel * dt;

			const dir = Math.abs(hlVel) > 1 ? Math.sign(hlVel) : Math.sign(target - hlX);
			accelAlong = accel * dir;
		}

		if (frameDt > 0) {
			const sTarget = Math.min(
				1 + hlMaxStretch,
				Math.max(1 - hlMaxSquash, 1 + accelAlong * hlStretchAmount)
			);
			const t = 1 - Math.exp(-hlScaleSmoothing * frameDt);
			hlSX += (sTarget - hlSX) * t;
			hlSY = Math.pow(hlSX, -hlVolume);
		}

		const settled =
			Math.abs(target - hlX) < hlRestEpsilon &&
			Math.abs(hlVel) < hlRestEpsilon &&
			Math.abs(hlSX - 1) < 0.002;

		if (settled) {
			hlX = target;
			hlVel = 0;
			hlSX = 1;
			hlSY = 1;
			hlLast = 0;
			return;
		}

		hlRaf = requestAnimationFrame(hlTick);
	}

	$effect(() => {
		activeTool;
		hlTarget();
		if (hlRaf === null) {
			hlLast = 0;
			hlRaf = requestAnimationFrame(hlTick);
		}
	});

	const stackOffsetX = 0;
	const stackOffsetY = 0;
	const stackShrink = 0.00;
	const stackFade = 0.66;
	const stackMinOpacity = 0.00;
	const stackMoveMs = 250;
	const stackEase = 'cubic-bezier(0.34, 1.4, 0.64, 1)';
	const stackPlaceDistance = 48;
	const stackPlaceMs = 200;
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="w-full h-full relative select-none"
	bind:this={container}
	onpointermove={runMoveCB}
	onpointerup={runUpCB}
>
	<!-- <div class="absolute pointer-events-none" style="top: {$mouseY}px; left: {$mouseX}px;">
		{#if pendingImages[0]}
			{const image = $derived(getImage(pendingImages[0].assetId))}

			<div
				class="max-w-25 p-2 bg-popover/40 backdrop-blur-lg rounded-lg outline-2 flex justify-center items-center relative mt-3 ml-3"
			>
				<Badge class="absolute top-0 left-full -translate-x-1/2 -translate-y-1/2">
					{pendingImages.length}
				</Badge>
				<ImageBitmapImg bitmap={image} class="rounded-md max-h-25 max-w-25" />
			</div>
		{/if}
	</div> -->
	<div class="absolute pointer-events-none" style="top: {$mouseY}px; left: {$mouseX}px;">
		{#each pendingImages as image, i (image.id)}
			{const bitmap = $derived(getImage(image.assetId))}

			<div
				class="absolute top-0 left-0 mt-3 ml-3"
				style="
				z-index: {pendingImages.length - i};
				transform: translate({i * stackOffsetX}px, {i * stackOffsetY}px) scale({1 - i * stackShrink});
				transform-origin: top left;
				opacity: {Math.max(stackMinOpacity, 1 - i * stackFade)};
				transition: transform {stackMoveMs}ms {stackEase}, opacity {stackMoveMs}ms ease-out;
			"
			>
				<div
					class="w-25 p-2 bg-popover rounded-lg outline-2 flex justify-center items-center relative"
					in:fade={{ duration: 150 }}
					out:fly={{ y: stackPlaceDistance, duration: stackPlaceMs, opacity: 0 }}
				>
					{#if i === 0 && pendingImages.length !== 1}
						<Badge class="absolute top-0 left-full -translate-x-1/2 -translate-y-1/2">
							{pendingImages.length}
						</Badge>
					{/if}
					<ImageBitmapImg {bitmap} class="rounded-md max-h-25 max-w-25" />
				</div>
			</div>
		{/each}
	</div>
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

		{#if cloneRect}
			<rect
				x={cloneRect.x}
				y={cloneRect.y}
				width={cloneRect.width}
				height={cloneRect.height}
				fill="white"
				fill-opacity="0.08"
				stroke="white"
				stroke-width="2"
				stroke-dasharray="6 4"
				pointer-events="none"
			/>
			<rect
				x={cloneRect.x}
				y={cloneRect.y}
				width={cloneRect.width}
				height={cloneRect.height}
				fill="none"
				stroke="black"
				stroke-width="1"
				stroke-dasharray="6 4"
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
		bind:this={topBarEl}
		class={cn(
			'absolute top-4 left-1/2 z-10',
			!topBarDragging && 'transition-opacity',
			elementDrag && 'pointer-events-none opacity-30'
		)}
		style="transform: translate(calc(-50% + {topBarOffset.x}px), {topBarOffset.y}px);"
	>
		<div
			class={cn(
				'absolute left-1/2 -translate-x-1/2 -top-1 z-10 rounded-md flex justify-center items-center outline h-1.5 w-10 bg-foreground',
				!topBarDragging && 'cursor-grab',
				topBarDragging && 'cursor-grabbing'
			)}
			title="Drag to move"
		>
			<DragHandle
				onMove={({ dpx, dpy }) => moveTopBar(dpx, dpy)}
				bind:dragging={
					() => topBarDragging,
					(v) => {
						topBarDragging = v;
						cursorOverride = v;
						cursor = v ? 'grabbing' : null;
					}
				}
			/>
		</div>
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
				toScreenY(crop.x + crop.width / 2),
				toolbarDiv?.clientWidth / 2 + buffer,
				container.clientWidth - toolbarDiv?.clientWidth / 2 - buffer
			)
		)}
		{let y = $derived(toScreenX(crop.y + crop.height + (nearBottom ? -60 : 15)))}
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
			<div
				class={buttonVariants({
					size: 'icon',
					variant: 'default',
					class: 'pointer-events-none absolute -z-10 transition-none'
				})}
				style="left: 0; transform: translateX({hlX}px) scale({hlSX}, {hlSY}); will-change: transform;"
			></div>
			{#each toolOrder as toolId (toolId)}
				{const def = toolDefinitions[toolId]}
				<span use:tooltip={{ content: toolTooltip(toolId) }}>
					<Button
						variant={activeTool === toolId ? 'default' : 'secondary'}
						size="icon"
						class="bg-transparent "
						disabled={!def.implemented}
						onclick={() => selectTool(toolId)}
					>
						{const Icon = def.icon}
						<Icon />
					</Button>
				</span>
			{/each}
			<Separator orientation="vertical" class="mx-1 h-5 self-center" />
			{#snippet ctrlz()}
				<Kbd>Ctrl</Kbd>
				<Kbd>Z</Kbd>
			{/snippet}
			<span use:tooltip={['Undo']}>
				<Button
					variant="secondary"
					size="icon"
					class="bg-transparent"
					aria-label="Undo"
					disabled={undoDepth === 0}
					onclick={undo}
				>
					<Undo2 />
				</Button>
			</span>
			<span use:tooltip={['Redo']}>
				<Button
					variant="secondary"
					size="icon"
					class="bg-transparent"
					aria-label="Redo"
					disabled={redoDepth === 0}
					onclick={redo}
				>
					<Redo2 />
				</Button>
			</span>
			<Separator orientation="vertical" class="mx-1 h-5 self-center" />
			<span use:tooltip={'Layers'}>
				<Button
					variant="secondary"
					size="icon"
					class={layersOpen ? '' : 'bg-transparent'}
					aria-label="Layers"
					aria-pressed={layersOpen}
					onclick={() => (layersOpen = !layersOpen)}
				>
					<Layers />
				</Button>
			</span>
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
	<LayersPanel
		elements={layerElements}
		selectedId={selectedElementId}
		bind:open={layersOpen}
		dimmed={!!elementDrag}
		onselect={selectLayer}
		onreorder={reorderLayers}
	/>
	<SettingsPanel onclose={() => (settingsOpen = false)} open={settingsOpen} />
</div>

<style>
	.crop-handle {
		transition: opacity 200ms ease-out;
	}
</style>
