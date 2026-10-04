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
export async function performSave(
	blob: Promise<Blob>,
	{ destination, copy }: SaveMode
): Promise<SaveOutcome | null> {
	if (destination === 'none') {
		const image = await blob;
		await copyPng(image);
		return { path: null, copied: true };
	}

	const ask = destination === 'ask';

	const chosen = ask
		? DefaultSavePath().then(pickSavePath)
		: Promise.resolve(settings.data.saveDir);

	const target = await chosen;

	if (ask && !target) {
		return null;
	}

	const image = await blob;

	const data = base64ToBytes(await blobToBase64(image));

	const copyPromise = copy
		? copyPng(image).then(
				() => true,
				() => false
			)
		: Promise.resolve(false);

	const savePromise = ask
		? SaveImageTo(target, data)
		: SaveImage(data);

	const [path, copied] = await Promise.all([
		savePromise,
		copyPromise
	]);

	return { path, copied };
}

function base64ToBytes(base64: string): number[] {
	const binary = atob(base64);
	return Array.from(binary, (char) => char.charCodeAt(0));
}
