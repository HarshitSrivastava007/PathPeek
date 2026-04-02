import * as fs from 'fs';

export async function getFilePreview(filePath: string, lines = 10): Promise<string | null> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').slice(0, lines).join('\n');
  } catch {
    return null;
  }
}