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
      let code = match[2];
      const contextText = parts[i] || '';
      i++;

      const detectedFile = this.detectFile(contextText, code, workspaceFiles);
      code = this.sanitizeCodeContent(code);

      blocks.push({
        fileName: detectedFile,
        content: code,
        language: lang,
      });
    }

    if (!hasBlocks && response.trim().length > 0) {
      let code = response.trim();
      const detectedFile = this.detectFile('', code, workspaceFiles) || defaultFile;
      code = this.sanitizeCodeContent(code);
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

  /**
   * Sanitizes code content by stripping leading // FILE: comments and any conversational
   * prose prepended by the LLM before valid source code keywords.
   */
  private sanitizeCodeContent(code: string): string {
    const lines = code.split('\n');

    // 1. Remove leading // FILE: header comments
    let startIndex = 0;
    while (startIndex < lines.length && /^\s*(?:\/\/|#|\/\*)\s*FILE:/i.test(lines[startIndex])) {
      startIndex++;
    }

    // 2. Find first line starting with valid source code syntax or comment
    const VALID_CODE_START = /^\s*(?:import|export|class|interface|type|enum|function|const|let|var|module|namespace|describe|test|it|expect|require|\/\*|\/\/|#|\/\*\*|'use strict'|"use strict"|\{|\}|\[|\@)/;

    let validCodeIndex = startIndex;
    for (let idx = startIndex; idx < lines.length; idx++) {
      const line = lines[idx];
      // Skip empty lines
      if (!line.trim()) continue;

      if (VALID_CODE_START.test(line)) {
        validCodeIndex = idx;
        break;
      }
    }

    return lines.slice(validCodeIndex).join('\n').trim();
  }
}
