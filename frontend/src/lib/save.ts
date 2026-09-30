import { Dialogs } from '@wailsio/runtime';
import { ScreenshotService } from '../../bindings/changeme';

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
	const cut = Math.max(defaultPath.lastIndexOf('/'), defaultPath.lastIndexOf('\\'));
	try {
		return await Dialogs.SaveFile({
			Filename: defaultPath.slice(cut + 1),
			Directory: cut > 0 ? defaultPath.slice(0, cut) : undefined,
			Filters: [{ DisplayName: 'PNG image', Pattern: '*.png' }],
			CanCreateDirectories: true
		});
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
	const chosen = ask
		? ScreenshotService.DefaultSavePath().then(pickSavePath)
		: Promise.resolve('');

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

	const data = await blobToBase64(await blob);
	const path = ask
		? await ScreenshotService.SaveImageTo(target, data)
		: await ScreenshotService.SaveImage(data);
	return { path, copied: await copied };
}
