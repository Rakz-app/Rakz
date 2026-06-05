import { App, Plugin, PluginSettingTab, Setting, Notice, WorkspaceLeaf } from "obsidian";
import {
  PluginSettings,
  DEFAULT_SETTINGS,
  PromptTemplate,
  RestoreMode,
} from "./types";
import { listAvailableModels } from "./aiProvider";
import {
  getAllMemonics,
  setAllMemonics,
  updateMemonicBySid,
  deleteMemonicBySid,
} from "./memoryStore";
import {
  MEMONIC_VIEW_TYPE,
  MemonicGlossaryView,
  restoreMemonicToFile,
} from "./memonicView";

function refreshGlossaryViews(app: App): void {
  for (const leaf of app.workspace.getLeavesOfType(MEMONIC_VIEW_TYPE)) {
    if (leaf.view instanceof MemonicGlossaryView) {
      leaf.view.render();
    }
  }
}

export class MemonicSettingsTab extends PluginSettingTab {
  private settings: PluginSettings;
  private plugin: Plugin;
  private onSettingsChange: (settings: PluginSettings) => void;

  constructor(
    app: App,
    plugin: Plugin,
    settings: PluginSettings,
    onSettingsChange: (settings: PluginSettings) => void,
  ) {
    super(app, plugin);
    this.plugin = plugin;
    this.settings = settings;
    this.onSettingsChange = onSettingsChange;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "MnemoTree Settings" });

    containerEl.createEl("h3", { text: "OpenRouter Configuration" });

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Your OpenRouter API key")
      .addText((cb) =>
        cb
          .setPlaceholder("sk-or-v1-...")
          .setValue(this.settings.aiProvider.apiKey)
          .onChange(async (value) => {
            this.settings.aiProvider.apiKey = value;
            this.onSettingsChange(this.settings);
          }),
      );

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("OpenRouter API endpoint")
      .addText((cb) =>
        cb.setValue(this.settings.aiProvider.baseUrl).onChange((value) => {
          this.settings.aiProvider.baseUrl = value;
          this.onSettingsChange(this.settings);
        }),
      );

    new Setting(containerEl)
      .setName("Default Model")
      .setDesc(
        "Choose or type any model (e.g., openai/gpt-4o, anthropic/claude-3-opus, google/gemini-2.0-flash-001, or any OpenRouter model)",
      )
      .addDropdown((cb) => {
        for (const model of this.settings.aiProvider.models) {
          cb.addOption(model, model.split("/").pop() || model);
        }
        cb.setValue(this.settings.aiProvider.defaultModel);
        cb.onChange((value) => {
          this.settings.aiProvider.defaultModel = value;
          this.onSettingsChange(this.settings);
        });
      })
      .addText((cb) =>
        cb
          .setPlaceholder("Or type any model...")
          .setValue("")
          .onChange((value) => {
            if (value.trim()) {
              this.settings.aiProvider.defaultModel = value.trim();
              this.onSettingsChange(this.settings);
            }
          }),
      );

    new Setting(containerEl)
      .setName("Default System Prompt")
      .setDesc("System prompt sent with every AI request")
      .addTextArea((cb) =>
        cb
          .setValue(this.settings.aiProvider.defaultSystemPrompt)
          .onChange((value) => {
            this.settings.aiProvider.defaultSystemPrompt = value;
            this.onSettingsChange(this.settings);
          }),
      );

    new Setting(containerEl).addButton((cb) =>
      cb.setButtonText("Refresh Models").onClick(async () => {
        try {
          const models = await listAvailableModels(this.settings.aiProvider);
          if (models.length > 0) {
            this.settings.aiProvider.models = models;
            this.onSettingsChange(this.settings);
            this.display();
          }
        } catch (e) {
          console.error("Failed to refresh models:", e);
        }
      }),
    );

    containerEl.createEl("h3", { text: "Restore Settings" });

    new Setting(containerEl)
      .setName("Restore Mode")
      .setDesc(
        "How to restore deleted memonics: 'Callout' writes the memonic back to the original file; 'Code Block' wraps it in a code block in the parent folder's EM file for safe copy/paste without ID conflicts.",
      )
      .addDropdown((cb) =>
        cb
          .addOption("callout", "Default (Callout)")
          .addOption("codeblock", "Code Block")
          .setValue(this.settings.restoreMode)
          .onChange((value: RestoreMode) => {
            this.settings.restoreMode = value;
            this.onSettingsChange(this.settings);
          }),
      );

    new Setting(containerEl)
      .setName("Copy = Move")
      .setDesc(
        "When enabled, copying a callout removes it from the source file (cut instead of copy). Shows an Undo button in case you change your mind.",
      )
      .addToggle((cb) =>
        cb.setValue(this.settings.copyIsMove).onChange((value) => {
          this.settings.copyIsMove = value;
          this.onSettingsChange(this.settings);
        }),
      );

    new Setting(containerEl)
      .setName("Debris Cleanup")
      .setDesc(
        "When enabled, deleting a memonic always removes it from the store even if the callout block can't be found in the source file (useful for cleaning up orphans after file edits or errors).",
      )
      .addToggle((cb) =>
        cb.setValue(this.settings.debrisCleanup).onChange((value) => {
          this.settings.debrisCleanup = value;
          this.onSettingsChange(this.settings);
        }),
      );

    new Setting(containerEl)
      .setName("Auto-number id")
      .setDesc(
        "When enabled, new memonics get a visible numeric id automatically (the running count within the note). Disable to create them with an empty id you fill in yourself. The hidden system id (sid) is always assigned either way.",
      )
      .addToggle((cb) =>
        cb.setValue(this.settings.autoId).onChange((value) => {
          this.settings.autoId = value;
          this.onSettingsChange(this.settings);
        }),
      );

    containerEl.createEl("h3", { text: "Memonic Stats" });

    const memonics = getAllMemonics();
    const active = memonics.filter((m) => m.status === "active");
    const archived = memonics.filter((m) => m.status === "archived");
    const deleted = memonics.filter((m) => m.status === "deleted");

    new Setting(containerEl)
      .setName("Status")
      .setDesc(
        `${active.length} active, ${archived.length} archived, ${deleted.length} deleted`,
      );

    new Setting(containerEl)
      .setName("Open Glossary")
      .setDesc("View and manage all memonics")
      .addButton((cb) =>
        cb
          .setButtonText("Open")
          .setCta()
          .onClick(() => {
            this.openGlossaryView();
          }),
      );

    if (deleted.length > 0) {
      containerEl.createEl("h3", { text: "Deleted Memonics (Trash)" });

      for (const m of deleted) {
        const setting = new Setting(containerEl)
          .setName(m.title)
          .setDesc(`ID: ${m.id} | ${m.folderPath}`);

        setting.addButton((cb) =>
          cb.setButtonText("Restore").onClick(async () => {
            updateMemonicBySid(m.sid, { status: "active", reference: true });
            if (m.sourceFile) {
              await restoreMemonicToFile(
                this.app,
                m,
                this.settings.restoreMode,
              );
            }
            refreshGlossaryViews(this.app);
            this.display();
          }),
        );

        setting.addButton((cb) =>
          cb
            .setButtonText("Delete Forever")
            .setWarning()
            .onClick(() => {
              deleteMemonicBySid(m.sid);
              refreshGlossaryViews(this.app);
              this.display();
            }),
        );
      }

      new Setting(containerEl).addButton((cb) =>
        cb
          .setButtonText("Empty Trash")
          .setWarning()
          .onClick(() => {
            for (const m of deleted) {
              deleteMemonicBySid(m.sid);
            }
            refreshGlossaryViews(this.app);
            this.display();
          }),
      );
    }

    new Setting(containerEl)
      .setName("Reset All Data")
      .setDesc("This will delete all your memonics and settings")
      .addButton((cb) =>
        cb
          .setButtonText("Reset")
          .setWarning()
          .onClick(() => {
            this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            setAllMemonics(this.settings.memonics);
            this.onSettingsChange(this.settings);
            refreshGlossaryViews(this.app);
            this.display();
          }),
      );
  }

  private async openGlossaryView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | undefined = workspace.getLeavesOfType(MEMONIC_VIEW_TYPE).first() ?? undefined;

    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? undefined;
      if (leaf) {
        await leaf.setViewState({
          type: MEMONIC_VIEW_TYPE,
          active: true,
        });
      }
    }

    if (leaf) {
      (workspace as any).setActiveLeaf(leaf, { focus: true });
      workspace.revealLeaf(leaf);
    }
  }
}
