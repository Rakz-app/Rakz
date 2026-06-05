import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  Notice,
  TFile,
  MarkdownView,
  App,
  Modal,
  Setting,
  TFolder,
  Plugin,
  FuzzySuggestModal,
} from "obsidian";
import {
  Memonic,
  MemonicType,
  MemonicStrength,
  PluginSettings,
  RestoreMode,
} from "./types";
import {
  getAllMemonics,
  generateSid,
  searchMemonics,
  getFoldersList,
  getMemonicTypesList,
  deleteMemonicBySid,
  updateMemonicBySid,
  createMemonic,
  addMemonic,
} from "./memoryStore";
import { queryOpenRouter } from "./aiProvider";
import { findSmallestFreeNumericId } from "./memonicParser";
import type MemonicPlugin from "./main";

export const MEMONIC_VIEW_TYPE = "memonic-glossary-view";

type SortField = "none" | "title" | "type" | "strength" | "id" | "created";
type SortOrder = "asc" | "desc";
type GroupBy = "none" | "folder" | "type" | "letter" | "id";

export class MemonicGlossaryView extends ItemView {
  private plugin: MemonicPlugin;
  private container: HTMLDivElement;
  private filterFolder: string = "";
  private filterType: string = "";
  private searchQuery: string = "";
  private showDeleted: boolean = false;
  private showArchived: boolean = false;
  private showAdvanced: boolean = false;
  private sortBy: SortField = "title";
  private sortOrder: SortOrder = "asc";
  private groupBy: GroupBy = "none";

  constructor(leaf: WorkspaceLeaf, plugin: MemonicPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return MEMONIC_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Memonic Glossary";
  }

  getIcon(): string {
    return "book-open";
  }

