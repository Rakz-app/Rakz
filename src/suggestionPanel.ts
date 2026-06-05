import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import { PluginSettings } from "./types";
import {
  findSuggestions,
  Suggestion,
  fillPromptTemplate,
} from "./promptEngine";
import { queryOpenRouter } from "./aiProvider";
import { incrementUsageBySid } from "./memoryStore";

export const SUGGESTION_VIEW_TYPE = "memonic-suggestion-view";

export class SuggestionPanel extends ItemView {
  private container: HTMLDivElement;
  private settings: PluginSettings;
  private lastNoteContent: string = "";
  private lastFolderPath: string = "";

  constructor(leaf: WorkspaceLeaf, settings: PluginSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType(): string {
    return SUGGESTION_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Memonic Suggestions";
  }

  getIcon(): string {
    return "lightbulb";
  }

  async onOpen(): Promise<void> {
    this.container = this.contentEl.createDiv("memonic-suggestions");
    this.renderEmpty();
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  updateNoteContext(content: string, folderPath: string): void {
    this.lastNoteContent = content;
    this.lastFolderPath = folderPath;
    this.renderSuggestions(content, folderPath);
  }

  private renderEmpty(): void {
    this.container.empty();
    this.container.createEl("p", {
      text: "Open a note to see memonic suggestions...",
      cls: "suggestion-empty",
    });
  }

  private renderSuggestions(content: string, folderPath: string): void {
    this.container.empty();

    const suggestions = findSuggestions(content, folderPath);

    const header = this.container.createDiv("suggestion-header");
    header.createEl("h3", { text: "Suggestions" });

    if (suggestions.length === 0) {
      this.container.createEl("p", {
        text: "No matching memonics for this note.",
        cls: "suggestion-empty",
      });
      return;
    }

    const list = this.container.createDiv("suggestion-list");

    for (const suggestion of suggestions) {
      this.createSuggestionCard(list, suggestion);
    }
  }

  private createSuggestionCard(
    container: HTMLElement,
    suggestion: Suggestion,
  ): void {
    const { memonic, template, matchType } = suggestion;

    const card = container.createDiv("suggestion-card");

    const topRow = card.createDiv("suggestion-card-top");

    const typeBadge = topRow.createSpan("suggestion-type-badge");
    typeBadge.setText(memonic.type);

    const matchBadge = topRow.createSpan("suggestion-match-badge");
    matchBadge.setText(matchType);

    const title = card.createEl("h4", { text: memonic.title });

    if (memonic.summary) {
      const summary = card.createDiv("suggestion-summary");
      summary.setText(memonic.summary);
    }

    const tagsDiv = card.createDiv("suggestion-tags");
    for (const tag of memonic.tags.slice(0, 3)) {
      const tagEl = tagsDiv.createSpan("suggestion-tag");
      tagEl.setText(tag);
    }

    const btnContainer = card.createDiv("suggestion-actions");

    const runBtn = btnContainer.createEl("button", {
      cls: "suggestion-run-btn",
    });
    runBtn.setText(template.label || "Run");
    runBtn.addEventListener("click", () => this.executeSuggestion(suggestion));

    const viewBtn = btnContainer.createEl("button", {
      cls: "suggestion-view-btn",
    });
    setIcon(viewBtn, "eye");
    viewBtn.addEventListener("click", () => {
      const resolved = fillPromptTemplate(
        template.template,
        memonic,
        this.lastNoteContent,
      );
      new Notice(resolved.substring(0, 100) + "...");
    });
  }

  private async executeSuggestion(suggestion: Suggestion): Promise<void> {
    const { memonic, template } = suggestion;
    const provider = this.settings.aiProvider;

    if (!provider.apiKey) {
      new Notice("Please set your OpenRouter API key in settings first.");
      return;
    }

    const resolvedPrompt = fillPromptTemplate(
      template.template,
      memonic,
      this.lastNoteContent,
    );

    incrementUsageBySid(memonic.sid);

    const loadingNotice = new Notice("Querying AI...", 0);

    try {
      const response = await queryOpenRouter(
        provider,
        memonic.aiConfig?.model || provider.defaultModel,
        memonic.aiConfig?.systemPrompt || provider.defaultSystemPrompt,
        resolvedPrompt,
        [memonic],
        memonic.aiConfig?.temperature,
      );

      loadingNotice.hide();

      this.container
        .querySelectorAll(".suggestion-result")
        .forEach((el) => el.remove());
      const resultContainer = this.container.createDiv("suggestion-result");
      resultContainer.createEl("h4", { text: "AI Response" });
      resultContainer.createEl("p", { text: response });

      new Notice("AI response received!");
    } catch (error) {
      loadingNotice.hide();
      new Notice(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
