import {
	CaptureMethods,
	SetCaptureMethod,
	TestCaptureMethods
} from './wailsjs/go/main/ScreenshotService';

export type CaptureFix = { text: string; command?: string; url?: string };

export type CaptureStatus = {
	state: 'untested' | 'ready' | 'missing' | 'failed';
	reason?: string;
	fix?: CaptureFix;
	ms?: number;
};

export type CaptureMethod = {
	id: string;
	name: string;
	description: string;
	status: CaptureStatus;
};

type Snapshot = { methods: CaptureMethod[]; selected: string; configured: boolean };

export const capture = $state<{
	methods: CaptureMethod[];
	selected: string;
	configured: boolean;
	tested: boolean;
	testing: boolean;
	error: string;
}>({ methods: [], selected: '', configured: false, tested: false, testing: false, error: '' });

function apply(raw: string) {
	const snap = JSON.parse(raw) as Snapshot;
	capture.methods = snap.methods ?? [];
	capture.selected = snap.selected ?? '';
	capture.configured = !!snap.configured;
	capture.tested = capture.methods.some((m) => m.status.state !== 'untested');
}

export async function loadCapture() {
	try {
		apply(await CaptureMethods());
	} catch (err) {
		console.error('load capture methods failed', err);
		capture.error = String(err);
	}
}

export async function testCapture() {
	if (capture.testing) return;
	capture.testing = true;
	capture.error = '';
	try {
		apply(await TestCaptureMethods());
	} catch (err) {
		console.error('test capture methods failed', err);
		capture.error = String(err);
	} finally {
		capture.testing = false;
	}
}

export async function storeCaptureMethod(id: string) {
	await SetCaptureMethod(id);
	capture.selected = id;
	capture.configured = true;
}