  async onOpen(): Promise<void> {
    this.container = this.contentEl.createDiv("memonic-glossary");
    this.render();

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view === this) {
          this.render();
        }
      }),
    );
  }

  render(): void {
    this.container.empty();
    this.createHeader();
    this.createFilters();
    this.createStatsBar();
    this.createMemonicList();
    this.createAddButton();
  }

  private createHeader(): void {
    const header = this.container.createDiv("memonic-header");
    header.createEl("h2", { text: "Memonic Glossary" });

    const refreshBtn = header.createEl("button", {
      cls: "memonic-refresh-btn",
    });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.title = "Refresh";
    refreshBtn.addEventListener("click", () => this.render());

    const reconcileBtn = header.createEl("button", {
      cls: "memonic-refresh-btn",
    });
    setIcon(reconcileBtn, "refresh-ccw-dot");
    reconcileBtn.title = "Reconcile vault";
    reconcileBtn.addEventListener("click", async () => {
      await this.plugin.refreshVault();
    });
  }

  private createFilters(): void {
    const filters = this.container.createDiv("memonic-filters");

    const searchInput = filters.createEl("input", {
      type: "text",
      placeholder: "Search memonics...",
    });
    searchInput.value = this.searchQuery;
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.render();
    });

    const row1 = filters.createDiv("memonic-filter-row");

    const folderSelect = row1.createEl("select");
    folderSelect.createEl("option", { text: "All Folders", value: "" });
    for (const folder of getFoldersList()) {
      const opt = folderSelect.createEl("option", {
        text: folder,
        value: folder,
      });
      if (folder === this.filterFolder) opt.selected = true;
    }
    folderSelect.addEventListener("change", () => {
      this.filterFolder = folderSelect.value;
      this.render();
    });

    const typeSelect = row1.createEl("select");
    typeSelect.createEl("option", { text: "All Types", value: "" });
    for (const type of getMemonicTypesList()) {
      const opt = typeSelect.createEl("option", { text: type, value: type });
      if (type === this.filterType) opt.selected = true;
    }
    typeSelect.addEventListener("change", () => {
      this.filterType = typeSelect.value;
      this.render();
    });

    const advBtn = row1.createEl("button", { cls: "memonic-advanced-btn" });
    setIcon(advBtn, this.showAdvanced ? "chevron-up" : "chevron-down");
    advBtn.title = "Advanced";
    advBtn.addEventListener("click", () => {
      this.showAdvanced = !this.showAdvanced;
      this.render();
    });

    if (this.showAdvanced) {
      const row2 = filters.createDiv("memonic-filter-row");

      const sortSelect = row2.createEl("select");
      const sortOptions: { value: SortField; label: string }[] = [
        { value: "none", label: "No Sort" },
        { value: "title", label: "Sort: Title" },
        { value: "type", label: "Sort: Type" },
        { value: "strength", label: "Sort: Strength" },
        { value: "id", label: "Sort: ID" },
        { value: "created", label: "Sort: Created" },
      ];
      for (const opt of sortOptions) {
        const el = sortSelect.createEl("option", {
          text: opt.label,
          value: opt.value,
        });
        if (opt.value === this.sortBy) el.selected = true;
      }
      sortSelect.addEventListener("change", () => {
        this.sortBy = sortSelect.value as SortField;
        this.render();
      });

      const orderBtn = row2.createEl("button", { cls: "memonic-order-btn" });
      setIcon(orderBtn, this.sortOrder === "asc" ? "arrow-up" : "arrow-down");
      orderBtn.title = this.sortOrder === "asc" ? "Ascending" : "Descending";
      orderBtn.addEventListener("click", () => {
        this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
        this.render();
      });

      const groupSelect = row2.createEl("select");
      const groupOptions: { value: GroupBy; label: string }[] = [
        { value: "none", label: "No Group" },
        { value: "folder", label: "Group: Folder Tree" },
        { value: "type", label: "Group: Type" },
        { value: "id", label: "Group: ID Range" },
        { value: "letter", label: "Group: 1st Letter" },
      ];
      for (const opt of groupOptions) {
        const el = groupSelect.createEl("option", {
          text: opt.label,
          value: opt.value,
        });
        if (opt.value === this.groupBy) el.selected = true;
      }
      groupSelect.addEventListener("change", () => {
        this.groupBy = groupSelect.value as GroupBy;
        this.render();
      });

      const toggleLabel = row2.createDiv("memonic-toggle-deleted");
      const toggleCb = toggleLabel.createEl("input", { type: "checkbox" });
      toggleCb.checked = this.showDeleted;
      toggleCb.addEventListener("change", () => {
        this.showDeleted = toggleCb.checked;
        this.render();
      });
      toggleLabel.appendText(" Del");
    }
  }

  private createStatsBar(): void {
    const all = getAllMemonics();
    const active = all.filter((m) => m.status === "active");
    const archived = all.filter((m) => m.status === "archived");
    const deleted = all.filter((m) => m.status === "deleted");
    const stats = this.container.createDiv("memonic-stats");
    stats.appendText(
      `${active.length} active · ${archived.length} archived · `,
    );
    const trashBtn = stats.createEl("button", {
      cls: "memonic-trash-toggle",
    });
    trashBtn.setText(
      `${this.showDeleted ? "Hide" : "Show"} trash (${deleted.length})`,
    );
    trashBtn.title = "Show or hide deleted memonics so you can restore them";
    trashBtn.addEventListener("click", () => {
      this.showDeleted = !this.showDeleted;
      this.render();
    });

    const archiveBtn = stats.createEl("button", {
      cls: "memonic-archive-toggle",
    });
    archiveBtn.setText(
      `${this.showArchived ? "Hide" : "Show"} archived (${archived.length})`,
    );
    archiveBtn.title = "Show or hide archived memonics";
    archiveBtn.addEventListener("click", () => {
      this.showArchived = !this.showArchived;
      this.render();
    });
  }

  private numericCompare(a: string, b: string): number {
    const aNum = parseInt(a.replace(/^mem[-_]/, ""), 10);
    const bNum = parseInt(b.replace(/^mem[-_]/, ""), 10);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  }

  private sortMemonics(memonics: Memonic[]): Memonic[] {
    if (this.sortBy === "none") return memonics;

    const sorted = [...memonics];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (this.sortBy) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        case "strength":
          cmp = a.strength - b.strength;
          break;
        case "id":
          cmp = this.numericCompare(a.id, b.id);
          break;
        case "created":
          cmp = a.createdAt - b.createdAt;
          break;
      }
      return this.sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }

  private createMemonicList(): void {
    const list = this.container.createDiv("memonic-list");

    let memonics = this.searchQuery
      ? searchMemonics(this.searchQuery)
      : getAllMemonics();

    if (!this.showDeleted) {
      memonics = memonics.filter((m) => m.status !== "deleted");
    }

    if (!this.showArchived) {
      memonics = memonics.filter((m) => m.status !== "archived");
    }

    if (this.filterFolder) {
      memonics = memonics.filter((m) => m.folderPath === this.filterFolder);
    }
    if (this.filterType) {
      memonics = memonics.filter((m) => m.type === this.filterType);
    }

    memonics = this.sortMemonics(memonics);

    if (memonics.length === 0) {
      list.createEl("p", {
        text: "No memonics found.",
        cls: "memonic-empty",
      });
      return;
    }

    if (this.groupBy === "none") {
      for (const memonic of memonics) {
        this.createMemonicCard(list, memonic);
      }
      return;
    }

    if (this.groupBy === "folder") {
      this.renderFolderGroup(list, memonics);
      return;
    }

    if (this.groupBy === "id") {
      this.renderIdGroup(list, memonics);
      return;
    }

    const groups = new Map<string, Memonic[]>();
    for (const m of memonics) {
      let key = "";
      switch (this.groupBy) {
        case "type":
          key = m.type;
          break;
        case "letter":
          key = m.title.charAt(0).toUpperCase() || "#";
          break;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }

    const sortedKeys =
      this.groupBy === "type"
        ? Array.from(groups.keys()).sort((a, b) => {
            const order = [
              "shortcut",
              "fact",
              "rule",
              "example",
              "question",
              "tip",
              "story",
              "song",
              "custom",
            ];
            return order.indexOf(a) - order.indexOf(b);
          })
        : Array.from(groups.keys()).sort();

    for (const key of sortedKeys) {
      const items = groups.get(key)!;
      this.createGroupHeader(list, key, items.length);
      for (const m of items) this.createMemonicCard(list, m);
    }
  }

  private renderFolderGroup(container: HTMLElement, memonics: Memonic[]): void {
    const topLevel = new Map<
      string,
      { full: string; subs: Map<string, Memonic[]> }
    >();

    for (const m of memonics) {
      const parts = (m.folderPath || "/").split("/").filter(Boolean);
      const top = parts[0] || "(root)";
      if (!topLevel.has(top)) {
        topLevel.set(top, {
          full: parts.length > 0 ? "/" + parts.slice(0, 1).join("/") : "/",
          subs: new Map(),
        });
      }

      const entry = topLevel.get(top)!;

      if (parts.length <= 1) {
        if (!entry.subs.has("")) entry.subs.set("", []);
        entry.subs.get("")!.push(m);
      } else {
        const subKey = parts.slice(1).join("/");
        if (!entry.subs.has(subKey)) entry.subs.set(subKey, []);
        entry.subs.get(subKey)!.push(m);
      }
    }

    const sortedTops = Array.from(topLevel.keys()).sort();

    for (const top of sortedTops) {
      const entry = topLevel.get(top)!;
      let totalInTop = 0;
      for (const items of entry.subs.values()) totalInTop += items.length;

      const topHeader = container.createDiv("memonic-group-header");
      topHeader.setText(`${top} (${totalInTop})`);

      const subKeys = Array.from(entry.subs.keys()).sort((a, b) => {
        if (a === "") return -1;
        if (b === "") return 1;
        return a.localeCompare(b);
      });

      for (const subKey of subKeys) {
        const items = entry.subs.get(subKey)!;
        if (subKey) {
          const subHeader = container.createDiv("memonic-group-subheader");
          subHeader.setText(`  ${subKey} (${items.length})`);
        }
        for (const m of items) this.createMemonicCard(container, m);
      }
    }
  }

  private renderIdGroup(container: HTMLElement, memonics: Memonic[]): void {
    interface IdTreeNode {
      label: string;
      items: Memonic[];
      children: Map<string, IdTreeNode>;
    }

    const root: IdTreeNode = {
      label: "(root)",
      items: [],
      children: new Map(),
    };

    for (const m of memonics) {
      const segments = m.id.split("-").filter((s) => s && s !== "mem");
      if (segments.length === 0) {
        root.items.push(m);
        continue;
      }
      const leafLabel = segments[segments.length - 1];
      const groupSegments = segments.slice(0, -1);

      let node = root;
      for (const seg of groupSegments) {
        if (!node.children.has(seg)) {
          node.children.set(seg, {
            label: seg,
            items: [],
            children: new Map(),
          });
        }
        node = node.children.get(seg)!;
      }
      node.items.push(m);
    }

    const sortedKeys = (map: Map<string, IdTreeNode>): string[] =>
      Array.from(map.keys()).sort((a, b) => a.localeCompare(b));

    const renderNode = (
      node: IdTreeNode,
      level: number,
      parentEl: HTMLElement,
    ): void => {
      if (node.children.size === 0 && node.items.length === 0) return;

      const total = node.items.length + sumChildItems(node);

      if (level > 0) {
        const header = parentEl.createDiv("memonic-group-header");
        header.style.marginLeft = `${(level - 1) * 16}px`;
        header.setText(`${node.label} (${total})`);
      }

      if (node.items.length > 0) {
        for (const m of node.items) {
          this.createMemonicCard(parentEl, m);
        }
      }

      for (const key of sortedKeys(node.children)) {
        renderNode(node.children.get(key)!, level + 1, parentEl);
      }
    };

    renderNode(root, 0, container);

    function sumChildItems(node: IdTreeNode): number {
      let sum = 0;
      for (const child of node.children.values()) {
        sum += child.items.length + sumChildItems(child);
      }
      return sum;
    }
  }

  private createGroupHeader(
    container: HTMLElement,
    label: string,
    count: number,
  ): void {
    const header = container.createDiv("memonic-group-header");
    header.setText(`${label} (${count})`);
  }

  private createMemonicCard(container: HTMLElement, memonic: Memonic): void {
    const card = container.createDiv(
      `memonic-card${memonic.status === "deleted" ? " memonic-card-deleted" : memonic.status === "archived" ? " memonic-card-archived" : ""}`,
    );

    const topRow = card.createDiv("memonic-card-top");

    const typeBadge = topRow.createSpan("memonic-type-badge");
    typeBadge.setText(memonic.type);

    const strengthEl = topRow.createSpan("memonic-strength");
    strengthEl.setText(
      "★".repeat(memonic.strength) + "☆".repeat(5 - memonic.strength),
    );

    if (memonic.status === "deleted") {
      const deletedBadge = topRow.createSpan("memonic-deleted-badge");
      deletedBadge.setText("DELETED");
    }

    if (memonic.status === "archived") {
      const archivedBadge = topRow.createSpan("memonic-archived-badge");
      archivedBadge.setText("ARCHIVED");
    }

    const actionRow = topRow.createDiv("memonic-action-row");

    if (memonic.sourceFile) {
      const navBtn = actionRow.createEl("button", { cls: "memonic-nav-btn" });
      setIcon(navBtn, "arrow-up-right");
      navBtn.title = "Open source";
      navBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.navigateToMemonic(memonic);
      });
    }

    const copyBtn = actionRow.createEl("button", { cls: "memonic-action-btn" });
    setIcon(copyBtn, "clipboard");
    copyBtn.title = this.plugin.settings.copyIsMove
      ? "Move Callout"
      : "Copy Callout";
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const callout = this.formatCalloutText(memonic);
      await navigator.clipboard.writeText(callout);

      if (
        this.plugin.settings.copyIsMove &&
        memonic.sourceFile &&
        memonic.status === "active"
      ) {
        const srcFile = memonic.sourceFile;
        const srcFolder = memonic.folderPath;

        if (this.plugin.settings.debrisCleanup) {
          try {
            await this.removeCalloutFromFile(memonic);
          } catch {}
        } else {
          await this.removeCalloutFromFile(memonic);
        }
        updateMemonicBySid(memonic.sid, { status: "deleted" });

        const notice = new Notice("", 0);
        const container = (notice as any).noticeEl as HTMLElement;
        container.setText(`Moved "${memonic.title}" — paste then scan, or `);

        const undoBtn = container.createEl("button", {
          text: "Undo",
          cls: "mod-cta",
        });
        undoBtn.addEventListener("click", async () => {
          const file = this.app.vault.getAbstractFileByPath(srcFile);
          if (file instanceof TFile) {
            await this.app.vault.append(file, `\n\n${callout}\n`);
          }
          updateMemonicBySid(memonic.sid, {
            status: "active",
            folderPath: srcFolder,
            sourceFile: srcFile,
          });
          notice.hide();
          this.render();
        });
      } else {
        new Notice("Callout copied to clipboard");
      }
    });

    if (memonic.status === "active" && memonic.sourceFile) {
      const moveBtn = actionRow.createEl("button", { cls: "memonic-action-btn" });
      setIcon(moveBtn, "folder-input");
      moveBtn.title = "Move memonic to another file";
      moveBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const modal = new RestoreLocationModal(this.app, memonic, this.plugin, "move", this);
        modal.open();
      });
    }

    if (memonic.status === "active") {
      const suggestBtn = actionRow.createEl("button", {
        cls: "memonic-action-btn",
      });
      suggestBtn.style.fontWeight = "bold";
      suggestBtn.style.fontSize = "10px";
      suggestBtn.textContent = "AI";
      suggestBtn.title =
        "AI Suggest — ask AI to suggest content for this memonic";
      suggestBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const provider = this.plugin.settings.aiProvider;
        if (!provider.apiKey) {
          new Notice("Please set your OpenRouter API key in settings first.");
          return;
        }

        const loading = new Notice("AI is thinking...", 0);
        try {
          const response = await queryOpenRouter(
            provider,
            memonic.aiConfig?.model || provider.defaultModel,
            'You improve existing memonics \u2014 structured knowledge snippets. A memonic follows this format:\n\n> [!memonic|TYPE] Title\n> id: ID\n> <!-- sid: N -->\n> Summary: One-line summary\n> strength: 1-5\n> tags: tag1, tag2\n> triggers: keyword1, keyword2\n> ---\n> Context / explanation text\n\nSuggest improvements. Return ONLY JSON (no markdown, no backticks):\n{\n  "title": "improved title",\n  "summary": "improved summary",\n  "tags": ["tag1", "tag2"],\n  "triggers": ["keyword1", "keyword2"]\n}',
            `Current memonic:\nType: ${memonic.type}\nTitle: ${memonic.title}\nContext: ${memonic.context}\n${memonic.summary ? `Summary: ${memonic.summary}\n` : ""}Tags: ${(memonic.tags || []).join(", ")}\nTriggers: ${(memonic.suggestionBehavior?.triggerKeywords || []).join(", ")}\n\nSuggest improvements. Return ONLY the JSON.`,
            [],
          );

          loading.hide();
          const modal = new AIResultModal(
            this.app,
            response,
            memonic,
            this.plugin,
            this,
          );
          modal.open();
        } catch (err) {
          loading.hide();
          new Notice(
            `AI error: ${err instanceof Error ? err.message : "Unknown"}`,
          );
        }
      });

      const smileBtn = actionRow.createEl("button", {
        cls: "memonic-action-btn",
      });
      smileBtn.style.fontWeight = "bold";
      smileBtn.style.fontSize = "11px";
      smileBtn.textContent = ":)";
      smileBtn.title = "Suggest improvements for this memonic";
      smileBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const provider = this.plugin.settings.aiProvider;
        if (!provider.apiKey) {
          new Notice("Please set your OpenRouter API key in settings first.");
          return;
        }

        const loading = new Notice("AI is thinking...", 0);
        try {
          const response = await queryOpenRouter(
            provider,
            memonic.aiConfig?.model || provider.defaultModel,
            'You are a mnemonic assistant for a study tool. A memonic has study material (the explanation) and a TITLE that serves as a memory hook (mental link) for recalling it. From the material, craft a short, vivid, memorable mental link to use as the title: if a title already exists improve it into a stronger hook, and if it is empty or weak invent one from the material. Also give a one-line summary of how the mental link maps to the material. Respond with ONLY a JSON object (no markdown, no backticks):\n\n{\n  "title": "short memorable mental link",\n  "summary": "one line: how this mental link helps recall the material"\n}',
            `Current title (may be empty): ${memonic.title}\nStudy material:\n${memonic.context}\n\nCreate or improve the mental-link title and give a one-line summary. Return ONLY the JSON.`,
            [],
          );

          loading.hide();
          const modal = new SmileyModal(
            this.app,
            response,
            memonic,
            this.plugin,
            this,
          );
          modal.open();
        } catch (err) {
          loading.hide();
          new Notice(
            `AI error: ${err instanceof Error ? err.message : "Unknown"}`,
          );
        }
      });
    }

    if (memonic.status !== "deleted") {
      const actionBtn = actionRow.createEl("button", {
        cls: "memonic-action-btn",
      });
      setIcon(actionBtn, "trash-2");
      actionBtn.title = "Delete";
      actionBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const fromCallout = memonic.sourceFile;
        if (fromCallout) {
          if (this.plugin.settings.debrisCleanup) {
            try {
              await this.removeCalloutFromFile(memonic);
            } catch {}
          } else {
            await this.removeCalloutFromFile(memonic);
          }
          updateMemonicBySid(memonic.sid, { status: "deleted" });
        } else {
          deleteMemonicBySid(memonic.sid);
        }
        this.render();
      });
    }

    const idRow = card.createDiv("memonic-id");
    idRow.setText(`ID: ${memonic.id}`);

    const locationBadge = card.createDiv("memonic-location-badge");
    if (memonic.sourceFile) {
      const siblings = getAllMemonics().filter(
        (m) => m.sourceFile === memonic.sourceFile && m.status !== "deleted",
      );
      const pos = siblings.findIndex((m) => m.id === memonic.id) + 1;
      locationBadge.setText(
        `${memonic.sourceFile} · #${pos}/${siblings.length}`,
      );
    } else {
      locationBadge.setText(memonic.folderPath || "/");
    }

    const title = card.createEl("h3", { text: memonic.title });

    const context = card.createDiv("memonic-context");
    context.setText(
      memonic.context.substring(0, 100) +
        (memonic.context.length > 100 ? "..." : ""),
    );

    const meta = card.createDiv("memonic-meta");

    const folderSpan = meta.createSpan("memonic-folder");
    setIcon(folderSpan, "folder");
    folderSpan.appendText(" " + (memonic.folderPath || "/"));

    const tagContainer = card.createDiv("memonic-tags");
    for (const tag of memonic.tags.slice(0, 5)) {
      const tagEl = tagContainer.createSpan("memonic-tag");
      tagEl.setText(tag);
    }

    const aiInfo = card.createDiv("memonic-ai");
    aiInfo.setText(`AI: ${memonic.aiConfig?.model || "—"}`);

    if (memonic.status !== "deleted") {
      const bottomRow = card.createDiv("memonic-bottom-row");
      bottomRow.style.display = "flex";
      bottomRow.style.justifyContent = "flex-end";
      bottomRow.style.gap = "6px";
      bottomRow.style.marginTop = "8px";
      bottomRow.style.paddingTop = "8px";
      bottomRow.style.borderTop =
        "1px solid var(--background-modifier-border)";

      const forceBtn = bottomRow.createEl("button", {
        cls: "memonic-action-btn",
      });
      forceBtn.style.color = "var(--text-error)";
      forceBtn.style.fontWeight = "bold";
      forceBtn.style.fontSize = "11px";
      forceBtn.textContent = "!!!";
      forceBtn.title =
        "Force Delete — remove from store completely, no file changes";
      let confirmedForce = false;
      let forceTimer: ReturnType<typeof setTimeout> | null = null;
      forceBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirmedForce) {
          confirmedForce = true;
          forceBtn.textContent = "Confirm?";
          forceTimer = setTimeout(() => {
            confirmedForce = false;
            forceBtn.textContent = "!!!";
          }, 3000);
        } else {
          if (forceTimer) clearTimeout(forceTimer);
          deleteMemonicBySid(memonic.sid);
          this.render();
        }
      });
    }

    // For deleted memonics, show restore actions in a full-width footer row
    // below the card (more room than the cramped top action bar).
    if (memonic.status === "deleted") {
      const restoreRow = card.createDiv("memonic-restore-row");
      restoreRow.style.display = "flex";
      restoreRow.style.gap = "6px";
      restoreRow.style.marginTop = "8px";
      restoreRow.style.paddingTop = "8px";
      restoreRow.style.borderTop =
        "1px solid var(--background-modifier-border)";

      const restoreBtnFull = restoreRow.createEl("button", {
        cls: "memonic-restore-full-btn",
      });
      restoreBtnFull.style.flex = "1";
      restoreBtnFull.style.color = "var(--text-success)";
      restoreBtnFull.style.fontWeight = "bold";
      setIcon(restoreBtnFull, "rotate-ccw");
      restoreBtnFull.appendText(" Restore memonic");
      restoreBtnFull.title = "Restore — re-add this callout to its note";
      restoreBtnFull.addEventListener("click", async (e) => {
        e.stopPropagation();
        updateMemonicBySid(memonic.sid, { status: "active", reference: true });
        if (memonic.sourceFile) {
          await this.appendRestoredToFile(memonic);
        }
        this.render();
      });

      const restoreAsBtn = restoreRow.createEl("button", {
        cls: "memonic-restore-secondary-btn",
      });
      setIcon(restoreAsBtn, "download");
      restoreAsBtn.title = "Restore to folder...";
      restoreAsBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const modal = new RestoreLocationModal(this.app, memonic, this.plugin);
        modal.open();
        await modal.waitForClose;
        this.render();
      });

      const deleteForeverBtn = restoreRow.createEl("button", {
        cls: "memonic-restore-secondary-btn",
      });
      deleteForeverBtn.style.color = "var(--text-error)";
      setIcon(deleteForeverBtn, "trash-2");
      deleteForeverBtn.title = "Delete Forever";
      deleteForeverBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (memonic.sourceFile) {
          if (this.plugin.settings.debrisCleanup) {
            try {
              await this.removeCalloutFromFile(memonic);
            } catch {}
          } else {
            await this.removeCalloutFromFile(memonic);
          }
        }
        deleteMemonicBySid(memonic.sid);
        this.render();
      });
    }
  }

  private async navigateToMemonic(memonic: Memonic): Promise<void> {
    if (!memonic.sourceFile) return;

    const file = this.app.vault.getAbstractFileByPath(memonic.sourceFile);
    if (!(file instanceof TFile)) {
      new Notice("Source file not found");
      return;
    }

    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);

    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;

    const content = view.editor.getValue();
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (/^>\s*\[!memonic/i.test(lines[i])) {
        for (let j = i + 1; j < lines.length && lines[j].startsWith(">"); j++) {
          if (lines[j].includes(`<!-- sid: ${memonic.sid} -->`)) {
            view.editor.setCursor({ line: i, ch: 0 });
            view.editor.scrollIntoView(
              { from: { line: i, ch: 0 }, to: { line: i, ch: 0 } },
              true,
            );
            return;
          }
        }
      }
    }
  }

  private createAddButton(): void {
    const btnContainer = this.container.createDiv("memonic-add-container");
    const addBtn = btnContainer.createEl("button", { cls: "memonic-add-btn" });
    addBtn.setText("+ New Memonic");
    addBtn.addEventListener("click", () => this.showAddModal());
  }

  private formatCalloutText(memonic: Memonic): string {
    return formatMemonicCallout(memonic);
  }

  private async removeCalloutFromFile(memonic: Memonic): Promise<void> {
    await removeCalloutFromFile(this.app, memonic);
  }

  private async appendRestoredToFile(memonic: Memonic): Promise<void> {
    await restoreMemonicToFile(
      this.app,
      memonic,
      this.plugin.settings.restoreMode,
    );
  }

  private showAddModal(): void {
    const modal = new MemonicCreateModal(this.app, this.plugin, async () => {
      this.render();
    });
    modal.open();
  }
}

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
}

