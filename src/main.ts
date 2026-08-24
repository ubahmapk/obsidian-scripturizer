import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, ScripturizerSettingTab } from "./settings";
import type { ScripturizerSettings } from "./settings";
import { linkReferencesOnlyCommand } from "./commands/linkReferencesOnly";
import { scripturizeWithTextCommand } from "./commands/scripturizeWithText";

export default class Scripturizer extends Plugin {
	settings!: ScripturizerSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new ScripturizerSettingTab(this.app, this));

		this.addCommand({
			id: "scripturizer-link-references-only",
			name: "Link references only (current line)",
			editorCallback: (editor) => {
				void linkReferencesOnlyCommand(editor, this.settings);
			},
		});

		this.addCommand({
			id: "scripturizer-scripturize-note-with-text",
			name: "Scripturize note (with text)",
			editorCallback: (editor) => {
				void scripturizeWithTextCommand(editor, this.settings, () => this.saveSettings());
			},
		});
	}

	onunload() {}

	async loadSettings() {
		const stored = (await this.loadData()) as Partial<ScripturizerSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
