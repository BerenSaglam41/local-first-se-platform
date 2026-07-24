import { ITaskPlanner } from '../../domain/interfaces/itask_planner';
import { TaskPlan, SubTask, SubTaskStatus, TargetSelectionBasis } from '../../domain/models/execution';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Protected configuration / manifest files.
// These files are NEVER selected as implementation targets by automatic
// inference. They may only be selected if the user explicitly writes the
// exact filename in their prompt.
// ─────────────────────────────────────────────────────────────────────────────
const PROTECTED_BASENAMES = new Set([
  // Jest / test-runner configs
  'jest.config.js', 'jest.config.ts', 'jest.config.cjs', 'jest.config.mjs',
  'jest.setup.js', 'jest.setup.ts',
  'vitest.config.js', 'vitest.config.ts',
  // TypeScript / build
  'tsconfig.json', 'tsconfig.build.json', 'tsconfig.base.json',
  // Node / package
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  // Bundlers
  'webpack.config.js', 'webpack.config.ts', 'webpack.config.cjs',
  'vite.config.js', 'vite.config.ts',
  'rollup.config.js', 'rollup.config.ts',
  // Linters / formatters
  'eslint.config.js', 'eslint.config.cjs', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml',
  '.eslintignore', 'prettier.config.js', 'prettier.config.ts', '.prettierrc', '.prettierrc.json',
  // CI / container
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.github', '.gitlab-ci.yml',
  // Language manifests
  'Cargo.toml', 'Cargo.lock',
  'go.mod', 'go.sum',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle',
  'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt',
  'Gemfile', 'Gemfile.lock',
  // Env / git
  '.gitignore', '.gitattributes',
  '.env', '.env.local', '.env.development', '.env.production',
  // Misc project configs
  '.babelrc', 'babel.config.js', 'babel.config.json',
  '.nvmrc', '.node-version',
]);

/**
 * Returns true if the file basename is a protected config/manifest file.
 * Protected files are NEVER selected as auto-inferred targets.
 */
function isProtected(filePath: string): boolean {
  return PROTECTED_BASENAMES.has(path.basename(filePath));
}

/**
 * Returns true if the file is a source/implementation file (not a config,
 * lock, or generated file).
 */
function isSourceFile(filePath: string): boolean {
  if (isProtected(filePath)) return false;
  const ext = path.extname(filePath).toLowerCase();
  const SOURCE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.rs', '.go', '.java', '.kt', '.rb', '.cs', '.cpp', '.c', '.h',
    '.md', '.txt',
  ]);
  return SOURCE_EXTENSIONS.has(ext);
}

// ─────────────────────────────────────────────────────────────────────────────

interface SelectedFile {
  filePath: string;
  selectionBasis: TargetSelectionBasis;
  selectionReason: string;
}

