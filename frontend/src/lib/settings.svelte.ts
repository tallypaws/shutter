import type { Component } from 'svelte';
import {
	Ban,
	Camera,
	Check,
	CircleCheck,
	CircleX,
	Clipboard,
	ClipboardCheck,
	ClipboardCopy,
	ClipboardPen,
	Copy,
	Download,
	FileDown,
	HardDriveDownload,
	ImageDown,
	Save,
	SaveAll,
	Send,
	Share2,
	Undo2,
	X
} from '@lucide/svelte';
import { toolDefinitions, toolOrder } from '$lib/tools/registry';
import type { SaveMode } from '$lib/save';
import { LoadSettings, SaveSettings } from './wailsjs/go/main/ScreenshotService';

export type SaveActionId = 'save' | 'saveAs' | 'copy' | 'saveCopy' | 'saveCopyAs' | 'cancel';

export type SaveActionSetting = {
	visible: boolean;
	label: string;
	smallBtn: boolean;
	icon: string;
};

export type Settings = {
	version: 1;
	closeAfterSave: boolean;
	tools: Record<string, Record<string, unknown>>;
	saveActions: Record<SaveActionId, SaveActionSetting>;
	saveDir: string;
};

export const saveActionIds: SaveActionId[] = [
	'save',
	'saveAs',
	'copy',
	'saveCopy',
	'saveCopyAs',
	'cancel'
];

export const saveIcons: Record<string, Component> = {
	save: Save,
	saveAll: SaveAll,
	clipboard: Clipboard,
	download: Download,
	fileDown: FileDown,
	imageDown: ImageDown,
	driveDownload: HardDriveDownload,
	check: Check,
	circleCheck: CircleCheck,
	copy: Copy,
	clipboardCheck: ClipboardCheck,
	clipboardCopy: ClipboardCopy,
	clipboardPen: ClipboardPen,
	share: Share2,
	send: Send,
	camera: Camera,
	x: X,
	circleX: CircleX,
	ban: Ban,
	undo: Undo2
};

export const saveIconLabels: Record<string, string> = {
	save: 'Save',
	saveAll: 'Save all',
	clipboard: 'Clipboard',
	download: 'Download',
	fileDown: 'File down',
	imageDown: 'Image down',
	driveDownload: 'Drive download',
	check: 'Check',
	circleCheck: 'Circle check',
	copy: 'Copy',
	clipboardCheck: 'Clipboard check',
	clipboardCopy: 'Clipboard copy',
	clipboardPen: 'Clipboard pen',
	share: 'Share',
	send: 'Send',
	camera: 'Camera',
	x: 'X',
	circleX: 'Circle X',
	ban: 'Ban',
	undo: 'Undo'
};

export const saveActionMeta: Record<
	SaveActionId,
	{
		name: string;
		label: string;
		soloLabel?: string;
		smallBtn: boolean;
		icon: string;
		mode: SaveMode | null;
	}
> = {
	save: {
		name: 'Save',
		label: 'Save',
		icon: 'save',
		smallBtn: false,
		mode: { destination: 'default', copy: false }
	},
	saveAs: {
		name: 'Save as',
		label: 'Save as',
		icon: 'saveAll',
		smallBtn: false,
		mode: { destination: 'ask', copy: false }
	},
	copy: {
		name: 'Copy',
		label: 'Copy',
		icon: 'clipboard',
		smallBtn: false,
		mode: { destination: 'none', copy: true }
	},
	saveCopy: {
		name: 'Save and copy',
		label: 'Save & copy',
		soloLabel: 'Done',
		icon: 'clipboardCheck',
		smallBtn: false,
		mode: { destination: 'default', copy: true }
	},
	saveCopyAs: {
		name: 'Save and copy as',
		label: 'Save & copy as',
		soloLabel: 'Done',
		icon: 'clipboardPen',
		smallBtn: false,
		mode: { destination: 'ask', copy: true }
	},
	cancel: { name: 'Cancel', label: 'Cancel', icon: 'x', mode: null, smallBtn: true }
};