function buildFolderTree(folders: TFolder[]): FolderNode[] {
  const root: FolderNode[] = [];
  const paths = folders.map((f) => f.path).sort();
  for (const fp of paths) {
    const parts = fp.split("/").filter(Boolean);
    let current = root;
    let runningPath = "";
    for (const part of parts) {
      runningPath = runningPath ? `${runningPath}/${part}` : part;
      let node = current.find((c) => c.name === part);
      if (!node) {
        node = { name: part, path: runningPath, children: [] };
        current.push(node);
      }
      current = node.children;
    }
  }
  return root;
}

class MemonicCreateModal extends Modal {
  private onSubmit: () => void;
  private plugin: MemonicPlugin;
  private title = "";
  private type: MemonicType = "shortcut";
  private context = "";
  private strength: MemonicStrength = 3;
  private tags: string[] = [];
  private folderPath = "";
  private triggerKeywords: string[] = [];
  private showTree = false;
  private treeContainer: HTMLDivElement;
  private folderInputEl: HTMLInputElement;
  private tagsPillsEl: HTMLDivElement;
  private tagsInputEl: HTMLInputElement;
  private tagsDropdownEl: HTMLDivElement;
  private keywordsInputEl: HTMLInputElement;
  private clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  constructor(app: App, plugin: MemonicPlugin, onSubmit: () => void) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Create New Memonic" });

