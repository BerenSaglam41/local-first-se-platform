export interface ParsedFileBlock {
  relativePath: string;
  content: string;
}

export interface ExecutionResponseParseResult {
  files: ParsedFileBlock[];
  hasStructuredOutput: boolean;
}

const FENCE_REGEX = /```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n[ \t]*```/g;
const FILE_HEADER_REGEX = /^[ \t]*(?:\/\/|#|\/\*+|<!--)\s*FILE:\s*([^\r\n*]+?)\s*(?:-->|\*+\/)?\s*$/im;

/**
 * Extracts real file mutations from a provider's raw reasoning output. Providers are
 * instructed (see WorkerExecutionEngine's code-generation prompt) to declare each file's
 * destination on the first line of its fenced block via a `// FILE: relative/path` header.
 * Responses without any such header (prose, refusals, unavailable-provider errors) yield
 * hasStructuredOutput: false so callers can fall back honestly instead of fabricating files.
 */
export class ExecutionResponseParser {
  parse(responseText: string): ExecutionResponseParseResult {
    const files: ParsedFileBlock[] = [];
    if (!responseText || !responseText.trim()) {
      return { files, hasStructuredOutput: false };
    }

    let match: RegExpExecArray | null;
    FENCE_REGEX.lastIndex = 0;
    while ((match = FENCE_REGEX.exec(responseText)) !== null) {
      const blockBody = match[1];
      const headerMatch = blockBody.match(FILE_HEADER_REGEX);
      if (!headerMatch) continue;

      const relativePath = this.sanitizePath(headerMatch[1].trim());
      if (!relativePath) continue;

      const content = blockBody.replace(FILE_HEADER_REGEX, '').replace(/^\r?\n/, '').trimEnd() + '\n';
      files.push({ relativePath, content });
    }

    return { files, hasStructuredOutput: files.length > 0 };
  }

  private sanitizePath(rawPath: string): string | null {
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
    if (!normalized) return null;
    if (normalized.startsWith('/') || normalized.includes('..')) return null;
    return normalized;
  }
}
