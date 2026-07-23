import { ResponseParser } from '../src/core/application/services/response_parser';
import { PatchGenerator } from '../src/core/application/services/patch_generator';
import { WorkspaceUpdater } from '../src/core/application/services/workspace_updater';
import * as fs from 'fs';
import * as path from 'path';

describe('Code Modification Pipeline', () => {
  const testWorkspaceDir = path.join(__dirname, 'temp_pipeline_test');

  beforeEach(() => {
    if (fs.existsSync(testWorkspaceDir)) {
      fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testWorkspaceDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testWorkspaceDir)) {
      fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
    }
  });

  describe('ResponseParser', () => {
    const parser = new ResponseParser();

    it('should parse fenced markdown code blocks and associate with file name', () => {
      const response = `
        Before text.
        \`\`\`typescript
        // FILE: math_helper.ts
        export class MathHelper {}
        \`\`\`
        After text.
      `;
      const result = parser.parse(response, ['math_helper.ts'], 'math_helper.ts');
      expect(result.success).toBe(true);
      expect(result.blocks.length).toBe(1);
      expect(result.blocks[0].content).toContain('export class MathHelper');
      expect(result.blocks[0].fileName).toBe('math_helper.ts');
    });

    it('should fallback to plain source code when no fenced blocks exist', () => {
      const response = 'export class MathHelper {}';
      const result = parser.parse(response, ['math_helper.ts'], 'math_helper.ts');
      expect(result.success).toBe(true);
      expect(result.blocks.length).toBe(1);
      expect(result.blocks[0].content).toBe('export class MathHelper {}');
      expect(result.blocks[0].fileName).toBe('math_helper.ts');
    });

    it('should extract multiple code blocks', () => {
      const response = `
        \`\`\`typescript
        // FILE: a.ts
        const a = 1;
        \`\`\`
        \`\`\`typescript
        // FILE: b.ts
        const b = 2;
        \`\`\`
      `;
      const result = parser.parse(response, ['a.ts', 'b.ts'], 'a.ts');
      expect(result.success).toBe(true);
      expect(result.blocks.length).toBe(2);
      expect(result.blocks[0].fileName).toBe('a.ts');
      expect(result.blocks[1].fileName).toBe('b.ts');
    });
  });

  describe('PatchGenerator & WorkspaceUpdater', () => {
    const patchGenerator = new PatchGenerator();
    const updater = new WorkspaceUpdater();

    it('should generate patches only for allowed workspace files', () => {
      const blocks = [
        { fileName: 'allowed.ts', content: 'const x = 1;' },
        { fileName: 'disallowed.ts', content: 'const y = 2;' },
      ];
      const patchResult = patchGenerator.generatePatches(blocks, ['allowed.ts']);
      expect(patchResult.success).toBe(false);
      expect(patchResult.error).toContain('Refusing to modify file');
    });

    it('should successfully write patches to the filesystem and skip writing if content matches', () => {
      const targetFile = path.join(testWorkspaceDir, 'test.ts');
      const blocks = [
        { fileName: targetFile, content: 'const x = 1;' }
      ];

      const patchResult = patchGenerator.generatePatches(blocks, [targetFile]);
      expect(patchResult.success).toBe(true);

      const updateResult = updater.update(patchResult.patches);
      expect(updateResult.success).toBe(true);
      expect(updateResult.modifiedFiles).toContain(targetFile);
      expect(updateResult.filesSkipped.length).toBe(0);
      expect(fs.readFileSync(targetFile, 'utf8')).toBe('const x = 1;');

      const updateResult2 = updater.update(patchResult.patches);
      expect(updateResult2.success).toBe(true);
      expect(updateResult2.modifiedFiles.length).toBe(0);
      expect(updateResult2.filesSkipped).toContain(targetFile);
    });
  });
});
