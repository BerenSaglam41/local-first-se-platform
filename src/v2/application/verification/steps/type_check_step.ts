import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { IVerificationStep, VerificationStepResult } from '../../../contracts/iverification_step';
import { VerificationContext, VerificationPolicy } from '../../../contracts/iverification_pipeline';

const SKIP_DIRS = new Set(['node_modules', '.git']);

function findTsFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) findTsFiles(path.join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/**
 * Real TypeScript diagnostics, not a fabricated pass. A freshly AI-generated workspace almost
 * never has its own `node_modules`/`typescript` installed yet, so full project-aware type
 * checking (cross-file resolution) usually isn't runnable there — rather than skip entirely,
 * this uses SE-OS's own bundled `typescript` compiler API to run a real, honest single-file
 * syntax check on every generated file (no install required, catches genuine syntax errors in
 * AI-generated code). It never claims to have done full cross-file type resolution it didn't do.
 */
export class TypeCheckStep implements IVerificationStep {
  name = 'TypeScriptCompilationCheck';
  category = 'TypeCheck';

  async execute(context: VerificationContext, policy?: Partial<VerificationPolicy>): Promise<VerificationStepResult> {
    const start = Date.now();
    const requireTypeCheck = policy?.requireTypeCheck ?? true;

    if (!requireTypeCheck) {
      return {
        name: this.name,
        category: this.category,
        passed: true,
        skipped: true,
        message: 'TypeScript check skipped by policy configuration.',
        errors: [],
        warnings: [],
        durationMs: Date.now() - start,
      };
    }

    const tsFiles = fs.existsSync(context.workspacePath) ? findTsFiles(context.workspacePath) : [];
    if (tsFiles.length === 0) {
      return {
        name: this.name,
        category: this.category,
        passed: true,
        skipped: true,
        message: 'TypeScript check skipped: no .ts/.tsx files found in workspace.',
        errors: [],
        warnings: [],
        durationMs: Date.now() - start,
      };
    }

    const errors: string[] = [];
    for (const filePath of tsFiles) {
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (err: any) {
        errors.push(`${filePath}: failed to read file (${err.message})`);
        continue;
      }

      const compilerOptions: ts.CompilerOptions = {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      };
      // Only set `jsx` for .tsx files — TypeScript validates this option's presence, so an
      // explicit `undefined` value for a plain .ts file still trips a compiler-option
      // diagnostic; the key must be entirely absent instead.
      if (filePath.endsWith('.tsx')) {
        compilerOptions.jsx = ts.JsxEmit.React;
      }

      const result = ts.transpileModule(content, {
        compilerOptions,
        fileName: filePath,
        reportDiagnostics: true,
      });

      for (const diagnostic of result.diagnostics || []) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        if (diagnostic.file && diagnostic.start !== undefined) {
          const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
          errors.push(`${filePath}:${line + 1}:${character + 1}: ${message}`);
        } else {
          errors.push(`${filePath}: ${message}`);
        }
      }
    }

    const passed = errors.length === 0;
    return {
      name: this.name,
      category: this.category,
      passed,
      message: passed
        ? `Real syntax check passed for ${tsFiles.length} TypeScript file(s) (single-file check — no installed project dependencies to resolve cross-file types).`
        : `Real syntax check found ${errors.length} error(s) across ${tsFiles.length} TypeScript file(s).`,
      errors,
      warnings: [],
      durationMs: Date.now() - start,
    };
  }
}
