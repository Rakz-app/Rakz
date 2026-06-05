import { Plugin, Notice, TFile, MarkdownView, WorkspaceLeaf } from "obsidian";
import { PluginSettings, DEFAULT_SETTINGS } from "./types";
import {
  initMemonicStore,
  getAllMemonics,
  updateMemonicBySid,
  flushSave,
  generateSid,
} from "./memoryStore";
import {
  MEMONIC_VIEW_TYPE,
  MemonicGlossaryView,
  buildMemonicCallout,
  countMemonicCalloutsInText,
  MemonicSuggestModal,
} from "./memonicView";
import { SUGGESTION_VIEW_TYPE, SuggestionPanel } from "./suggestionPanel";
import { MemonicSettingsTab } from "./settingsTab";
import {
  scanNoteForMemonics,
  writeBackMissingIds,
  ConflictInfo,
  findSmallestFreeNumericId,
  resolveIdDuplicates,
} from "./memonicParser";

export interface ScanReport {
  missing: { sid: number; title: string; sourceFile?: string }[];
  newMemonics: { sid: number; title: string; sourceFile?: string }[];
  moved: { sid: number; from: string; to: string }[];
  conflictsArchived: number;
}

export default class MemonicPlugin extends Plugin {
  settings: PluginSettings;
  private suggestionPanel: SuggestionPanel;
  private debounceTimer: number | null = null;
  private scanDebounceTimer: number | null = null;
  private activeScanDebounceTimer: number | null = null;
  private isScanning = false;

  async onload() {
    await this.loadSettings();

    initMemonicStore(
      this.settings.memonics,
      () => {
        this.saveSettings();
      },
      () => this.settings.nextSid++,
    );

    this.registerView(
      MEMONIC_VIEW_TYPE,
      (leaf) => new MemonicGlossaryView(leaf, this),
    );

    this.registerView(SUGGESTION_VIEW_TYPE, (leaf) => {
      this.suggestionPanel = new SuggestionPanel(leaf, this.settings);
      return this.suggestionPanel;
    });

    this.addCommand({
      id: "open-memonic-glossary",
      name: "Open Memonic Glossary",
      callback: () => this.activateView(MEMONIC_VIEW_TYPE),
    });

    this.addCommand({
      id: "open-suggestion-panel",
      name: "Open Suggestion Panel",
      callback: () => this.activateView(SUGGESTION_VIEW_TYPE),
    });

    this.addCommand({
      id: "scan-vault-for-memonics",
      name: "Scan Vault for Memonic Callouts",
      callback: () => this.scanVaultForMemonics(),
    });

    this.addCommand({
      id: "create-memonic-template",
      name: "Insert Memonic Template",
      editorCallback: (editor) => {
        this.insertMemonicTemplate(editor);
      },
    });

    this.addCommand({
      id: "insert-memonic-reference",
      name: "Insert Memonic Reference",
      callback: () => {
        new MemonicSuggestModal(this.app).open();
      },
    });

    this.addCommand({
      id: "refresh-memonic-glossary",
      name: "Refresh Memonic Glossary",
      callback: () => this.refreshGlossaryView(),
    });

    this.addCommand({
      id: "refresh-vault-memonics",
      name: "Refresh & Reconcile Vault Memonics",
      callback: () => this.refreshVault(),
    });

    this.addRibbonIcon("book-open", "Memonic Glossary", () => {
      this.activateView(MEMONIC_VIEW_TYPE);
    });

    this.addRibbonIcon("lightbulb", "Memonic Suggestions", () => {
      this.activateView(SUGGESTION_VIEW_TYPE);
    });

    this.addSettingTab(
      new MemonicSettingsTab(this.app, this, this.settings, (newSettings) => {
        this.settings = newSettings;
        this.saveSettings();
        if (this.suggestionPanel) {
          this.suggestionPanel.updateSettings(this.settings);
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.debouncedScanFile(file);
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.debouncedUpdateContext();
        this.debouncedScanActiveFile();
      }),
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, info) => {
        this.debouncedUpdateContext();
        if (info.file instanceof TFile) {
          this.debouncedScanFile(info.file);
        }
      }),
    );

