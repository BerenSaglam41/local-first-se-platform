import { ResponseValidator } from '../src/core/application/services/response_validator';
import { ResponseParser } from '../src/core/application/services/response_parser';

describe('ResponseValidator', () => {
  const validator = new ResponseValidator();
  const parser = new ResponseParser();
  const workspaceFiles = ['math_helper.ts'];

  it('should pass validation for a valid fenced markdown code block', () => {
    const raw = `
      Here is the updated code:
      \`\`\`typescript
      export class MathHelper {
        add(a: number, b: number): number {
          return a + b;
        }
      }
      \`\`\`
    `;
    const parsed = parser.parse(raw, workspaceFiles, 'math_helper.ts');
    const result = validator.validate(raw, parsed, workspaceFiles);

    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('should reject validation for conversational text with no code blocks', () => {
    const raw = 'I see the contents of the file. What would you like me to do?';
    const parsed = parser.parse(raw, workspaceFiles, 'math_helper.ts');
    const result = validator.validate(raw, parsed, workspaceFiles);

    expect(result.isValid).toBe(false);
    expect(result.errors.join('; ')).toContain('conversational text');
  });

  it('should reject validation for empty responses', () => {
    const raw = '';
    const parsed = parser.parse(raw, workspaceFiles, 'math_helper.ts');
    const result = validator.validate(raw, parsed, workspaceFiles);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('AI response is empty.');
  });

  it('should reject validation when fenced ticks are malformed', () => {
    const raw = `
      \`\`\`typescript
      export class MathHelper {}
    `;
    const parsed = parser.parse(raw, workspaceFiles, 'math_helper.ts');
    const result = validator.validate(raw, parsed, workspaceFiles);

    expect(result.isValid).toBe(false);
    expect(result.errors.join('; ')).toContain('ticks');
  });

  it('should reject code blocks containing conversational text instead of code', () => {
    const raw = `
      \`\`\`typescript
      I see the contents of math_helper.ts, please let me know what to do.
      \`\`\`
    `;
    const parsed = parser.parse(raw, workspaceFiles, 'math_helper.ts');
    const result = validator.validate(raw, parsed, workspaceFiles);

    expect(result.isValid).toBe(false);
    expect(result.errors.join('; ')).toContain('conversational text');
  });

  it('should reject incomplete or truncated code blocks', () => {
    const raw = `
      \`\`\`typescript
      export class MathHelper {
        add(a: number, b: number): number {
          return a + b;
      \`\`\`
    `;
    const parsed = parser.parse(raw, workspaceFiles, 'math_helper.ts');
    const result = validator.validate(raw, parsed, workspaceFiles);

    expect(result.isValid).toBe(false);
    expect(result.errors.join('; ')).toContain('incomplete or truncated');
  });
});
