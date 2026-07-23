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

    for (const block of blocks) {
      if (!block.fileName) {
        if (workspaceFiles.length === 1) {
          block.fileName = workspaceFiles[0];
        } else if (defaultFile) {
          block.fileName = defaultFile;
        } else {
          warnings.push('Could not associate code block with a specific workspace file.');
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
    const commentRegexes = [
      /[#//*\s]+FILE:\s*([a-zA-Z0-9_\-\.\/\\:]+)/i,
      /[#//*\s]+([a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)/
    ];

    for (const r of commentRegexes) {
      const match = code.match(r);
      if (match && match[1]) {
        const matchedName = path.basename(match[1].trim());
        const found = workspaceFiles.find(f => path.basename(f) === matchedName);
        if (found) return found;
      }
    }

    for (const file of workspaceFiles) {
      const base = path.basename(file);
      if (contextText.includes(base)) {
        return file;
      }
    }

    return undefined;
  }
}