export function defaultSettings(): Settings {
	return {
		version: 1,
		closeAfterSave: false,
		tools: Object.fromEntries(
			toolOrder
				.filter((id) => toolDefinitions[id].defaultOptions)
				.map((id) => [id, { ...toolDefinitions[id].defaultOptions }])
		),
		saveActions: Object.fromEntries(
			saveActionIds.map((id) => [
				id,
				{
					visible: true,
					label: '',
					icon: saveActionMeta[id].icon,
					smallBtn: saveActionMeta[id].smallBtn
				}
			])
		) as Record<SaveActionId, SaveActionSetting>
		,
		saveDir: "~"
	};
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function normalizeSettings(raw: unknown): Settings {
	const out = defaultSettings();
	if (!isRecord(raw)) return out;

	if (typeof raw.closeAfterSave === 'boolean') out.closeAfterSave = raw.closeAfterSave;

	if (isRecord(raw.tools)) {
		for (const [toolId, defaults] of Object.entries(out.tools)) {
			const saved = raw.tools[toolId];
			if (!isRecord(saved)) continue;
			for (const key of Object.keys(defaults)) {
				const value = saved[key];
				if (typeof value !== typeof defaults[key]) continue;
				if (typeof value === 'number' && !Number.isFinite(value)) continue;
				defaults[key] = value;
			}
		}
	}

	if (isRecord(raw.saveActions)) {
		for (const id of saveActionIds) {
			const saved = raw.saveActions[id];
			if (!isRecord(saved)) continue;
			const target = out.saveActions[id];
			if (typeof saved.visible === 'boolean') target.visible = saved.visible;
			if (typeof saved.label === 'string') target.label = saved.label.slice(0, 32);
			if (typeof saved.icon === 'string' && saved.icon in saveIcons) target.icon = saved.icon;
		}
	}

	if (!saveActionIds.some((id) => id !== 'cancel' && out.saveActions[id].visible)) {
		out.saveActions.save.visible = true;
	}

	return out;
}

export const settings = $state<{ data: Settings; loaded: boolean }>({
	data: defaultSettings(),
	loaded: false
});

export async function loadSettings() {
	try {
		const raw = await LoadSettings();
		settings.data = normalizeSettings(raw ? JSON.parse(raw) : null);
	} catch (err) {
		console.error('load settings failed', err);
		settings.data = defaultSettings();
	}
	settings.loaded = true;
}

export async function storeSettings(next: Settings) {
	const normalized = normalizeSettings(next);
	await SaveSettings(JSON.stringify(normalized, null, 2));
	settings.data = normalized;
}

export function buildToolOptions(): Record<string, Record<string, unknown>> {
	return Object.fromEntries(
		toolOrder.map((id) => [
			id,
			{ ...(toolDefinitions[id].defaultOptions ?? {}), ...(settings.data.tools[id] ?? {}) }
		])
	);
}

export function visibleSaveActions(actions: Record<SaveActionId, SaveActionSetting>) {
	return saveActionIds.filter((id) => actions[id].visible);
}

export function actionLabel(
	id: SaveActionId,
	actions: Record<SaveActionId, SaveActionSetting>
): string {
	const custom = actions[id].label.trim();
	if (custom) return custom;
	const meta = saveActionMeta[id];
	const solo = visibleSaveActions(actions).filter((other) => other !== 'cancel').length === 1;
	return solo && meta.soloLabel ? meta.soloLabel : meta.label;
}

export function actionSmall(
	id: SaveActionId,
	actions: Record<SaveActionId, SaveActionSetting>
): boolean {
	return actions[id].smallBtn;
}

export function shortcutSaveAction(ask: boolean): SaveActionId | undefined {
	const visible = saveActionIds.filter(
		(id) => id !== 'cancel' && settings.data.saveActions[id].visible
	);
	const wanted = ask ? 'ask' : 'default';
	return (
		visible.find((id) => saveActionMeta[id].mode?.destination === wanted) ??
		(ask ? undefined : visible[0])
	);
}
