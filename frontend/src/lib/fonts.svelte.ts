import { ScreenshotService } from '../../bindings/changeme';

export const fonts = $state({ list: ['Inter'] as string[], loaded: false });

let pending: Promise<void> | null = null;

export function loadFonts() {
	return (pending ??= ScreenshotService.ListFonts()
		.then((list) => { fonts.list = list!; fonts.loaded = true; })
		.catch((err) => { console.error('ListFonts failed', err); pending = null; }));
}