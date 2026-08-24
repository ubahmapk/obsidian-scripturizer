import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type Scripturizer from "./main";
import { TRANSLATIONS, type TranslationCode } from "./data/translations";
import { refreshAllBibleIds } from "./bible-api/bibleIdCache";

export interface BibleIdCacheEntry {
	bibleId: string;
	fetchedAt: number;
}

export interface ScripturizerSettings {
	apiKey: string;
	defaultTranslation: TranslationCode;
	bibleIdCache: Record<string, BibleIdCacheEntry>;
}

export const DEFAULT_SETTINGS: ScripturizerSettings = {
	apiKey: "",
	defaultTranslation: "CSB",
	bibleIdCache: {},
};

export class ScripturizerSettingTab extends PluginSettingTab {
	plugin: Scripturizer;

	constructor(app: App, plugin: Scripturizer) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text:
				"Your API.Bible key is stored in plain text in this vault's data.json " +
				"(Obsidian does not encrypt plugin settings). Avoid using this vault's sync/" +
				"backup for the key if that's a concern for you.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("API.Bible key")
			.setDesc("Required to fetch passage text. Get a free key at https://scripture.api.bible.")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("Enter your API.Bible key")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Default translation")
			.setDesc("Used when a reference doesn't specify a translation.")
			.addDropdown((dropdown) => {
				for (const t of TRANSLATIONS) dropdown.addOption(t.code, `${t.code} — ${t.displayName}`);
				dropdown.setValue(this.plugin.settings.defaultTranslation).onChange(async (value) => {
					this.plugin.settings.defaultTranslation = value as TranslationCode;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("Refresh Bible ID cache")
			.setDesc(
				"Clears and re-resolves the API.Bible bibleId cached for each translation. " +
					"Use this if a translation stops resolving correctly.",
			)
			.addButton((button) => {
				button.setButtonText("Refresh").onClick(async () => {
					button.setDisabled(true);
					const results = await refreshAllBibleIds(this.plugin.settings, () => this.plugin.saveSettings());
					button.setDisabled(false);

					const failed = results.filter((r) => !r.ok);
					if (failed.length === 0) {
						new Notice("Scripturizer: Bible ID cache refreshed for all translations");
					} else {
						new Notice(
							`Scripturizer: failed to resolve ${failed.map((f) => f.code).join(", ")} — check your API key`,
						);
					}
				});
			});
	}
}
