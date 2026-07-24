import { Worker } from '../../domain/employees/worker';
import { DepartmentType } from '../../domain/organization/organization_models';

const DEPARTMENT_KEYWORD_MAP: Array<{ match: RegExp; department: DepartmentType }> = [
  { match: /architect/i, department: 'Architecture' },
  { match: /frontend|front-end|ui\b/i, department: 'Frontend' },
  { match: /backend|back-end|server/i, department: 'Backend' },
  { match: /qa|quality|test/i, department: 'QA' },
  { match: /devops|infra|sre/i, department: 'DevOps' },
  { match: /doc/i, department: 'Documentation' },
  { match: /research/i, department: 'Research' },
];

/** Free-text role/department strings (from company.json or an ad-hoc `worker-start`) are mapped
 * to the canonical DepartmentType honestly — unrecognized input falls back to 'Backend', the same
 * default the rest of the system already uses for unrecognized capabilities. */
export function normalizeDepartment(input: string): DepartmentType {
  const match = DEPARTMENT_KEYWORD_MAP.find((m) => m.match.test(input));
  return match?.department || 'Backend';
}

/**
 * The single in-memory source of truth for every worker. Replaces WorkerRegistry,
 * WorkerActivityRegistry, and WorkerProviderAssignmentStore (see ADR-0005) — there is exactly one
 * place a worker's identity, process health, provider assignment, and current activity live.
 */
export class WorkerStore {
  private workers = new Map<string, Worker>();

  register(id: string, name: string, role: string, departmentInput: string): Worker {
    const worker = new Worker(id, name, role, normalizeDepartment(departmentInput));
    this.workers.set(id, worker);
    return worker;
  }

  get(id: string): Worker | undefined {
    return this.workers.get(id);
  }

  list(): Worker[] {
    return Array.from(this.workers.values());
  }

  listByDepartment(department: DepartmentType): Worker[] {
    return this.list().filter((w) => w.department === department);
  }

  /** The one cleanup call a removed worker requires — no other store to forget to update. */
  remove(id: string): boolean {
    return this.workers.delete(id);
  }

  has(id: string): boolean {
    return this.workers.has(id);
  }
}