    new Setting(contentEl)
      .setName("Title")
      .addText((cb) =>
        cb.setPlaceholder("Memonic title").onChange((v) => (this.title = v)),
      );

    new Setting(contentEl).setName("Type").addDropdown((cb) => {
      const types: MemonicType[] = [
        "shortcut",
        "story",
        "song",
        "rule",
        "fact",
        "example",
        "question",
        "tip",
      ];
      for (const t of types) cb.addOption(t, t);
      cb.addOption("custom", "custom");
      cb.onChange(
        (v) => (this.type = v === "custom" ? "custom" : (v as MemonicType)),
      );
    });

    new Setting(contentEl).setName("Strength").addSlider((cb) =>
      cb
        .setLimits(1, 5, 1)
        .setValue(3)
        .setDynamicTooltip()
        .onChange((v) => (this.strength = v as MemonicStrength)),
    );

    const tagSetting = new Setting(contentEl)
      .setName("Tags")
      .setDesc("Select existing tags or type to create new ones");
    const tagWidget = tagSetting.settingEl.createDiv("memonic-tags-container");
    this.buildTagsWidget(tagWidget);

    const folderSetting = new Setting(contentEl).setName("Folder");
    folderSetting.addText((cb) => {
      this.folderInputEl = cb.inputEl;
      cb.setPlaceholder("/").onChange((v) => (this.folderPath = v));
    });
    folderSetting.addButton((cb) =>
      cb.setButtonText("Browse").onClick(() => {
        this.showTree = !this.showTree;
        this.renderTree();
      }),
    );

    this.treeContainer = contentEl.createDiv("memonic-folder-tree");
    this.treeContainer.style.display = "none";

    new Setting(contentEl)
      .setName("Context")
      .addTextArea((cb) =>
        cb
          .setPlaceholder("The knowledge/information to store...")
          .onChange((v) => (this.context = v)),
      );

    const kwSetting = new Setting(contentEl)
      .setName("Trigger Keywords")
      .setDesc("Type to search existing keywords or add new ones");
    const kwWidget = kwSetting.settingEl.createDiv(
      "memonic-keywords-container",
    );
    this.buildKeywordsWidget(kwWidget);

