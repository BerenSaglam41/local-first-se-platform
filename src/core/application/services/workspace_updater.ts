import * as fs from 'fs';
import * as path from 'path';
import { FilePatch } from './patch_generator';

export interface UpdateResult {
  modifiedFiles: string[];
  filesSkipped: string[];
  success: boolean;
  error?: string;
}

export class WorkspaceUpdater {
  update(patches: FilePatch[]): UpdateResult {
    const modifiedFiles: string[] = [];
    const filesSkipped: string[] = [];

    try {
      for (const patch of patches) {
        const filePath = patch.fileName;

        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        let currentContent = '';
        if (fs.existsSync(filePath)) {
          currentContent = fs.readFileSync(filePath, 'utf8').trim();
        }

        if (currentContent === patch.newContent) {
          filesSkipped.push(filePath);
          continue;
        }

        fs.writeFileSync(filePath, patch.newContent, 'utf8');
        modifiedFiles.push(filePath);
      }

      return {
        modifiedFiles,
        filesSkipped,
        success: true,
      };
    } catch (err: any) {
      return {
        modifiedFiles,
        filesSkipped,
        success: false,
        error: `Workspace update crashed: ${err.message || err}`,
      };
    }
  }
}
