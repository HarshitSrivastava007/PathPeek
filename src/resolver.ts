import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { cache } from './cache';

const EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.rb'];

export async function resolveFilePath(input: string, document: vscode.TextDocument): Promise<string | null> {
  if (cache.has(input)) {return cache.get(input)!;}

  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const dir = path.dirname(document.uri.fsPath);

  const candidates: string[] = [];

  // relative paths
  candidates.push(path.resolve(dir, input));

  // workspace root (Rails / absolute-like)
  if (workspace) {
    candidates.push(path.join(workspace, input));
  }

  // alias (@/)
  if (workspace && input.startsWith('@/')) {
    candidates.push(path.join(workspace, input.replace('@/', 'src/')));
  }

  for (const base of candidates) {
    for (const ext of EXTENSIONS) {
      const full = base + ext;
      if (fs.existsSync(full)) {
        cache.set(input, full);
        return full;
      }
    }

    // index file support
    for (const ext of EXTENSIONS) {
      const indexPath = path.join(base, `index${ext}`);
      if (fs.existsSync(indexPath)) {
        cache.set(input, indexPath);
        return indexPath;
      }
    }
  }

  return null;
}