    new Setting(contentEl).addButton((cb) =>
      cb
        .setButtonText("Create")
        .setCta()
        .onClick(() => {
          this.submitMemonic();
        }),
    );
  }

  private buildTagsWidget(container: HTMLDivElement): void {
    this.tagsPillsEl = container.createDiv("memonic-tags-pills");

    const inputRow = container.createDiv("memonic-tags-input-row");
    this.tagsInputEl = inputRow.createEl("input", {
      type: "text",
      placeholder: "Type to add tag...",
      cls: "memonic-tags-input",
    });

    this.tagsDropdownEl = container.createDiv("memonic-tags-dropdown");
    this.tagsDropdownEl.style.display = "none";

    const allMemonics = getAllMemonics();
    const allTags = [...new Set(allMemonics.flatMap((m) => m.tags))].sort();

    const renderPills = () => {
      this.tagsPillsEl.empty();
      for (const tag of this.tags) {
        const pill = this.tagsPillsEl.createSpan("memonic-tag-pill");
        pill.setText(tag);
        const removeBtn = pill.createEl("span", { cls: "memonic-tag-remove" });
        removeBtn.setText("×");
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.tags = this.tags.filter((t) => t !== tag);
          renderPills();
        });
      }
    };

    const renderDropdown = (filter = "") => {
      this.tagsDropdownEl.empty();
      const q = filter.toLowerCase();
      const matches = allTags.filter(
        (t) => t.toLowerCase().includes(q) && !this.tags.includes(t),
      );
      if (matches.length === 0) {
        this.tagsDropdownEl.style.display = "none";
        return;
      }
      this.tagsDropdownEl.style.display = "block";
      for (const tag of matches) {
        const item = this.tagsDropdownEl.createDiv("memonic-tags-item");
        item.setText(tag);
        item.addEventListener("click", () => {
          this.tags.push(tag);
          renderPills();
          this.tagsInputEl.value = "";
          renderDropdown("");
        });
      }
    };

    this.tagsInputEl.addEventListener("input", () => {
      renderDropdown(this.tagsInputEl.value);
    });

    this.tagsInputEl.addEventListener("focus", () => {
      renderDropdown(this.tagsInputEl.value);
    });

    this.tagsInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = this.tagsInputEl.value.trim();
        if (val && !this.tags.includes(val)) {
          this.tags.push(val);
          renderPills();
          this.tagsInputEl.value = "";
          renderDropdown("");
        }
      } else if (e.key === "Escape") {
        this.tagsDropdownEl.style.display = "none";
      }
    });

    this.clickOutsideHandler = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) {
        this.tagsDropdownEl.style.display = "none";
      }
    };
    document.addEventListener("click", this.clickOutsideHandler);

    renderPills();
  }

  private buildKeywordsWidget(container: HTMLDivElement): void {
    this.keywordsInputEl = container.createEl("input", {
      type: "text",
      placeholder: "keyword1, keyword2, ...",
      cls: "memonic-keywords-input",
    });

    const allMemonics = getAllMemonics();
    const allKeywords = [
      ...new Set(
        allMemonics.flatMap((m) => m.suggestionBehavior?.triggerKeywords || []),
      ),
    ].sort();

    if (allKeywords.length > 0) {
      const datalist = container.createEl("datalist", {
        attr: { id: "kw-datalist" },
      });
      for (const kw of allKeywords) {
        datalist.createEl("option", { value: kw });
      }
      this.keywordsInputEl.setAttr("list", "kw-datalist");
    }

    this.keywordsInputEl.addEventListener("change", () => {
      this.triggerKeywords = this.keywordsInputEl.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    });
  }

  private renderTree(): void {
    if (!this.treeContainer) return;

    if (!this.showTree) {
      this.treeContainer.style.display = "none";
      return;
    }

    this.treeContainer.empty();
    this.treeContainer.style.display = "block";

    const allFiles = this.app.vault.getAllLoadedFiles();
    const folders = allFiles.filter((f): f is TFolder => f instanceof TFolder);
    const tree = buildFolderTree(folders);

    if (tree.length === 0) {
      this.treeContainer.setText("(no folders in vault)");
      return;
    }

    const treeEl = this.treeContainer.createDiv("memonic-tree-inner");
    this.renderTreeNodes(treeEl, tree, 0, false);
  }

  private renderTreeNodes(
    container: HTMLElement,
    nodes: FolderNode[],
    depth: number,
    forceExpand: boolean,
  ): void {
    for (const node of nodes) {
      const row = container.createDiv("memonic-tree-row");
      row.style.paddingLeft = `${depth * 16 + 4}px`;

      const hasChildren = node.children.length > 0;

      if (hasChildren) {
        const expandBtn = row.createEl("span", { cls: "memonic-tree-expand" });
        setIcon(expandBtn, forceExpand ? "chevron-down" : "chevron-right");
        let expanded = forceExpand;
        let childContainer: HTMLDivElement | null = null;

        expandBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          expanded = !expanded;
          setIcon(expandBtn, expanded ? "chevron-down" : "chevron-right");
          if (childContainer) {
            childContainer.style.display = expanded ? "block" : "none";
          }
        });

        childContainer = container.createDiv("memonic-tree-children");
        childContainer.style.display = forceExpand ? "block" : "none";
        this.renderTreeNodes(
          childContainer,
          node.children,
          depth + 1,
          forceExpand,
        );
      } else {
        row.createEl("span", { cls: "memonic-tree-spacer" });
      }

      const nameSpan = row.createEl("span", { cls: "memonic-tree-name" });
      nameSpan.setText(node.name);
      nameSpan.addEventListener("click", () => {
        this.folderPath = "/" + node.path;
        this.showTree = false;
        this.renderTree();
        if (this.folderInputEl) this.folderInputEl.value = this.folderPath;
      });
    }
  }

  private async submitMemonic(): Promise<void> {
    if (!this.title || !this.context) {
      new Notice("Title and Context are required");
      return;
    }

    const rawPath = this.folderPath || "/";
    const folderName = rawPath.split("/").filter(Boolean).pop() || "root";
    const emFileName = `${folderName}-EM.md`;

    const cleanPath = rawPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const emFilePath = cleanPath ? `${cleanPath}/${emFileName}` : emFileName;

    // Visible id is the running count of memonics already in the destination EM
    // file (a friendly per-note number), unless auto-id is disabled.
    let priorCount = 0;
    const existingForCount = this.app.vault.getAbstractFileByPath(emFilePath);
    if (existingForCount instanceof TFile) {
      priorCount = countMemonicCalloutsInText(
        await this.app.vault.read(existingForCount),
      );
    }
    const visibleId = this.plugin.settings.autoId ? `${priorCount + 1}` : "";

    // Mint the stable, hidden system id (sid) at creation time so identity is
    // fixed from the start and never re-derived later during a scan. Both
    // creation paths emit the exact same callout via buildMemonicCallout.
    const sid = generateSid();

    const calloutText =
      "\n\n" +
      buildMemonicCallout({
        type: this.type,
        title: this.title,
        id: visibleId,
        sid,
        strength: this.strength,
        tags: this.tags,
        triggers: this.triggerKeywords,
        contextLines: this.context.split("\n"),
      }) +
      "\n";

    try {
      const existing = this.app.vault.getAbstractFileByPath(emFilePath);
      if (existing instanceof TFile) {
        await this.app.vault.append(existing, calloutText);
        new Notice(`Memonic appended to ${emFilePath}`);
      } else {
        if (cleanPath) {
          try {
            const parentFolder =
              this.app.vault.getAbstractFileByPath(cleanPath);
            if (!parentFolder) {
              await this.app.vault.createFolder(cleanPath);
            }
          } catch (_e) {
            // folder might already exist, ignore
          }
        }
        await this.app.vault.create(emFilePath, calloutText);
        new Notice(`Memonic saved to ${emFilePath}`);
      }

      this.onSubmit();
      this.close();
    } catch (e) {
      new Notice(`Error: ${e.message}`);
    }
  }

  onClose(): void {
    if (this.clickOutsideHandler) {
      document.removeEventListener("click", this.clickOutsideHandler);
      this.clickOutsideHandler = null;
    }
    const { contentEl } = this;
    contentEl.empty();
  }
}

class RestoreLocationModal extends Modal {
  private memonic: Memonic;
  private plugin: MemonicPlugin;
  private selectedFolder = "";
  private treeContainer: HTMLDivElement;
  private folderInputEl: HTMLInputElement;
  private showTree = false;
  resolveClose: () => void;
  waitForClose: Promise<void>;
  private mode: "restore" | "move";
  private view?: { render: () => void };

  constructor(app: App, memonic: Memonic, plugin: MemonicPlugin, mode: "restore" | "move" = "restore", view?: { render: () => void }) {
    super(app);
    this.memonic = memonic;
    this.plugin = plugin;
    this.mode = mode;
    this.view = view;
    this.waitForClose = new Promise((resolve) => {
      this.resolveClose = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.mode === "move" ? "Move Memonic to..." : "Restore Memonic to..." });

    const folderSetting = new Setting(contentEl).setName("Destination Folder");
    folderSetting.addText((cb) => {
      this.folderInputEl = cb.inputEl;
      cb.setPlaceholder("/").onChange((v) => (this.selectedFolder = v));
    });
    folderSetting.addButton((cb) =>
      cb.setButtonText("Browse").onClick(() => {
        this.showTree = !this.showTree;
        this.renderTree();
      }),
    );

    this.treeContainer = contentEl.createDiv("memonic-folder-tree");
    this.treeContainer.style.display = "none";

    new Setting(contentEl).addButton((cb) =>
      cb
        .setButtonText(this.mode === "move" ? "Move Here" : "Restore Here")
        .setCta()
        .onClick(() => this.doRestore()),
    );
  }

