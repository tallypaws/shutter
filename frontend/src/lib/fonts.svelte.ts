import { ListFonts } from '$lib/wailsjs/go/main/ScreenshotService';

export const fonts = $state({ list: ['Inter'] as string[], loaded: false });

let pending: Promise<void> | null = null;

export function loadFonts() {
	return (pending ??= ListFonts()
		.then((list) => {
			fonts.list = list!;
			fonts.loaded = true;
		})
		.catch((err) => {
			console.error('ListFonts failed', err);
			pending = null;
		}));
}
