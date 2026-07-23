import { ICodeSliceEngine } from '../../core/domain/interfaces/icode_slice_engine';

export class CodeSliceEngine implements ICodeSliceEngine {
  extractSlice(content: string, startLine: number, endLine: number): string {
    const lines = content.split(/\r?\n/);
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, endLine);
    return lines.slice(start, end).join('\n');
  }

  attachComments(content: string, symbolStartLine: number): string | undefined {
    const lines = content.split(/\r?\n/);
    const targetIndex = symbolStartLine - 1; // 0-indexed start of the symbol
    if (targetIndex <= 0) return undefined;

    const commentLines: string[] = [];
    let inBlockComment = false;

    for (let i = targetIndex - 1; i >= 0; i--) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (trimmed.endsWith('*/')) {
        inBlockComment = true;
        commentLines.unshift(rawLine);
        if (trimmed.startsWith('/*')) {
          inBlockComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        commentLines.unshift(rawLine);
        if (trimmed.startsWith('/*')) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmed.startsWith('//')) {
        commentLines.unshift(rawLine);
        continue;
      }

      // If it's not a comment line, stop collecting
      break;
    }

    return commentLines.length > 0 ? commentLines.join('\n') : undefined;
  }
}