  private renderTree(): void {
    if (!this.treeContainer) return;
    if (!this.showTree) {
      this.treeContainer.style.display = "none";
      return;
    }
    this.treeContainer.empty();
    this.treeContainer.style.display = "block";
    const allFiles = this.app.vault.getAllLoadedFiles();
    const folders = allFiles.filter((f): f is TFolder => f instanceof TFolder);
    const tree = buildFolderTree(folders);
    if (tree.length === 0) {
      this.treeContainer.setText("(no folders)");
      return;
    }
    const treeEl = this.treeContainer.createDiv("memonic-tree-inner");
    this.renderTreeNodes(treeEl, tree, 0, false);
  }

  private renderTreeNodes(
    container: HTMLElement,
    nodes: FolderNode[],
    depth: number,
    forceExpand: boolean,
  ): void {
    for (const node of nodes) {
      const row = container.createDiv("memonic-tree-row");
      row.style.paddingLeft = `${depth * 16 + 4}px`;
      const hasChildren = node.children.length > 0;
      if (hasChildren) {
        const expandBtn = row.createEl("span", { cls: "memonic-tree-expand" });
        setIcon(expandBtn, forceExpand ? "chevron-down" : "chevron-right");
        let expanded = forceExpand;
        expandBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          expanded = !expanded;
          setIcon(expandBtn, expanded ? "chevron-down" : "chevron-right");
          const next = row.nextElementSibling as HTMLElement;
          if (next) next.style.display = expanded ? "block" : "none";
        });
      } else {
        row.createEl("span", { cls: "memonic-tree-spacer" });
      }
      const nameSpan = row.createEl("span", { cls: "memonic-tree-name" });
      nameSpan.setText(node.name);
      nameSpan.addEventListener("click", () => {
        this.selectedFolder = "/" + node.path;
        this.showTree = false;
        this.renderTree();
        if (this.folderInputEl) this.folderInputEl.value = this.selectedFolder;
      });
      const childContainer = container.createDiv("memonic-tree-children");
      childContainer.style.display = forceExpand ? "block" : "none";
      this.renderTreeNodes(
        childContainer,
        node.children,
        depth + 1,
        forceExpand,
      );
    }
  }

  private async doRestore(): Promise<void> {
    const destFolder = this.selectedFolder || "/";
    const folderName = destFolder.split("/").filter(Boolean).pop() || "root";
    const emFileName = `${folderName}-EM.md`;
    const cleanPath = destFolder.replace(/^\/+/, "").replace(/\/+$/, "");
    const emFilePath = cleanPath ? `${cleanPath}/${emFileName}` : emFileName;

    const calloutText = formatMemonicCallout(this.memonic);
    const restoreMode = this.plugin.settings.restoreMode;
    const isMove = this.mode === "move";
    const text = isMove
      ? `\n\n${calloutText}\n`
      : restoreMode === "codeblock"
        ? `\n\n\`\`\`memonic-ref\n${calloutText}\n\`\`\`\n`
        : `\n\n${calloutText}\n`;

    try {
      if (this.memonic.sourceFile) {
        const oldFile = this.app.vault.getAbstractFileByPath(
          this.memonic.sourceFile,
        );
        if (oldFile instanceof TFile) {
          const raw = await this.app.vault.read(oldFile);
          const lines = raw.split("\n");
          let codeBlockStart = findRefBlockStartBySid(lines, this.memonic.sid);
          if (codeBlockStart !== -1) {
            let blockEnd = codeBlockStart + 1;
            while (blockEnd < lines.length && lines[blockEnd].trim() !== "```")
              blockEnd++;
            if (blockEnd < lines.length) {
              await this.app.vault.modify(
                oldFile,
                [
                  ...lines.slice(0, codeBlockStart),
                  ...lines.slice(blockEnd + 1),
                ].join("\n"),
              );
            }
          } else {
            const calloutStart = findCalloutStartBySid(lines, this.memonic.sid);
            if (calloutStart !== -1) {
              let e = calloutStart;
              while (
                e < lines.length - 1 &&
                lines[e + 1].startsWith(">") &&
                !/^>\s*\[!/.test(lines[e + 1].trim())
              )
                e++;
              await this.app.vault.modify(
                oldFile,
                [...lines.slice(0, calloutStart), ...lines.slice(e + 1)].join("\n"),
              );
            }
          }
        }
      }

      const existing = this.app.vault.getAbstractFileByPath(emFilePath);
      if (existing instanceof TFile) {
        await this.app.vault.append(existing, text);
      } else {
        if (cleanPath) {
          try {
            const parentFolder =
              this.app.vault.getAbstractFileByPath(cleanPath);
            if (!parentFolder) await this.app.vault.createFolder(cleanPath);
          } catch (_e) {}
        }
        await this.app.vault.create(emFilePath, text);
      }

      updateMemonicBySid(this.memonic.sid, {
        status: "active",
        reference: isMove ? false : true,
        folderPath: destFolder,
        sourceFile: emFilePath,
      });

      new Notice(isMove ? `Moved to ${emFilePath}` : `Restored to ${emFilePath}`);
      this.view?.render();
      this.close();
    } catch (e) {
      new Notice(`Error: ${e.message}`);
    }
  }

  onClose(): void {
    this.resolveClose?.();
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Inserts or replaces a single "> Summary: ..." line inside a memonic callout,
// positioned after the metadata lines (id/strength/tags/triggers/model) and
// before the body/separator. Existing summary lines are removed (no stacking).
/**
 * Count how many memonic callouts already exist in a note's text. Used to pick
 * a friendly, per-note visible id at creation time.
 */
export function countMemonicCalloutsInText(content: string): number {
  let count = 0;
  let inRef = false;
  for (const line of content.split("\n")) {
    if (/^\s*```memonic-ref/.test(line)) { inRef = true; continue; }
    if (inRef) { if (/^\s*```\s*$/.test(line)) inRef = false; continue; }
    if (/^>\s*\[!memonic\b/i.test(line)) count++;
  }
  return count;
}

function findCalloutStartBySid(lines: string[], sid: number): number {
  for (let i = 0; i < lines.length; i++) {
    if (/^>\s*\[!memonic/i.test(lines[i])) {
      for (let j = i + 1; j < lines.length && lines[j].startsWith(">"); j++) {
        if (lines[j].includes(`<!-- sid: ${sid} -->`)) {
          return i;
        }
      }
    }
  }
  return -1;
}

function findRefBlockStartBySid(lines: string[], sid: number): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "```memonic-ref") {
      let blockEnd = -1;
      for (let k = i + 1; k < lines.length; k++) {
        if (lines[k].trim() === "```") {
          blockEnd = k;
          break;
        }
      }
      if (blockEnd === -1) blockEnd = lines.length;
      for (let j = i + 1; j < blockEnd; j++) {
        if (lines[j].includes(`<!-- sid: ${sid} -->`)) {
          return i;
        }
      }
    }
  }
  return -1;
}

/**
 * The single source of truth for a memonic callout's text, shared by every
 * creation path so the template is identical everywhere. The hidden `sid` is
 * the real identity; the visible `id` is an optional, user-editable label.
 */
export function buildMemonicCallout(opts: {
  type: string;
  title: string;
  id: string;
  sid: number;
  strength: number;
  tags: string[];
  triggers: string[];
  contextLines: string[];
  summary?: string;
}): string {
  const lines: string[] = [`> [!memonic|${opts.type}] ${opts.title}`];
  if (opts.id !== "") lines.push(`> id: ${opts.id}`);
  lines.push(`> <!-- sid: ${opts.sid} -->`);
  lines.push(`> strength: ${opts.strength}`);
  if (opts.tags.length > 0) lines.push(`> tags: ${opts.tags.join(", ")}`);
  if (opts.triggers.length > 0)
    lines.push(`> triggers: ${opts.triggers.join(", ")}`);
  if (opts.summary) lines.push(`> Summary: ${opts.summary}`);
  lines.push("> ---");
  for (const l of opts.contextLines) lines.push(`> ${l}`);
  return lines.join("\n");
}

