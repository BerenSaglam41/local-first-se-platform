import { TaskPlanner } from '../src/core/application/services/task_planner';

describe('TaskPlanner Service', () => {
  let taskPlanner: TaskPlanner;

  beforeEach(() => {
    taskPlanner = new TaskPlanner();
  });

  it('should decompose a multi-file prompt into ordered sub-tasks', async () => {
    const prompt = 'Create types in src/types.ts, implement logic in src/calculator.ts, and add unit tests in tests/calculator.test.ts';
    const workspaceFiles = ['src/main.ts', 'package.json'];

    const plan = await taskPlanner.planTask(prompt, workspaceFiles);

    expect(plan.originalPrompt).toBe(prompt);
    expect(plan.subTasks.length).toBe(3);

    // Step 1: Types
    expect(plan.subTasks[0].targetFile).toBe('src/types.ts');
    expect(plan.subTasks[0].objective).toContain('domain models and interfaces');
    expect(plan.subTasks[0].dependencies).toEqual([]);

    // Step 2: Implementation
    expect(plan.subTasks[1].targetFile).toBe('src/calculator.ts');
    expect(plan.subTasks[1].objective).toContain('logic');
    expect(plan.subTasks[1].dependencies).toEqual([`${plan.taskId}-step-1`]);

    // Step 3: Tests
    expect(plan.subTasks[2].targetFile).toBe('tests/calculator.test.ts');
    expect(plan.subTasks[2].objective).toContain('automated unit tests');
    expect(plan.subTasks[2].dependencies).toEqual([`${plan.taskId}-step-2`]);
  });

  it('should fallback to default target file when no files are mentioned in prompt', async () => {
    const prompt = 'Implement a calculator class with basic arithmetic operations';
    const workspaceFiles = ['src/calculator.ts', 'src/main.ts'];

    const plan = await taskPlanner.planTask(prompt, workspaceFiles);

    expect(plan.subTasks.length).toBe(1);
    expect(plan.subTasks[0].targetFile).toBe('src/calculator.ts');
    expect(plan.subTasks[0].objective).toBe(prompt);
    expect(plan.subTasks[0].status).toBe('pending');
  });
});