export class TaskPlanner implements ITaskPlanner {
  async planTask(taskPrompt: string, workspaceFiles: string[]): Promise<TaskPlan> {
    const taskId = `plan-${Date.now()}`;

    // ── Priority 1: extract files explicitly mentioned in the prompt ──────────
    const explicit = this.extractExplicitFiles(taskPrompt, workspaceFiles);

    let selectedFiles: SelectedFile[];

    if (explicit.length > 0) {
      selectedFiles = explicit;
    } else {
      // ── Priority 2: semantic intent inference ──────────────────────────────
      const semantic = this.inferFromSemanticIntent(taskPrompt, workspaceFiles);
      if (semantic.length > 0) {
        selectedFiles = semantic;
      } else {
        // ── Priority 3: best existing source file from workspace ───────────
        const existing = this.pickBestExistingSourceFile(workspaceFiles);
        selectedFiles = existing ? [existing] : [{
          filePath: 'src/main.ts',
          selectionBasis: 'FALLBACK',
          selectionReason: 'No explicit path, semantic intent, or source file found. Defaulting to src/main.ts.',
        }];
      }
    }

    // ── Build sub-tasks in dependency order ─────────────────────────────────
    const subTasks: SubTask[] = selectedFiles.map((sf, index) => {
      const status: SubTaskStatus = 'PENDING';
      const { objective, validationCriteria } = this.deriveObjective(sf.filePath, taskPrompt);
      const dependencies = index > 0 ? [`${taskId}-step-${index}`] : [];

      return {
        id: `${taskId}-step-${index + 1}`,
        targetFile: sf.filePath,
        objective,
        dependencies,
        validationCriteria,
        status,
        selectionReason: sf.selectionReason,
        selectionBasis: sf.selectionBasis,
      };
    });

    return {
      taskId,
      originalPrompt: taskPrompt,
      subTasks,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Priority 1 — Explicit file paths mentioned in the prompt
  // ───────────────────────────────────────────────────────────────────────────

  private extractExplicitFiles(prompt: string, workspaceFiles: string[]): SelectedFile[] {
    // Match path-like tokens containing a known source extension.
    // The pattern intentionally does NOT match bare names like "jest" or "config"
    // unless they have an explicit extension.
    const fileRegex = /(?:^|[\s"'`,()])([a-zA-Z0-9_\-][a-zA-Z0-9_\-./]*\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|rb|cs|cpp|c|h|md|txt))/g;

    const results: SelectedFile[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = fileRegex.exec(prompt)) !== null) {
      const raw = match[1].trim();

      // Skip protected files — even if explicitly mentioned as part of a config
      // sentence (e.g. "configure jest.config.js"), they must be passed without
      // surrounding words that indicate configuration intent. We apply the guard
      // only when the file appears in a file-listing context.
      if (isProtected(raw)) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);

      // Resolve against workspace to find canonical path
      const resolved = this.resolveAgainstWorkspace(raw, workspaceFiles);

      results.push({
        filePath: resolved,
        selectionBasis: 'EXPLICIT_PATH',
        selectionReason: `Explicit path "${raw}" mentioned by user in prompt.`,
      });
    }

    // Sort: source/implementation files before test files before doc files
    return this.prioritySortFiles(results);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Priority 2 — Semantic intent inference
  // ───────────────────────────────────────────────────────────────────────────

  private inferFromSemanticIntent(prompt: string, workspaceFiles: string[]): SelectedFile[] {
    const results: SelectedFile[] = [];

    // Pattern: "Create/Implement/Add <Name> class/service/module/component/..."
    const entityMatch = prompt.match(
      /(?:Create|Implement|Add|Refactor|Update|Write)\s+(?:an?\s+)?([A-Za-z0-9_]+)\s+(?:class|service|module|component|helper|controller|handler|provider|repository|store|hook|util|utils)/i
    );
    if (entityMatch?.[1]) {
      const name = entityMatch[1].toLowerCase();
      const ext = this.detectPrimaryExtension(workspaceFiles);
      // Check workspace for existing match
      const existing = workspaceFiles.find(
        f => isSourceFile(f) && path.basename(f, path.extname(f)).toLowerCase() === name
      );
      const targetFile = existing || `src/${name}${ext}`;
      results.push({
        filePath: targetFile,
        selectionBasis: 'SEMANTIC_INTENT',
        selectionReason: `Inferred from action verb "Create/Implement" + entity name "${entityMatch[1]}" in prompt.`,
      });
    }

    // Pattern: "... tests for <Name>" or "Create <Name> tests"
    const testMatch = prompt.match(
      /(?:tests?|specs?|unit\s+tests?)\s+(?:for\s+)?([A-Za-z0-9_]+)|(?:Create|Add|Write)\s+([A-Za-z0-9_]+)\s+(?:tests?|specs?)/i
    );
    if (testMatch) {
      const name = (testMatch[1] || testMatch[2])?.toLowerCase();
      if (name) {
        const ext = this.detectPrimaryExtension(workspaceFiles);
        const existing = workspaceFiles.find(
          f => isSourceFile(f) && (
            f.toLowerCase().includes(`/${name}.test`) ||
            f.toLowerCase().includes(`/${name}.spec`)
          )
        );
        const targetFile = existing || `tests/${name}.test${ext}`;
        // Only add if not already added as source impl
        if (!results.some(r => r.filePath === targetFile)) {
          results.push({
            filePath: targetFile,
            selectionBasis: 'SEMANTIC_INTENT',
            selectionReason: `Inferred test file from "tests for ${name}" pattern in prompt.`,
          });
        }
      }
    }

    return results;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Priority 3 — Best existing source file from workspace
  // ───────────────────────────────────────────────────────────────────────────

  private pickBestExistingSourceFile(workspaceFiles: string[]): SelectedFile | null {
    const candidate = workspaceFiles.find(f => isSourceFile(f));
    if (!candidate) return null;
    return {
      filePath: candidate,
      selectionBasis: 'EXISTING_SOURCE',
      selectionReason: `No explicit path or semantic intent found. Selected best existing source file "${path.basename(candidate)}" from workspace.`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Sort selected files so implementation files come before test files,
   * and test files come before documentation files.
   */
  private prioritySortFiles(files: SelectedFile[]): SelectedFile[] {
    return [...files].sort((a, b) => this.fileOrder(a.filePath) - this.fileOrder(b.filePath));
  }

  private fileOrder(filePath: string): number {
    const base = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.md' || ext === '.txt') return 3;
    if (base.includes('.test.') || base.includes('.spec.') || filePath.includes('/tests/') || filePath.includes('/test/') || filePath.includes('__tests__')) return 2;
    return 1;
  }

  private resolveAgainstWorkspace(raw: string, workspaceFiles: string[]): string {
    // Check exact match in workspace
    const exactMatch = workspaceFiles.find(f => f === raw || f.endsWith('/' + raw));
    if (exactMatch) return exactMatch;
    // Return as-is if it already has a directory prefix
    if (raw.includes('/')) return raw;
    // Infer directory prefix from file type
    const base = path.basename(raw);
    if (base.includes('.test.') || base.includes('.spec.')) return `tests/${raw}`;
    return `src/${raw}`;
  }

  private deriveObjective(filePath: string, taskPrompt: string): { objective: string; validationCriteria: string } {
    const base = path.basename(filePath);
    if (base.includes('.test.') || base.includes('.spec.') || filePath.includes('/test')) {
      return {
        objective: `Add automated unit tests in ${base}`,
        validationCriteria: 'All test assertions must pass 100%.',
      };
    }
    if (base.endsWith('.md') || base.endsWith('.txt')) {
      return {
        objective: `Create documentation file ${base}`,
        validationCriteria: 'File must be created with the requested content.',
      };
    }
    if (filePath.includes('type') || filePath.includes('interface') || filePath.includes('model')) {
      return {
        objective: `Define core domain models and interfaces in ${base}`,
        validationCriteria: 'TypeScript compilation must succeed with zero syntax/type errors.',
      };
    }
    return {
      objective: `Implement logic in ${base}`,
      validationCriteria: 'Module implementation must compile and pass build checks.',
    };
  }

  private detectPrimaryExtension(workspaceFiles: string[]): string {
    if (workspaceFiles.some(f => f.endsWith('.ts') && isSourceFile(f))) return '.ts';
    if (workspaceFiles.some(f => f.endsWith('.py') && isSourceFile(f))) return '.py';
    if (workspaceFiles.some(f => f.endsWith('.rs') && isSourceFile(f))) return '.rs';
    if (workspaceFiles.some(f => f.endsWith('.go') && isSourceFile(f))) return '.go';
    if (workspaceFiles.some(f => f.endsWith('.js') && isSourceFile(f))) return '.js';
    return '.ts';
  }
}
