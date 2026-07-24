import * as path from 'path';
import { ParsingResult } from './response_parser';

export interface ValidationReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  confidence: number;
}

export class ResponseValidator {
  validate(
    rawResponse: string,
    parseResult: ParsingResult,
    workspaceFiles: string[]
  ): ValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    let confidence = 1.0;

    // 1. Detect empty responses
    if (!rawResponse || rawResponse.trim() === '') {
      return {
        isValid: false,
        errors: ['AI response is empty.'],
        warnings: [],
        confidence: 0.0,
      };
    }

    // 2. Check if response has no valid blocks parsed
    if (!parseResult.success || parseResult.blocks.length === 0) {
      return {
        isValid: false,
        errors: ['AI response contains no code blocks or valid source code.'],
        warnings: [],
        confidence: 0.0,
      };
    }

    // 3. Check for malformed markdown code blocks
    const unclosedTicks = (rawResponse.match(/```/g) || []).length;
    if (unclosedTicks % 2 !== 0) {
      errors.push('Malformed AI response: contains unclosed markdown fenced code block ticks.');
      confidence -= 0.3;
    }

    // 4. Validate each parsed code block
    for (const block of parseResult.blocks) {
      // Empty content
      if (!block.content || block.content.trim() === '') {
        errors.push('Extracted code block is empty.');
        confidence -= 0.2;
        continue;
      }

      // Check if file is associated
      if (!block.fileName) {
        errors.push('Could not associate code block with any file in the workspace.');
        confidence -= 0.3;
        continue;
      }

      // Check protected manifest files
      const baseName = path.basename(block.fileName);
      const protectedFiles = [
        'package.json', 'package-lock.json', 'tsconfig.json',
        'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
        'Dockerfile', 'docker-compose.yml', '.gitignore',
      ];
      if (protectedFiles.includes(baseName)) {
        errors.push(`Attempted modification of protected manifest file [${baseName}]. Target file is forbidden.`);
        confidence -= 0.8;
      }

      // Check for JSON shell command objects or terminal instruction blocks
      if (block.content.includes('"command":') || block.content.includes('"description":') || /^\s*cat\s+/m.test(block.content) || /^\s*git\s+/m.test(block.content)) {
        errors.push(`Extracted content for [${baseName}] appears to be a shell command or tool invocation instead of source code.`);
        confidence -= 0.8;
      }

      // JSON syntax validation
      const ext = path.extname(block.fileName).toLowerCase();
      if (ext === '.json') {
        try {
          JSON.parse(block.content);
        } catch (e: any) {
          errors.push(`Extracted content for [${baseName}] is invalid JSON syntax: ${e.message}`);
          confidence -= 0.6;
        }
      }

      // Conversational checks on code content
      if (this.isConversationalText(block.content)) {
        errors.push(`Extracted code block for [${baseName}] appears to be conversational text instead of source code.`);
        confidence -= 0.6;
      }

      // Check incomplete blocks (brackets/braces count mismatch)
      if (this.isIncompleteCode(block.content)) {
        errors.push(`Code block for [${baseName}] appears to be incomplete or truncated (unbalanced braces/brackets).`);
        confidence -= 0.3;
      }

      // File extension vs language checks
      if (block.language) {
        const lang = block.language.toLowerCase();
        if (!this.matchesExtension(ext, lang)) {
          warnings.push(`File extension [${ext}] does not match code block language [${lang}].`);
          confidence -= 0.1;
        }
      } else {
        warnings.push(`Code block for [${path.basename(block.fileName)}] lacks an explicit language tag.`);
        confidence -= 0.15;
      }
    }

    confidence = Math.max(0.0, Math.min(1.0, confidence));

    const threshold = 0.6;
    const isValid = errors.length === 0 && confidence >= threshold;

    if (!isValid && errors.length === 0) {
      errors.push(`Parser confidence [${confidence.toFixed(2)}] is below acceptable threshold [${threshold}].`);
    }

    return {
      isValid,
      errors,
      warnings,
      confidence,
    };
  }

  private isConversationalText(content: string): boolean {
    const trimmed = content.trim();
    
    // Explicit conversational text triggers
    const conversationalTriggers = [
      /^(i see|sure|here is|here's|what would you like|please let me know|hi|hello|ok|okay)/i,
      /clarify what you'd like/i,
      /no accompanying question/i,
      /what would you like me to do/i,
      /could you clarify/i,
      /i recommend/i
    ];

    const hasTrigger = conversationalTriggers.some((trigger) => trigger.test(trimmed));
    if (hasTrigger) return true;

    // Check programming signatures
    const codingKeywords = ['class', 'function', 'const', 'let', 'var', 'import', 'export', 'return', 'interface', 'public', 'private', 'type'];
    let keywordCount = 0;
    for (const keyword of codingKeywords) {
      if (new RegExp(`\\b${keyword}\\b`).test(trimmed)) {
        keywordCount++;
      }
    }

    const hasCurlyBraces = trimmed.includes('{') && trimmed.includes('}');
    const hasSemicolons = trimmed.includes(';');

    // If it lacks both curly braces and semicolons, and has very few coding keywords, it is conversational text
    if (!hasCurlyBraces && !hasSemicolons && keywordCount < 1) {
      return true;
    }

    return false;
  }

  private isIncompleteCode(content: string): boolean {
    const braces = (content.match(/{/g) || []).length - (content.match(/}/g) || []).length;
    const parens = (content.match(/\(/g) || []).length - (content.match(/\)/g) || []).length;
    const brackets = (content.match(/\[/g) || []).length - (content.match(/\]/g) || []).length;

    return Math.abs(braces) > 1 || Math.abs(brackets) > 1;
  }

  private matchesExtension(ext: string, lang: string): boolean {
    const mappings: Record<string, string[]> = {
      '.ts': ['typescript', 'ts'],
      '.tsx': ['typescript', 'ts', 'tsx'],
      '.js': ['javascript', 'js'],
      '.jsx': ['javascript', 'js', 'jsx'],
      '.json': ['json'],
      '.py': ['python', 'py'],
      '.sh': ['shell', 'bash', 'sh'],
      '.md': ['markdown', 'md'],
    };

    const allowed = mappings[ext];
    if (!allowed) return true;
    return allowed.includes(lang);
  }
}
