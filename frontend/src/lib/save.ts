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
		await copyPng(await blob);
		return { path: null, copied: true };
	}

	const ask = destination === 'ask';
	const saveDir = settings.data.saveDir;

	let target = '';
	if (ask) {
		target = await DefaultSavePath(saveDir).then(pickSavePath);
		if (!target) return null;
	}

	const image = await blob;

	const copyPromise = copy
		? copyPng(image).then(
				() => true,
				(err) => {
					console.error('copy failed', err);
					return false;
				}
			)
		: Promise.resolve(false);

	const savePromise = blobToBase64(image).then((data) =>
		ask ? SaveImageTo(target, data) : SaveImage(saveDir, data)
	);

	const [saved, copied] = await Promise.all([
		savePromise.then(
			(path) => ({ ok: true as const, path }),
			(error: unknown) => ({ ok: false as const, error })
		),
		copyPromise
	]);

	if (!saved.ok) throw saved.error;

	return { path: saved.path, copied };
}
