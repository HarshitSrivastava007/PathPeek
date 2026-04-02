import * as vscode from 'vscode';
import { resolveFilePath } from './resolver';
import { getFilePreview } from './preview';

export function activate(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerHoverProvider('*', {
    async provideHover(document, position) {
      const config = vscode.workspace.getConfiguration('hoverPath');

      if (!config.get('enabled')) {
        return;
      }

      const range = document.getWordRangeAtPosition(position, /['"`](.*?)['"`]/);
      if (!range) {
        return;
      }

      const raw = document.getText(range).replace(/['"`]/g, '');

      const resolved = await resolveFilePath(raw, document);
      if (!resolved) {
        return;
      }

      const preview = await getFilePreview(resolved, config.get('previewLines'));

      const md = new vscode.MarkdownString(undefined, true);
      md.isTrusted = true;

      md.appendMarkdown(`📂 **Full Path**\n\n`);
      md.appendCodeblock(resolved);

      md.appendMarkdown(
        `\n🔗 [Open File](command:vscode.open?${encodeURIComponent(
          JSON.stringify(vscode.Uri.file(resolved))
        )})\n\n`
      );

      if (preview) {
        md.appendMarkdown(`---\n👀 **Preview**\n`);
        md.appendCodeblock(preview);
      }

      return new vscode.Hover(md);
    }
  });

  context.subscriptions.push(provider);
}

export function deactivate() {}