export async function removeCalloutFromFile(app: App, memonic: Memonic): Promise<void> {
  if (!memonic.sourceFile) return;

  const file = app.vault.getAbstractFileByPath(memonic.sourceFile);
  if (!(file instanceof TFile)) return;

  const raw = await app.vault.read(file);
  const lines = raw.split("\n");

  let targetIdx = findRefBlockStartBySid(lines, memonic.sid);

  if (targetIdx !== -1) {
    let blockEnd = targetIdx + 1;
    while (blockEnd < lines.length && lines[blockEnd].trim() !== "```") {
      blockEnd++;
    }
    if (blockEnd < lines.length) {
      const newLines = [
        ...lines.slice(0, targetIdx),
        ...lines.slice(blockEnd + 1),
      ];
      await app.vault.modify(file, newLines.join("\n"));
      return;
    }
  }

  targetIdx = findCalloutStartBySid(lines, memonic.sid);

  if (targetIdx === -1) return;

  let blockEnd = targetIdx;
  while (
    blockEnd < lines.length - 1 &&
    lines[blockEnd + 1].startsWith(">") &&
    !/^>\s*\[!/.test(lines[blockEnd + 1].trim())
  ) {
    blockEnd++;
  }

  const newLines = [
    ...lines.slice(0, targetIdx),
    ...lines.slice(blockEnd + 1),
  ];
  await app.vault.modify(file, newLines.join("\n"));
}

export function formatMemonicCallout(memonic: Memonic): string {
  if (!memonic.sid) memonic.sid = generateSid();
  const visibleId = memonic.id.replace(/^mem-?/, "");
  const lines = [
    `> [!memonic|${memonic.type}] ${memonic.title}`,
    ...(visibleId !== "" ? [`> id: ${visibleId}`] : []),
    `> <!-- sid: ${memonic.sid} -->`,
    `> strength: ${memonic.strength}`,
    ...(memonic.tags.length > 0 ? [`> tags: ${memonic.tags.join(", ")}`] : []),
    ...(memonic.suggestionBehavior?.triggerKeywords?.length > 0
      ? [`> triggers: ${memonic.suggestionBehavior.triggerKeywords.join(", ")}`]
      : []),
    ...(memonic.summary ? [`> Summary: ${memonic.summary}`] : []),
    "> ---",
    ...memonic.context.split("\n").map((l) => `> ${l}`),
  ];
  return lines.join("\n");
}

export async function restoreMemonicToFile(
  app: App,
  memonic: Memonic,
  restoreMode: RestoreMode,
): Promise<void> {
  if (!memonic.sourceFile) return;

  const calloutText = formatMemonicCallout(memonic);

  try {
    if (restoreMode === "codeblock") {
      const parts = memonic.sourceFile.split("/").filter(Boolean);
      const parentFolderPath =
        parts.length > 1 ? "/" + parts.slice(0, -1).join("/") : "/";
      const parentFolderName =
        parts.length > 1 ? parts[parts.length - 2] : "root";
      const emFileName = `${parentFolderName}-EM.md`;
      const cleanPath = parentFolderPath
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
      const emFilePath = cleanPath ? `${cleanPath}/${emFileName}` : emFileName;
      const text = `\n\n\`\`\`memonic-ref\n${calloutText}\n\`\`\`\n`;

      if (cleanPath) {
        const parentFolder = app.vault.getAbstractFileByPath(cleanPath);
        if (!parentFolder) await app.vault.createFolder(cleanPath);
      }
      const existing = app.vault.getAbstractFileByPath(emFilePath);
      if (existing instanceof TFile) {
        await app.vault.append(existing, text);
      } else {
        await app.vault.create(emFilePath, text);
      }
      updateMemonicBySid(memonic.sid, {
        folderPath: parentFolderPath,
        sourceFile: emFilePath,
      });
      new Notice(`Restored to ${emFilePath} (codeblock)`);
    } else {
      const text = `\n\n${calloutText}\n`;
      const existing = app.vault.getAbstractFileByPath(memonic.sourceFile);
      if (existing instanceof TFile) {
        await app.vault.append(existing, text);
        new Notice(`Restored to ${memonic.sourceFile} (callout)`);
      } else {
        await app.vault.create(memonic.sourceFile, text);
        new Notice(`Recreated ${memonic.sourceFile} (callout)`);
      }
    }
  } catch (e) {
    new Notice(`Could not restore to file: ${e.message}`);
  }
}

function upsertCalloutMeta(
  lines: string[],
  calloutStart: number,
  key: string,
  value: string,
): string[] {
  let blockEnd = calloutStart + 1;
  while (blockEnd < lines.length && lines[blockEnd].startsWith(">")) blockEnd++;

  const META_RE =
    /^>\s*(<!--\s*sid|id|sid|strength|tags|triggers|model|summary)\s*:/i;
  const KEY_RE = new RegExp(`^>\\s*${key}\\s*\\d*\\s*:\\s*`, "i");

  const header = lines[calloutStart];
  const body = lines.slice(calloutStart + 1, blockEnd);
  const cleaned = body.filter((l) => !KEY_RE.test(l));

  let insertAt = 0;
  while (insertAt < cleaned.length && META_RE.test(cleaned[insertAt]))
    insertAt++;

  cleaned.splice(insertAt, 0, `> ${key === "Summary" ? "Summary" : key}: ${value}`);

  return [
    ...lines.slice(0, calloutStart),
    header,
    ...cleaned,
    ...lines.slice(blockEnd),
  ];
}

function upsertCalloutSummary(
  lines: string[],
  calloutStart: number,
  summary: string,
): string[] {
  return upsertCalloutMeta(lines, calloutStart, "Summary", summary);
}

class AIResultModal extends Modal {
  private result: {
    title: string;
    summary: string;
    tags: string[];
    triggers: string[];
  } | null = null;

  constructor(
    app: App,
    private aiResponse: string,
    private memonic: Memonic,
    private plugin: Plugin,
    private view: { render: () => void },
  ) {
    super(app);
    try {
      const cleaned = this.aiResponse
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      this.result =
        parsed && typeof parsed === "object"
          ? {
              title: typeof parsed.title === "string" ? parsed.title : "",
              summary: typeof parsed.summary === "string" ? parsed.summary : "",
              tags: Array.isArray(parsed.tags)
                ? parsed.tags.map((t: unknown) => String(t))
                : [],
              triggers: Array.isArray(parsed.triggers)
                ? parsed.triggers.map((t: unknown) => String(t))
                : [],
            }
          : null;
    } catch {
      this.result = null;
    }
  }

  onOpen(): void {
    const { contentEl } = this;

    if (!this.result) {
      contentEl.createEl("h2", { text: "AI Response (raw)" });
      const ta = contentEl.createEl("textarea", { cls: "memonic-ai-textarea" });
      ta.style.width = "100%";
      ta.style.minHeight = "200px";
      ta.style.marginBottom = "12px";
      ta.value = this.aiResponse;

      const note = contentEl.createEl("p", { cls: "suggestion-empty" });
      note.setText(
        "AI didn't return valid JSON. You can still edit and apply manually.",
      );

      const applyRawBtn = contentEl.createEl("button", {
        text: "Apply above callout",
        cls: "mod-cta",
      });
      applyRawBtn.addEventListener("click", async () => {
        await this.writeAboveCallout(ta.value);
      });
      const cancelBtn = contentEl.createEl("button", { text: "Cancel" });
      cancelBtn.style.marginLeft = "8px";
      cancelBtn.addEventListener("click", () => this.close());
      return;
    }

    contentEl.createEl("h2", {
      text: `Suggestions for "${this.memonic.title}"`,
    });

    new Setting(contentEl).setName("Title").addText((cb) =>
      cb.setValue(this.result!.title).onChange((v) => {
        this.result!.title = v;
      }),
    );

    new Setting(contentEl).setName("Summary").addTextArea((cb) =>
      cb.setValue(this.result!.summary).onChange((v) => {
        this.result!.summary = v;
      }),
    );

    new Setting(contentEl).setName("Tags").addText((cb) =>
      cb.setValue(this.result!.tags.join(", ")).onChange((v) => {
        this.result!.tags = v
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }),
    );

    new Setting(contentEl).setName("Keywords / Triggers").addText((cb) =>
      cb.setValue(this.result!.triggers.join(", ")).onChange((v) => {
        this.result!.triggers = v
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }),
    );

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.justifyContent = "flex-end";

    const applyBtn = btnRow.createEl("button", {
      text: "Apply",
      cls: "mod-cta",
    });
    applyBtn.addEventListener("click", async () => {
      await this.applyToCallout();
    });

    const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
  }

  private async applyToCallout(): Promise<void> {
    if (!this.result) {
      this.close();
      return;
    }

    if (this.memonic.sourceFile) {
      const file = this.app.vault.getAbstractFileByPath(
        this.memonic.sourceFile,
      );
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        const lines = content.split("\n");

        const calloutStart = findCalloutStartBySid(lines, this.memonic.sid);

        if (calloutStart === -1) {
          new Notice("Could not find callout in source file");
          this.close();
          return;
        }

        const typeMatch = lines[calloutStart].match(/^>\s*\[!memonic\|(\w+)\]/);
        if (typeMatch && this.result.title) {
          lines[calloutStart] =
            `> [!memonic|${typeMatch[1]}] ${this.result.title}`;
        }

        let newLines = lines;
        if (this.result.tags.length)
          newLines = upsertCalloutMeta(newLines, calloutStart, "tags", this.result.tags.join(", "));
        if (this.result.triggers.length)
          newLines = upsertCalloutMeta(newLines, calloutStart, "triggers", this.result.triggers.join(", "));
        if (this.result.summary)
          newLines = upsertCalloutSummary(newLines, calloutStart, this.result.summary);

        await this.app.vault.modify(file, newLines.join("\n"));
      }
    }

    updateMemonicBySid(this.memonic.sid, {
      title: this.result.title || this.memonic.title,
      summary: this.result.summary || this.memonic.summary,
      tags: this.result.tags.length ? this.result.tags : this.memonic.tags,
      suggestionBehavior: {
        ...this.memonic.suggestionBehavior,
        triggerKeywords: this.result.triggers.length
          ? this.result.triggers
          : this.memonic.suggestionBehavior?.triggerKeywords || [],
      },
    });

    new Notice("Memonic updated inside callout");
    this.view.render();
    this.close();
  }

  private async writeAboveCallout(text: string): Promise<void> {
    const suggestionText = text.trim();
    if (!suggestionText || !this.memonic.sourceFile) {
      this.close();
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(this.memonic.sourceFile);
    if (!(file instanceof TFile)) {
      new Notice("Source file not found");
      this.close();
      return;
    }

    const content = await this.app.vault.read(file);

    const lines = content.split("\n");
    const insertIdx = findCalloutStartBySid(lines, this.memonic.sid);

    if (insertIdx === -1) {
      new Notice("Could not find callout in source file");
      this.close();
      return;
    }

    const commentLines = suggestionText
      .split("\n")
      .map((l) => (l.startsWith("> ") ? l : `> AI: ${l}`));
    const newLines = [
      ...lines.slice(0, insertIdx),
      ...commentLines,
      ...lines.slice(insertIdx),
    ];

    await this.app.vault.modify(file, newLines.join("\n"));
    new Notice("Suggestion applied above callout");
    this.view.render();
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class SmileyModal extends Modal {
  private parsed: { title: string; summary: string } | null =
    null;

  constructor(
    app: App,
    private aiResponse: string,
    private memonic: Memonic,
    private plugin: Plugin,
    private view: { render: () => void },
  ) {
    super(app);
    try {
      const cleaned = this.aiResponse
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      const p = JSON.parse(cleaned);
      this.parsed =
        p && typeof p === "object"
          ? {
              title: typeof p.title === "string" ? p.title : "",
              summary: typeof p.summary === "string" ? p.summary : "",
            }
          : null;
    } catch {
      this.parsed = null;
    }
  }

  onOpen(): void {
    const { contentEl } = this;

    if (!this.parsed) {
      contentEl.createEl("h2", { text: "AI Response (raw)" });
      const ta = contentEl.createEl("textarea");
      ta.style.width = "100%";
      ta.style.minHeight = "150px";
      ta.style.marginBottom = "12px";
      ta.value = this.aiResponse;
      new Setting(contentEl).addButton((b) =>
        b.setButtonText("Close").onClick(() => this.close()),
      );
      return;
    }

    contentEl.createEl("h2", {
      text: `:) Suggestions for "${this.memonic.title}"`,
    });

    let title = this.parsed.title;
    let summary = this.parsed.summary;

    new Setting(contentEl).setName("Title").addText((cb) =>
      cb.setValue(title).onChange((v) => {
        title = v;
      }),
    );

    new Setting(contentEl).setName("Summary").addTextArea((cb) =>
      cb.setValue(summary).onChange((v) => {
        summary = v;
      }),
    );

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    btnRow.style.display = "flex";
    btnRow.style.flexWrap = "wrap";
    btnRow.style.gap = "8px";
    btnRow.style.justifyContent = "flex-end";

    btnRow
      .createEl("button", { text: "Write above callout", cls: "mod-cta" })
      .addEventListener("click", async () => {
        const parts: string[] = [];
        parts.push(`- **${title}**: ${summary}`);
        const text = parts.join("\n");
        if (!text) {
          this.close();
          return;
        }
        await this.writeAboveCallout(text);
      });

    const replaceBtn = btnRow.createEl("button", { text: "Replace memonic" });
    replaceBtn.style.borderColor = "var(--color-accent)";
    replaceBtn.addEventListener("click", async () => {
      if (this.memonic.sourceFile) {
        const file = this.app.vault.getAbstractFileByPath(
          this.memonic.sourceFile,
        );
        if (file instanceof TFile) {
          const content = await this.app.vault.read(file);
          const lines = content.split("\n");

          const calloutStart = findCalloutStartBySid(lines, this.memonic.sid);

          if (calloutStart === -1) {
            new Notice("Callout not found");
            this.close();
            return;
          }

          // Determine the callout block boundary (first non-quoted line).
          let blockEnd = calloutStart + 1;
          while (blockEnd < lines.length && lines[blockEnd].startsWith(">"))
            blockEnd++;

          // 1. Replace title
          const typeMatch = lines[calloutStart].match(
            /^>\s*\[!memonic\|(\w+)\]/,
          );
          if (typeMatch) {
            lines[calloutStart] = `> [!memonic|${typeMatch[1]}] ${title}`;
          }

          // 2. Insert or replace a SINGLE Summary line below the metadata and
          //    above the body text (replaces any prior summary — no stacking).
          const upserted = upsertCalloutSummary(lines, calloutStart, summary);
          lines.length = 0;
          lines.push(...upserted);

          await this.app.vault.modify(file, lines.join("\n"));
        }
      }

      updateMemonicBySid(this.memonic.sid, {
        title: title || this.memonic.title,
        summary: summary || this.memonic.summary,
      });
      new Notice(`Memonic "${title}" updated`);
      this.view.render();
      this.close();
    });

    btnRow
      .createEl("button", { text: "Ignore" })
      .addEventListener("click", () => this.close());
  }

  private async writeAboveCallout(text: string): Promise<void> {
    if (!this.memonic.sourceFile) {
      this.close();
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(this.memonic.sourceFile);
    if (!(file instanceof TFile)) {
      new Notice("Source file not found");
      this.close();
      return;
    }

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    const calloutStart = findCalloutStartBySid(lines, this.memonic.sid);

    if (calloutStart === -1) {
      new Notice("Callout not found in file");
      this.close();
      return;
    }

    const commentLines = text.split("\n");
    await this.app.vault.modify(
      file,
      [
        ...lines.slice(0, calloutStart),
        ...commentLines,
        "",
        ...lines.slice(calloutStart),
      ].join("\n"),
    );

    new Notice("Suggestion written above callout");
    this.view.render();
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class MemonicSuggestModal extends FuzzySuggestModal<Memonic> {
  constructor(app: App) {
    super(app);
    this.setPlaceholder("Search memonics to insert as reference...");
  }

  getItems(): Memonic[] {
    return getAllMemonics().filter((m) => m.status === "active");
  }

  getItemText(item: Memonic): string {
    return `${item.title} [${item.type}] ${item.tags.join(", ")}`;
  }

  onChooseItem(item: Memonic): void {
    const callout = formatMemonicCallout(item);
    const text = `\n\n\`\`\`memonic-ref\n${callout}\n\`\`\`\n\n`;
    const editor = this.app.workspace.activeEditor?.editor;
    if (editor) {
      editor.replaceSelection(text);
    }
  }
}
