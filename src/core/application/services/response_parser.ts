import * as path from 'path';

export interface ParsedBlock {
  fileName?: string;
  content: string;
  language?: string;
}

export interface ParsingResult {
  success: boolean;
  blocks: ParsedBlock[];
  warnings: string[];
}

export class ResponseParser {
  parse(response: string, workspaceFiles: string[], defaultFile: string): ParsingResult {
    const blocks: ParsedBlock[] = [];
    const warnings: string[] = [];

    // Robust regex supporting leading whitespace and CRLF (Windows) newlines
    const regex = /[ \t]*```([a-zA-Z0-9-]*)\r?\n([\s\S]*?)\r?\n[ \t]*```/g;
    let match;
    let hasBlocks = false;

    const parts = response.split(/[ \t]*```[a-zA-Z0-9-]*\r?\n[\s\S]*?\r?\n[ \t]*```/);
    regex.lastIndex = 0;
    let i = 0;
    while ((match = regex.exec(response)) !== null) {
      hasBlocks = true;
      const lang = match[1];
      const code = match[2];
      const contextText = parts[i] || '';
      i++;

      const detectedFile = this.detectFile(contextText, code, workspaceFiles);
      blocks.push({
        fileName: detectedFile,
        content: code,
        language: lang,
      });
    }

    if (!hasBlocks && response.trim().length > 0) {
      const code = response.trim();
      const detectedFile = this.detectFile('', code, workspaceFiles) || defaultFile;
      blocks.push({
        fileName: detectedFile,
        content: code,
      });
    }

    const protectedFiles = [
      'package.json', 'package-lock.json', 'tsconfig.json',
      'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
      'Dockerfile', 'docker-compose.yml', '.gitignore',
    ];

    for (const block of blocks) {
      if (!block.fileName) {
        if (defaultFile && !protectedFiles.includes(path.basename(defaultFile))) {
          block.fileName = defaultFile;
        } else {
          warnings.push('Could not associate code block with an explicit file header.');
        }
      }
    }

    return {
      success: blocks.length > 0,
      blocks,
      warnings,
    };
  }

  private detectFile(contextText: string, code: string, workspaceFiles: string[]): string | undefined {
    const fileHeaderRegex = /[#//*\s]+FILE:\s*([a-zA-Z0-9_\-\.\/\\:]+)/i;
    const match = code.match(fileHeaderRegex);

    if (match && match[1]) {
      const rawPath = match[1].trim();
      const matchedName = path.basename(rawPath);
      const found = workspaceFiles.find(f => f.endsWith(rawPath) || path.basename(f) === matchedName);
      if (found) return found;
      return rawPath;
    }

    // Do NOT infer filenames from conversational contextText or fuzzy strings
    return undefined;
  }
}
