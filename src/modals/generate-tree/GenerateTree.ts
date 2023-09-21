import { SettingsTab } from "#/SettingsTab";
import { filter, getFilter } from "#/utils/filter";
import { explorerEntityToCallout, filesToExplorerEntity } from "#/utils/parser";
import { getFiles } from "#/utils/path";
import { dialog } from "@electron/remote";
import type { App, Editor } from "obsidian";
import type { TextAreaComponent } from "obsidian";
import { normalizePath } from "obsidian";
import { Modal, Notice, Platform, Setting } from "obsidian";
import { sep } from "path";

export class GenerateTree extends Modal {

  private editor: Editor;

  private useIgnore = true;

  private readonly separator = "/";

  private filesInput = "";

  private filesTextArea!: TextAreaComponent;

  constructor(app: App, editor: Editor) {
    super(app);
    this.editor = editor;
    this.titleEl.textContent = "Generate file tree";
  }

  public onOpen = (): void => {
    const { contentEl } = this;

    this.loadConfigSection(contentEl);
    this.loadFilesSection(contentEl);
    this.loadGenerateSection(contentEl);
  };


  private loadConfigSection = (contentEl: HTMLElement): void => {
    new Setting(contentEl)
      .setHeading()
      .setName("Use ignore config")
      .setDesc("filter entries with the ingore configuration in settings")
      .addExtraButton(
        (button) => button
          .setTooltip("Open plugin settings")
          .onClick(() => {
            this.app.setting.open();
            this.app.setting.openTabById("file-tree-generator");
          })
      )
      .addToggle(
        (toggle) => toggle
          .setValue(this.useIgnore)
          .onChange((value) => {
            this.useIgnore = value;
          })
      );
  };

  private loadFilesSection = (contentEl: HTMLElement): void => {
    const filesField = new Setting(contentEl);
    filesField.infoEl.style.flexGrow = "0";

    if (Platform.isDesktop) {
      filesField.addExtraButton(
        (button) => button
          .setIcon("upload")
          .setTooltip("Import files from folder")
          .onClick(async() => {
            const dialogResponse = await dialog.showOpenDialog({
              properties: ["openDirectory"]
            });

            if (dialogResponse.canceled) return;

            const notice = new Notice("", 0);
            let showNotice = true;

            void (async() => {
              let dotCount = 0;

              while (showNotice) {
                notice.setMessage(`🔎 Loading${".".repeat(dotCount)}`);
                await sleep(400);

                dotCount++;
                dotCount = dotCount % 4;
              }
            })();

            const selectedPath = dialogResponse.filePaths[0];
            const removePath = selectedPath.substring(0, selectedPath.lastIndexOf(sep) + sep.length);
            let files: string[];

            try {
              files = (await getFiles(
                selectedPath,
                this.useIgnore ? getFilter(SettingsTab.getInstance().settings.ignore) : null,
                removePath
              ));
            } catch (error) {
              showNotice = false;
              notice.hide();

              if (!(error instanceof Error)) {
                new Notice("❌ error while scanning directory");
                return;
              }

              new Notice(`❌ error while scanning directory:\n${error.message}}`);
              return;
            }

            showNotice = false;
            notice.hide();
            this.filesInput = files.join("\n");
            this.filesTextArea.setValue(this.filesInput);
          })
      );
    }

    filesField
      .setName("Files paths")
      .addTextArea(
        (text) => {
          this.filesTextArea = text;
          text.inputEl.rows = 8;
          text.inputEl.style.width = "100%";

          return text
            .setPlaceholder("my-folder/toto/titi/hey.md\nmy-folder/tutu/my-video.mp4")
            .onChange((value) => {
              this.filesInput = value;
            });
        }
      );
  };

  private loadGenerateSection = (contentEl: HTMLElement): void => {
    new Setting(contentEl)
      .setHeading()
      .addButton((btn) => btn
        .setButtonText("⚙ Generate")
        .setCta()
        .onClick(() => {
          if (this.filesInput.trim() === "") {
            new Notice("❌ no path has been entered");
            return;
          }

          const filesInput = this.filesInput.split("\n").map(path => normalizePath(path));
          let files: string[];

          if (this.useIgnore) {
            files = filter(filesInput, SettingsTab.getInstance().settings.ignore);
          } else {
            files = filesInput;
          }

          const structure = filesToExplorerEntity(files, this.separator);
          const callouts = explorerEntityToCallout(structure);
          const cursorLine = this.editor.getCursor("head").line;

          this.editor.setLine(
            cursorLine,
            `${this.editor.getLine(cursorLine)}\n\n${callouts}`
          );

          this.close();
        }));
  };

  public onClose = (): void => {
    const { contentEl } = this;
    contentEl.empty();
  };

}