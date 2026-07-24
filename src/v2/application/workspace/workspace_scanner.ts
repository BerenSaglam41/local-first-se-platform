import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceFileInfo {
  path: string;
  relativePath: string;
  lines: number;
  bytes: number;
  contentSnippet: string;
}

export interface WorkspaceScanResult {
  workspacePath: string;
  fileCount: number;
  totalLines: number;
  totalBytes: number;
  treeAscii: string;
  files: WorkspaceFileInfo[];
}

export class WorkspaceScanner {
  static scan(workspacePath: string): WorkspaceScanResult {
    const files: WorkspaceFileInfo[] = [];
    let fileCount = 0;
    let totalLines = 0;
    let totalBytes = 0;

    if (!fs.existsSync(workspacePath)) {
      return {
        workspacePath,
        fileCount: 0,
        totalLines: 0,
        totalBytes: 0,
        treeAscii: '(Directory not found)',
        files: [],
      };
    }

    function walkDir(dir: string, indent: string = ''): string {
      let ascii = '';
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      const filtered = entries.filter(
        (e) => !e.name.startsWith('.') && e.name !== 'node_modules'
      );

      filtered.forEach((entry, idx) => {
        const isLast = idx === filtered.length - 1;
        const pointer = isLast ? '└── ' : '├── ';
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(workspacePath, fullPath);

        if (entry.isDirectory()) {
          ascii += `${indent}${pointer}${entry.name}/\n`;
          ascii += walkDir(fullPath, indent + (isLast ? '    ' : '│   '));
        } else {
          ascii += `${indent}${pointer}${entry.name}\n`;
          fileCount++;

          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const bytes = fs.statSync(fullPath).size;
            const lines = content.split('\n').length;

            totalBytes += bytes;
            totalLines += lines;

            files.push({
              path: fullPath,
              relativePath: relPath,
              lines,
              bytes,
              contentSnippet: content.slice(0, 500),
            });
          } catch (err) {
            // Ignored binary files
          }
        }
      });

      return ascii;
    }

    const treeAscii = `${path.basename(workspacePath)}/\n` + walkDir(workspacePath);

    return {
      workspacePath,
      fileCount,
      totalLines,
      totalBytes,
      treeAscii,
      files,
    };
  }
}