    this.app.workspace.onLayoutReady(async () => {
      this.initViews();
      await this.scanVaultForMemonics();
    });

    new Notice("AI Memonics plugin loaded!");
  }

  onunload() {
    flushSave();
    this.app.workspace.detachLeavesOfType(MEMONIC_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(SUGGESTION_VIEW_TYPE);
  }

  async loadSettings() {
    const loaded = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    // Deep-merge nested objects so newly added default sub-fields survive when
    // older saved data only has a partial aiProvider object.
    this.settings.aiProvider = Object.assign(
      {},
      DEFAULT_SETTINGS.aiProvider,
      loaded.aiProvider || {},
    );
  }

  async saveSettings() {
    this.settings.memonics = getAllMemonics();
    await this.saveData(this.settings);
  }

  async activateView(viewType: string) {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | undefined = workspace.getLeavesOfType(viewType).first() ?? undefined;

    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? undefined;
      if (leaf) {
        await leaf.setViewState({ type: viewType, active: true });
      }
    }

    if (leaf) {
      (workspace as any).setActiveLeaf(leaf, { focus: true });
      workspace.revealLeaf(leaf);
    }
  }

  private refreshGlossaryView(): void {
    const leaf = this.app.workspace.getLeavesOfType(MEMONIC_VIEW_TYPE).first();
    if (leaf && leaf.view instanceof MemonicGlossaryView) {
      leaf.view.render();
      new Notice("Glossary refreshed");
    }
  }

  async refreshVault(): Promise<void> {
    new Notice("Reconciling vault…", 4000);
    const report = await this.scanVaultForMemonics({ report: true });
    this.renderGlossary();
    if (!report) {
      new Notice("Scan already in progress");
      return;
    }
    const lines: string[] = [];
    if (report.missing.length)
      lines.push(
        `Moved to trash (recoverable): ${report.missing.length}`,
      );
    if (report.newMemonics.length)
      lines.push(`New: ${report.newMemonics.length}`);
    if (report.moved.length)
      lines.push(`Moved: ${report.moved.length}`);
    if (report.conflictsArchived)
      lines.push(`Conflicts archived: ${report.conflictsArchived}`);
    new Notice(lines.length ? lines.join("\n") : "No changes", 6000);
  }

  private renderGlossary(): void {
    const leaf = this.app.workspace.getLeavesOfType(MEMONIC_VIEW_TYPE).first();
    if (leaf?.view instanceof MemonicGlossaryView) {
      leaf.view.render();
    }
  }

  initViews() {
    if (!this.app.workspace.getLeavesOfType(MEMONIC_VIEW_TYPE).length) {
      this.app.workspace.getRightLeaf(false)?.setViewState({
        type: MEMONIC_VIEW_TYPE,
        active: false,
      });
    }
  }

  private insertMemonicTemplate(editor: any): void {
    const cursor = editor.getCursor();

    // Visible id is the running count of memonics already in this note (unless
    // auto-id is disabled). Identity is fixed by the hidden sid minted now, so
    // the scan never has to assign one — the root cause of the old duplicates.
    const priorCount = countMemonicCalloutsInText(editor.getValue());
    const visibleId = this.settings.autoId ? `${priorCount + 1}` : "";
    const sid = generateSid();

    const template = buildMemonicCallout({
      type: "shortcut",
      title: "Title Here",
      id: visibleId,
      sid,
      strength: 3,
      tags: ["tag1", "tag2"],
      triggers: ["keyword1", "keyword2"],
      contextLines: ["Your context/knowledge goes here..."],
    });

    editor.replaceSelection(template);
    editor.setCursor({ line: cursor.line, ch: 27 });
  }

  private handleScanConflict: (conflict: ConflictInfo) => void = (conflict) => {
    new Notice(
      `⚠ Duplicate ID ${conflict.requestedId}: archived the older "${conflict.title}". The newest copy${conflict.existingOwner ? ` in ${conflict.existingOwner}` : ""} stays active.`,
      6000,
    );
  };

  private async scanVaultForMemonics(opts?: { report?: boolean }): Promise<ScanReport | void> {
    if (this.isScanning) return opts?.report ? undefined : undefined;
    this.isScanning = true;

    const before =
      opts?.report
        ? new Map(
            getAllMemonics().map((m) => [m.sid, { ...m }]),
          )
        : undefined;

    try {
      const files = this.app.vault.getMarkdownFiles();
      let count = 0;
      const seenSids = new Set<number>();

      for (const file of files) {
        try {
          const content = await this.app.vault.read(file);
          scanNoteForMemonics(
            content,
            file.path,
            () => this.settings.nextBid++,
            seenSids,
          );
          const writeBack = writeBackMissingIds(content, file.path);
          if (writeBack.changed) {
            await this.app.vault.modify(file, writeBack.content);
          }
          count++;
          if (count % 50 === 0) {
            await new Promise((r) => setTimeout(r, 0));
          }
        } catch (e) {
          console.error(`Error scanning ${file.path}:`, e);
        }
      }

      if (opts?.report) {
        for (const m of getAllMemonics()) {
          if (m.status === "active" && !seenSids.has(m.sid)) {
            updateMemonicBySid(m.sid, { status: "deleted" });
          }
        }

        const conflicts: ConflictInfo[] = [];
        resolveIdDuplicates((c) => conflicts.push(c));
        const conflictsArchived = conflicts.length;

        this.saveSettings();

        const after = getAllMemonics();
        const afterMap = new Map(after.map((m) => [m.sid, m]));

        const missing = [...(before?.values() || [])].filter(
          (m) =>
            m.status === "active" && afterMap.get(m.sid)?.status === "deleted",
        );

        const newMemonics = after.filter(
          (m) => m.status === "active" && !before?.has(m.sid),
        );

        const moved: ScanReport["moved"] = [];
        for (const m of after) {
          if (m.status !== "active") continue;
          const old = before?.get(m.sid);
          if (old && old.sourceFile !== m.sourceFile) {
            moved.push({
              sid: m.sid,
              from: old.sourceFile || "",
              to: m.sourceFile || "",
            });
          }
        }

        return { missing, newMemonics, moved, conflictsArchived };
      }

      this.saveSettings();
      new Notice(`Scanned ${count} notes for memonic callouts`);
    } finally {
      this.isScanning = false;
    }
  }

  private debouncedScanFile(file: TFile): void {
    if (this.scanDebounceTimer) {
      window.clearTimeout(this.scanDebounceTimer);
    }
    this.scanDebounceTimer = window.setTimeout(async () => {
      if (this.isScanning) return;
      this.isScanning = true;
      try {
        const content = await this.app.vault.read(file);
        scanNoteForMemonics(content, file.path, () => this.settings.nextBid++);
        this.saveSettings();
      } catch (e) {
        console.error(`Error re-scanning ${file.path}:`, e);
      } finally {
        this.isScanning = false;
      }
    }, 1000);
  }

  private debouncedUpdateContext() {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.updateContext();
    }, 500);
  }

  private async updateContext() {
    if (!this.suggestionPanel) return;

    const file = this.app.workspace.getActiveFile();
    if (!file) {
      this.suggestionPanel.updateNoteContext("", "");
      return;
    }

    const content = await this.app.vault.read(file);
    const folderPath = file.parent ? "/" + file.parent.path : "/";

    this.suggestionPanel.updateNoteContext(content, folderPath);
  }

  private debouncedScanActiveFile(): void {
    if (this.activeScanDebounceTimer) {
      window.clearTimeout(this.activeScanDebounceTimer);
    }
    this.activeScanDebounceTimer = window.setTimeout(() => {
      this.scanActiveFile();
    }, 800);
  }

  private async scanActiveFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") return;
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const content = await this.app.vault.read(file);
      scanNoteForMemonics(content, file.path, () => this.settings.nextBid++);
      this.saveSettings();
    } catch (e) {
      console.error(`Error scanning active file:`, e);
    } finally {
      this.isScanning = false;
    }
  }
}
