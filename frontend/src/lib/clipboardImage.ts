// tn: why the FUCK is there not a standard for copying images

import { ReadClipboardImage, ResolveImageSource } from './wailsjs/go/main/ScreenshotService';

type Candidates = { blobs: Blob[]; sources: string[] };

const sniff = 512;
const imageExt = /\.(png|jpe?g|gif|webp|bmp|avif|tiff?|svg|ico|heic|heif)$/i;

const empty = (): Candidates => ({ blobs: [], sources: [] });

function startsWith(bytes: Uint8Array, ascii: string, offset = 0) {
	if (bytes.length < offset + ascii.length) return false;
	for (let i = 0; i < ascii.length; i++) {
		if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
	}
	return true;
}

export function sniffMime(bytes: Uint8Array): string | null {
	if (bytes.length < 4) return null;
	if (bytes[0] === 0x89 && startsWith(bytes, 'PNG', 1)) return 'image/png';
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	if (startsWith(bytes, 'GIF8')) return 'image/gif';
	if (startsWith(bytes, 'BM') && bytes.length > 14) return 'image/bmp';
	if (startsWith(bytes, 'RIFF') && startsWith(bytes, 'WEBP', 8)) return 'image/webp';
	if (startsWith(bytes, 'ftyp', 4)) {
		const brand = String.fromCharCode(...bytes.slice(8, 12));
		if (brand === 'avif' || brand === 'avis') return 'image/avif';
		if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return 'image/heic';
	}
	if (
		(bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) ||
		(bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a)
	) {
		return 'image/tiff';
	}
	if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon';

	const text = new TextDecoder().decode(bytes).trimStart();
	if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) {
		return 'image/svg+xml';
	}

	return null;
}

async function sniffBlob(blob: Blob): Promise<string | null> {
	try {
		const head = new Uint8Array(await blob.slice(0, sniff).arrayBuffer());
		return sniffMime(head);
	} catch {
		return null;
	}
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.decoding = 'async';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('image failed to decode'));
		img.src = url;
	});
}

