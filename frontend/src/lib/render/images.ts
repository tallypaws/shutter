import { v7 as uuid } from 'uuid';

const bitmaps = new Map<string, ImageBitmap>();

export function registerImage(bitmap: ImageBitmap): string {
	const id = uuid();
	bitmaps.set(id, bitmap);
	return id;
}

export function getImage(id: string): ImageBitmap | undefined {
	return bitmaps.get(id);
}

export function pickImageFiles(): Promise<File[]> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.multiple = true;
		input.onchange = () => resolve(Array.from(input.files ?? []));
		input.oncancel = () => resolve([]);
		input.click();
	});
}
