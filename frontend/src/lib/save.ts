import { settings } from './settings.svelte';
import {
	DefaultSavePath,
	PickSavePath,
	SaveImageTo,
	SaveImage
} from './wailsjs/go/main/ScreenshotService';

export type SaveDestination = 'none' | 'default' | 'ask';

export type SaveMode = {
	destination: SaveDestination;
	copy: boolean;
};

export type SaveOutcome = {
	path: string | null;
	copied: boolean;
};

export async function pickSavePath(defaultPath: string): Promise<string> {
	try {
		return await PickSavePath(defaultPath);
	} catch {
		return '';
	}
}

export async function copyPng(blob: Blob): Promise<void> {
	await navigator.clipboard.write([
		new ClipboardItem({ 'image/png': blob })
	]);
}

export function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

async function tryCopy(image: Blob): Promise<boolean> {
	try {
		await copyPng(image);
		return true;
	} catch (err) {
		console.error('copy failed', err);
		return false;
	}
}

export async function performSave(
	blob: Promise<Blob>,
	{ destination, copy }: SaveMode
): Promise<SaveOutcome | null> {
	const image = await blob;

	if (destination === 'none') {
		await copyPng(image);
		return { path: null, copied: true };
	}

	const copied = copy ? await tryCopy(image) : false;

	const ask = destination === 'ask';
	const saveDir = settings.data.saveDir;

	let target = '';
	if (ask) {
		target = await DefaultSavePath(saveDir).then(pickSavePath);
		if (!target) return null;
	}

	const data = await blobToBase64(image);
	const path = await (ask ? SaveImageTo(target, data) : SaveImage(saveDir, data));

	return { path, copied };
}
