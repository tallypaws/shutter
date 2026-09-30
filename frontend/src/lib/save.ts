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
export function copyPng(blob: Promise<Blob>): Promise<void> {
	return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
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
		await copyPng(blob);
		return { path: null, copied: true };
	}

	const ask = destination === 'ask';
	const chosen = ask ? DefaultSavePath().then(pickSavePath) : Promise.resolve('');

	const copied = copy
		? copyPng(
				chosen.then((path) => {
					if (ask && !path) throw new Error('cancelled');
					return blob;
				})
			).then(
				() => true,
				() => false
			)
		: Promise.resolve(false);

	const target = await chosen;
	if (ask && !target) {
		await copied;
		return null;
	}

	const data = base64ToBytes(await blobToBase64(await blob));
	const path = ask ? await SaveImageTo(target, data) : await SaveImage(data);
	return { path, copied: await copied };
}

function base64ToBytes(base64: string): number[] {
	const binary = atob(base64);
	return Array.from(binary, (char) => char.charCodeAt(0));
}
