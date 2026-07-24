# SE-OS v2.0 — Scheduler Specification

> **AUTHOR**: Senior Distributed Systems Engineer (SE-OS Platform Team)  
> **STATUS**: Platform Scheduler Specification  
> **SCOPE**: Priority Queues, DAG Resolution, Resource Balancing, Task Stealing, Fair Scheduling & Worker Affinity  

---

## 1. Scheduler Architecture & Priority Queues

The **Workforce Scheduler** manages task scheduling across all active workers:

```
[ High-Priority Queue (P0: Critical Fixes) ]
[ Normal Priority Queue (P1: Feature Tasks)  ]
[ Low Priority Queue (P2: Docs/Refactoring)  ]
                     │
                     ▼
          [ DAG Dependency Engine ]
                     │
                     ▼
        [ Worker Matching & Affinity ]
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   [Worker 1]   [Worker 2]   [Worker 3]
```

---

## 2. Core Scheduling Algorithm

### 2.1 Scheduling Rules
1. **DAG Resolution**: A task transitions to `READY` state ONLY when all `dependsOnTaskIds` have reached `COMPLETED` status.
2. **Capability & Role Matching**: Tasks are dispatched strictly to workers possessing matching `Capabilities` (e.g. `UNIT_TESTING` tasks → QA Workers).
3. **Worker Affinity**: Prefers assigning follow-up tasks on a file to the worker who previously modified that file (hot-context affinity).
4. **Fair Scheduling & Task Stealing**: If Worker A's queue is empty and Worker B is overloaded, Worker A "steals" an unassigned `READY` task matching its capabilities.
5. **Token Budget Gate**: Blocks scheduling if total token consumption exceeds project thresholds.
