import { TaskPlanner } from '../src/core/application/services/task_planner';

describe('TaskPlanner Service — Target Selection & Priority System', () => {
  let taskPlanner: TaskPlanner;

  beforeEach(() => {
    taskPlanner = new TaskPlanner();
  });

  it('should decompose a multi-file prompt into ordered sub-tasks (Priority 1: Explicit paths)', async () => {
    const prompt = 'Create types in src/types.ts, implement logic in src/calculator.ts, and add unit tests in tests/calculator.test.ts';
    const workspaceFiles = ['src/main.ts', 'package.json'];

    const plan = await taskPlanner.planTask(prompt, workspaceFiles);

    expect(plan.originalPrompt).toBe(prompt);
    expect(plan.subTasks.length).toBe(3);

    // Step 1: Types (Implementation order: src/types.ts before src/calculator.ts before tests)
    expect(plan.subTasks[0].targetFile).toBe('src/types.ts');
    expect(plan.subTasks[0].selectionBasis).toBe('EXPLICIT_PATH');
    expect(plan.subTasks[0].selectionReason).toContain('Explicit path');
    expect(plan.subTasks[0].status).toBe('PENDING');

    // Step 2: Implementation
    expect(plan.subTasks[1].targetFile).toBe('src/calculator.ts');
    expect(plan.subTasks[1].selectionBasis).toBe('EXPLICIT_PATH');

    // Step 3: Tests
    expect(plan.subTasks[2].targetFile).toBe('tests/calculator.test.ts');
    expect(plan.subTasks[2].selectionBasis).toBe('EXPLICIT_PATH');
  });

  it('should infer tests/calculator.test.ts for "Create calculator tests" and NEVER select jest.config.js (Priority 2: Semantic Intent)', async () => {
    const prompt = 'Create calculator tests for each arithmetic method';
    const workspaceFiles = ['src/calculator.ts', 'jest.config.js', 'package.json', 'tsconfig.json'];

    const plan = await taskPlanner.planTask(prompt, workspaceFiles);

    // Must NOT select jest.config.js
    const targetFiles = plan.subTasks.map((st) => st.targetFile);
    expect(targetFiles).not.toContain('jest.config.js');
    expect(targetFiles).not.toContain('package.json');
    expect(targetFiles).not.toContain('tsconfig.json');

    // Must select tests/calculator.test.ts
    expect(targetFiles).toContain('tests/calculator.test.ts');
    const testSubTask = plan.subTasks.find((st) => st.targetFile === 'tests/calculator.test.ts');
    expect(testSubTask).toBeDefined();
    expect(testSubTask?.selectionBasis).toBe('SEMANTIC_INTENT');
    expect(testSubTask?.selectionReason).toBeDefined();
    expect(testSubTask?.selectionReason?.length).toBeGreaterThan(0);
  });

  it('should exclude configuration and manifest files from target inference even if they exist in workspace', async () => {
    const prompt = 'Implement a Calculator class with add, subtract, multiply, divide';
    const workspaceFiles = [
      'jest.config.js',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'Dockerfile',
      '.gitignore',
    ];

    const plan = await taskPlanner.planTask(prompt, workspaceFiles);

    const targetFiles = plan.subTasks.map((st) => st.targetFile);
    expect(targetFiles).not.toContain('jest.config.js');
    expect(targetFiles).not.toContain('package.json');
    expect(targetFiles).not.toContain('tsconfig.json');
    expect(targetFiles).not.toContain('Dockerfile');
    expect(targetFiles).not.toContain('.gitignore');

    // Inferred target must be src/calculator.ts
    expect(targetFiles[0]).toBe('src/calculator.ts');
    expect(plan.subTasks[0].selectionBasis).toBe('SEMANTIC_INTENT');
    expect(plan.subTasks[0].selectionReason).toContain('Inferred from action verb');
  });

  it('should provide selectionReason and selectionBasis on every sub-task', async () => {
    const prompt = 'Create src/calculator.ts and tests/calculator.test.ts';
    const workspaceFiles = ['src/main.ts'];

    const plan = await taskPlanner.planTask(prompt, workspaceFiles);

    for (const st of plan.subTasks) {
      expect(st.selectionReason).toBeDefined();
      expect(typeof st.selectionReason).toBe('string');
      expect(st.selectionReason!.length).toBeGreaterThan(10);
      expect(st.selectionBasis).toBeDefined();
    }
  });

  it('should select existing source file when no explicit path or entity match is present (Priority 3: Existing Source)', async () => {
    const prompt = 'Refactor the arithmetic logic to handle float overflow';
    const workspaceFiles = ['jest.config.js', 'package.json', 'src/math_utils.ts'];

    const plan = await taskPlanner.planTask(prompt, workspaceFiles);

    expect(plan.subTasks.length).toBe(1);
    expect(plan.subTasks[0].targetFile).toBe('src/math_utils.ts');
    expect(plan.subTasks[0].selectionBasis).toBe('EXISTING_SOURCE');
  });
});
