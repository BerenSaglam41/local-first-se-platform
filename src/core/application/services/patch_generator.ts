import { ParsedBlock } from './response_parser';

export interface FilePatch {
  fileName: string;
  newContent: string;
}

export interface PatchGenerationResult {
  success: boolean;
  patches: FilePatch[];
  error?: string;
}

export class PatchGenerator {
  generatePatches(blocks: ParsedBlock[], workspaceFiles: string[]): PatchGenerationResult {
    const patches: FilePatch[] = [];

    for (const block of blocks) {
      if (!block.fileName) {
        return {
          success: false,
          patches: [],
          error: 'Cannot apply patch: Code block lacks an associated file name.',
        };
      }

      // Check if file is explicitly allowed by the task
      const matchedFile = workspaceFiles.find(
        (allowedFile) => allowedFile === block.fileName || allowedFile.endsWith(block.fileName!)
      );

      if (!matchedFile) {
        return {
          success: false,
          patches: [],
          error: `Refusing to modify file [${block.fileName}] not present in workspaceFiles.`,
        };
      }

      const cleanedContent = this.cleanCodeContent(block.content);

      patches.push({
        fileName: matchedFile,
        newContent: cleanedContent,
      });
    }

    return {
      success: patches.length > 0,
      patches,
    };
  }

  private cleanCodeContent(code: string): string {
    return code.trim();
  }
}
