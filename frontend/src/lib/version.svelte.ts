import { Version } from './wailsjs/go/main/ScreenshotService';

export const app = $state({ version: '' });

let pending: Promise<void> | null = null;

export function loadVersion(): Promise<void> {
	pending ??= Version()
		.then((v) => {
			app.version = v;
		})
		.catch((err) => {
			console.error('load version failed', err);
			pending = null;
		});
	return pending;
}
