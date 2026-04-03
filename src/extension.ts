import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerHoverProvider('*', {
    async provideHover(document, position) {
      const md = new vscode.MarkdownString();
      md.isTrusted = true;

      // -------------------------
      // 1. PATH HOVER
      // -------------------------
      const range =
        document.getWordRangeAtPosition(position, /['"`](.*?)['"`]/) ||
        document.getWordRangeAtPosition(position, /[\w\-\/\.@]+/);

      if (range) {
        let raw = document.getText(range).replace(/['"`]/g, '');

        const resolved = resolveFilePath(raw, document);

        if (resolved) {
          const preview = getFilePreview(resolved, 10);
          const uri = vscode.Uri.file(resolved);
          const fileName = path.basename(resolved);

          const openCmd = `command:vscode.open?${encodeURIComponent(
            JSON.stringify([uri.toString()])
          )}`;

          const splitCmd = `command:vscode.open?${encodeURIComponent(
            JSON.stringify([uri.toString(), { viewColumn: 2 }])
          )}`;

          md.appendMarkdown(`$(file) **${fileName}**\n\n`);
          md.appendMarkdown(`[🔗 Open File](${openCmd})\n\n`);
          md.appendMarkdown(`[🪟 Open in Split](${splitCmd})\n\n`);
          md.appendMarkdown(`\`${resolved}\`\n\n`);

          if (preview) {
            md.appendMarkdown(`---\n👀 **Preview**\n`);
            md.appendCodeblock(preview, detectLanguage(resolved));
          }
        }
      }

      // -------------------------
      // 2. JS/TS DEFINITIONS
      // -------------------------
      let hasDefinitions = false;

      try {
        const locations = await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeDefinitionProvider',
          document.uri,
          position
        );

        if (locations && locations.length > 0) {
          hasDefinitions = true;

          md.appendMarkdown(`---\n`);
          md.appendMarkdown(`📍 **Definitions:**\n\n`);

          locations.slice(0, 5).forEach((loc) => {
            const filePath = loc.uri.fsPath;
            const fileName = path.basename(filePath);
            const line = loc.range.start.line + 1;

            const openCmd = `command:vscode.open?${encodeURIComponent(
              JSON.stringify([
                loc.uri.toString(),
                { selection: loc.range }
              ])
            )}`;

            md.appendMarkdown(
              `• [${fileName}:${line}](${openCmd}) — \`${filePath}\`\n`
            );
          });

          if (locations.length > 5) {
            md.appendMarkdown(`\n_+${locations.length - 5} more..._\n`);
          }
        }
      } catch (err) { }

      // -------------------------
      // 3. RUBY / RAILS FALLBACK 🔥
      // -------------------------
      if (!hasDefinitions && document.languageId === 'ruby') {
        const wordRange = document.getWordRangeAtPosition(position);
        if (wordRange) {
          const word = document.getText(wordRange);

          try {
            const files = await vscode.workspace.findFiles('**/*.rb');

            const matches: { file: string; line: number }[] = [];

            for (const file of files.slice(0, 50)) { // limit for performance
              const content = fs.readFileSync(file.fsPath, 'utf-8');
              const lines = content.split('\n');

              lines.forEach((lineText: any, index: number) => {
                if (
                  lineText.includes(`def ${word}`) ||
                  lineText.includes(`class ${word}`) ||
                  lineText.includes(`module ${word}`)
                ) {
                  matches.push({
                    file: file.fsPath,
                    line: index + 1
                  });
                }
              });
            }

            if (matches.length > 0) {
              md.appendMarkdown(`---\n`);
              md.appendMarkdown(`📍 **Rails Definitions:**\n\n`);

              matches.slice(0, 5).forEach((m) => {
                const uri = vscode.Uri.file(m.file);

                const openCmd = `command:vscode.open?${encodeURIComponent(
                  JSON.stringify([
                    uri.toString(),
                    {
                      selection: new vscode.Range(
                        new vscode.Position(m.line - 1, 0),
                        new vscode.Position(m.line - 1, 0)
                      )
                    }
                  ])
                )}`;

                const fileName = path.basename(m.file);

                md.appendMarkdown(
                  `• [${fileName}:${m.line}](${openCmd}) — \`${m.file}\`\n`
                );
              });

              if (matches.length > 5) {
                md.appendMarkdown(`\n_+${matches.length - 5} more..._\n`);
              }
            }
          } catch (err) { }
        }
      }

      if (md.value.trim().length === 0) return;

      return new vscode.Hover(md);
    }
  });

  const definitionProvider = vscode.languages.registerDefinitionProvider('*', {
    provideDefinition(document, position) {
      const range =
        document.getWordRangeAtPosition(position, /['"`](.*?)['"`]/) ||
        document.getWordRangeAtPosition(position, /[\w\-\/\.@]+/);

      if (!range) return;

      let raw = document.getText(range);
      raw = raw.replace(/['"`]/g, '');

      const resolved = resolveFilePath(raw, document);
      if (!resolved) return;

      const uri = vscode.Uri.file(resolved);

      // 👇 This enables Cmd/Ctrl + Click navigation
      return new vscode.Location(uri, new vscode.Position(0, 0));
    }
  });

  context.subscriptions.push(definitionProvider);

  context.subscriptions.push(provider);

  // console.log('PathPeek activated 🚀');
}

export function deactivate() { }


// ---------------- HELPERS ----------------

const EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.rb'];

function resolveFilePath(input: string, document: vscode.TextDocument): string | null {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const dir = path.dirname(document.uri.fsPath);

  const candidates: string[] = [];

  // Relative paths
  candidates.push(path.resolve(dir, input));

  // Workspace root (Rails-style / absolute-like)
  if (workspace) {
    candidates.push(path.join(workspace, input));
  }

  // Alias (@/)
  if (workspace && input.startsWith('@/')) {
    candidates.push(path.join(workspace, input.replace('@/', 'src/')));
  }

  for (const base of candidates) {
    // Direct file
    for (const ext of EXTENSIONS) {
      const full = base.endsWith(ext) ? base : base + ext;
      if (fs.existsSync(full)) return full;
    }

    // Index file
    for (const ext of EXTENSIONS) {
      const indexPath = path.join(base, `index${ext}`);
      if (fs.existsSync(indexPath)) return indexPath;
    }
  }

  return null;
}

function getFilePreview(filePath: string, lines = 10): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').slice(0, lines).join('\n');
  } catch {
    return null;
  }
}

function detectLanguage(filePath: string): string {
  if (filePath.endsWith('.ts')) return 'typescript';
  if (filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.js')) return 'javascript';
  if (filePath.endsWith('.jsx')) return 'javascript';
  if (filePath.endsWith('.rb')) return 'ruby';
  return '';
}