async function ensureSvgSize(blob: Blob): Promise<Blob> {
	const text = await blob.text();
	const root = text.match(/<svg\b[^>]*>/i)?.[0];
	if (!root) return blob;
	if (/\swidth\s*=/.test(root) && /\sheight\s*=/.test(root)) return blob;

	const viewBox = root.match(/viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
	const w = viewBox ? Number(viewBox[1]) : 512;
	const h = viewBox ? Number(viewBox[2]) : 512;
	const fixed = root.replace(/<svg\b/i, `<svg width="${w}" height="${h}"`);

	return new Blob([text.replace(root, fixed)], { type: 'image/svg+xml' });
}

export async function blobToBitmap(blob: Blob): Promise<ImageBitmap | null> {
	if (blob.size === 0) return null;

	const sniffed = await sniffBlob(blob);
	const declared = blob.type.toLowerCase();

	if (!sniffed && !declared.startsWith('image/')) return null;

	const type = sniffed ?? declared;
	let typed = blob.type === type ? blob : new Blob([blob], { type });

	if (type === 'image/svg+xml') typed = await ensureSvgSize(typed);
	else {
		try {
			const bitmap = await createImageBitmap(typed);
			if (bitmap.width > 0 && bitmap.height > 0) return bitmap;
			bitmap.close();
		} catch {
		}
	}

	const url = URL.createObjectURL(typed);
	try {
		const img = await loadImageElement(url);
		if (!img.naturalWidth || !img.naturalHeight) return null;
		return await createImageBitmap(img);
	} catch {
		return null;
	} finally {
		URL.revokeObjectURL(url);
	}
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
	try {
		return await (await fetch(dataUrl)).blob();
	} catch {
		return null;
	}
}

function isHttp(src: string) {
	return /^https?:\/\//i.test(src);
}

async function sourceToBlob(raw: string): Promise<Blob | null> {
	let src = raw.trim();
	if (!src) return null;
	if (src.startsWith('//')) src = `https:${src}`;

	if (/^data:/i.test(src) || /^blob:/i.test(src)) {
		const blob = await dataUrlToBlob(src);
		if (blob) return blob;
	}

	try {
		const resolved = await ResolveImageSource(src);
		if (resolved) {
			const blob = await dataUrlToBlob(resolved);
			if (blob) return blob;
		}
	} catch {
	}

	if (isHttp(src)) {
		try {
			const response = await fetch(src);
			if (response.ok) return await response.blob();
		} catch {
		}
	}

	return null;
}

function splitSrcset(srcset: string): string[] {
	return srcset
		.split(',')
		.map((part) => part.trim().split(/\s+/)[0])
		.filter(Boolean);
}

function fromHtml(html: string, into: Candidates) {
	const doc = new DOMParser().parseFromString(html, 'text/html');

	for (const img of doc.querySelectorAll('img')) {
		if (img.getAttribute('src')) into.sources.push(img.getAttribute('src')!);
		for (const url of splitSrcset(img.getAttribute('srcset') ?? '')) into.sources.push(url);
	}
	for (const source of doc.querySelectorAll('source[srcset]')) {
		for (const url of splitSrcset(source.getAttribute('srcset') ?? '')) into.sources.push(url);
	}
	for (const image of doc.querySelectorAll('image')) {
		const href = image.getAttribute('href') ?? image.getAttribute('xlink:href');
		if (href) into.sources.push(href);
	}

	for (const node of doc.querySelectorAll('[style*="url("]')) {
		const style = node.getAttribute('style') ?? '';
		for (const match of style.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
			into.sources.push(match[1]);
		}
	}

	for (const svg of doc.querySelectorAll('svg')) {
		const markup = svg.outerHTML.includes('xmlns')
			? svg.outerHTML
			: svg.outerHTML.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
		into.blobs.push(new Blob([markup], { type: 'image/svg+xml' }));
	}
}

function fromText(text: string, into: Candidates) {
	for (const line of text.split(/\r?\n/)) {
		const value = line.replace(/\0/g, '').trim();
		if (!value || value.startsWith('#')) continue;
		if (value === 'copy' || value === 'cut') continue;

		if (
			/^(https?|file|data|blob):/i.test(value) ||
			value.startsWith('/') ||
			value.startsWith('~/') ||
			imageExt.test(value)
		) {
			into.sources.push(value);
		}
	}
}

function candidatesFromDataTransfer(dt: DataTransfer): Candidates {
	const found = empty();
	const seen = new Set<string>();

	const addBlob = (file: File | Blob | null) => {
		if (!file) return;
		const key = `${(file as File).name ?? ''}:${file.size}:${file.type}:${(file as File).lastModified ?? 0}`;
		if (seen.has(key)) return;
		seen.add(key);
		found.blobs.push(file);
	};

	for (const file of Array.from(dt.files ?? [])) addBlob(file);

	for (const item of Array.from(dt.items ?? [])) {
		if (item.kind === 'file') addBlob(item.getAsFile());
	}

	for (const type of Array.from(dt.types ?? [])) {
		const lower = type.toLowerCase();
		if (lower === 'files' || lower.startsWith('image/')) continue;

		let data = '';
		try {
			data = dt.getData(type);
		} catch {
			continue;
		}
		if (!data) continue;

		if (lower === 'text/html') fromHtml(data, found);
		else fromText(data, found);
	}

	return found;
}

async function candidatesToBitmaps(found: Candidates): Promise<ImageBitmap[]> {
	const bitmaps: ImageBitmap[] = [];

	for (const blob of found.blobs) {
		const bitmap = await blobToBitmap(blob);
		if (bitmap) bitmaps.push(bitmap);
	}
	if (bitmaps.length) return bitmaps;

	const tried = new Set<string>();
	for (const source of found.sources) {
		if (tried.has(source)) continue;
		tried.add(source);

		const blob = await sourceToBlob(source);
		const bitmap = blob ? await blobToBitmap(blob) : null;
		if (bitmap) return [bitmap];
	}

	return bitmaps;
}

async function bitmapsFromClipboardApi(): Promise<ImageBitmap[]> {
	if (!navigator.clipboard?.read) return [];

	const found = empty();
	let items: ClipboardItems;
	try {
		items = await navigator.clipboard.read();
	} catch (error) {
		console.debug('navigator.clipboard.read failed', error);
		return [];
	}

	for (const item of items) {
		for (const type of item.types) {
			const lower = type.toLowerCase();
			try {
				if (lower.startsWith('image/') || lower.startsWith('web image/')) {
					found.blobs.push(await item.getType(type));
				} else if (lower === 'text/html') {
					fromHtml(await (await item.getType(type)).text(), found);
				} else if (lower.startsWith('text/')) {
					fromText(await (await item.getType(type)).text(), found);
				}
			} catch (error) {
				console.debug('clipboard item read failed', type, error);
			}
		}
	}

	return candidatesToBitmaps(found);
}

async function bitmapsFromBackend(): Promise<ImageBitmap[]> {
	try {
		const dataUrl = await ReadClipboardImage();
		const blob = dataUrl ? await dataUrlToBlob(dataUrl) : null;
		const bitmap = blob ? await blobToBitmap(blob) : null;
		return bitmap ? [bitmap] : [];
	} catch (error) {
		console.debug('backend clipboard read failed', error);
		return [];
	}
}

export async function readClipboardImages(dt?: DataTransfer | null): Promise<ImageBitmap[]> {
	const fromEvent = dt ? candidatesFromDataTransfer(dt) : empty();

	const strategies: Array<() => Promise<ImageBitmap[]>> = [
		() => candidatesToBitmaps(fromEvent),
		bitmapsFromClipboardApi,
		bitmapsFromBackend
	];

	for (const strategy of strategies) {
		try {
			const bitmaps = await strategy();
			if (bitmaps.length) return bitmaps;
		} catch (error) {
			console.debug('clipboard strategy failed', error);
		}
	}

	return [];
}
