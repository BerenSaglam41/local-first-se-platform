import { Mission, Task } from '../../domain/missions/mission_models';
import { TaskGraph } from './task_graph';
import { CapabilityType } from '../../contracts/iplugin_framework';

export class MissionPlanner {
  planMission(mission: Mission, goalPrompt: string): TaskGraph {
    const graph = new TaskGraph();

    const t1: Task = {
      id: `task-${mission.id}-arch`,
      missionId: mission.id,
      title: 'Architectural Blueprint & Review',
      objective: `Define architectural blueprints for goal: ${goalPrompt}`,
      targetFiles: ['architecture.md'],
      requiredCapabilities: ['ARCHITECTURE', 'DOCUMENTATION'],
      priority: 'P0',
      status: 'BACKLOG',
      dependsOnTaskIds: [],
      retryCount: 0,
    };

    const t2: Task = {
      id: `task-${mission.id}-impl`,
      missionId: mission.id,
      title: 'Core Implementation',
      objective: `Implement features according to blueprint: ${goalPrompt}`,
      targetFiles: ['src/main.ts'],
      requiredCapabilities: ['CODE_GENERATION'],
      priority: 'P1',
      status: 'BACKLOG',
      dependsOnTaskIds: [t1.id],
      retryCount: 0,
    };

    const t3: Task = {
      id: `task-${mission.id}-test`,
      missionId: mission.id,
      title: 'Automated Test Suite',
      objective: `Write unit and integration tests for: ${goalPrompt}`,
      targetFiles: ['tests/main.test.ts'],
      requiredCapabilities: ['TEST_GENERATION'],
      priority: 'P1',
      status: 'BACKLOG',
      dependsOnTaskIds: [t2.id],
      retryCount: 0,
    };

    const t4: Task = {
      id: `task-${mission.id}-review`,
      missionId: mission.id,
      title: 'Code Review & Audit',
      objective: `Audit security and quality for: ${goalPrompt}`,
      targetFiles: ['architecture.md', 'src/main.ts'],
      requiredCapabilities: ['CODE_REVIEW'],
      priority: 'P2',
      status: 'BACKLOG',
      dependsOnTaskIds: [t3.id],
      retryCount: 0,
    };

    graph.addTask(t1);
    graph.addTask(t2);
    graph.addTask(t3);
    graph.addTask(t4);

    return graph;
  }
}
