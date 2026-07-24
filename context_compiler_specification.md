# SE-OS v2.0 — Context Compiler & Workspace Isolation Specification

> **AUTHOR**: Principal Compiler & VFS Engineer (SE-OS Platform Team)  
> **STATUS**: Platform Context & Isolation Specification  
> **SCOPE**: Minimal Context Slicing, Tree-sitter AST Dependency Expansion, Context Caching, Git Worktree Isolation & Scratch Directories  

---

## 1. Context Compiler Engine

The **Context Compiler** guarantees workers **never** receive unnecessary code files. It extracts the minimal code slice required for a sub-task.

```
Task Description + Target File
            │
            ▼
   [ AST Tree-sitter Parser ] ──> Extracts Imports & Symbol Usages
            │
            ▼
   [ Dependency Resolver ]    ──> Expands Transitive Types & Interfaces
            │
            ▼
   [ Token Budget Slicer ]    ──> Truncates to maxContextTokens
            │
            ▼
     Minimal Context Slice
```

### 1.1 Inputs & Outputs
- **Inputs**: Task prompt, target file path, workspace file index, max token budget.
- **Outputs**: `ContextSlice` containing exact file snippets, imported type definitions, and AST symbol references.
- **Caching**: Symbol graph cached in Shared Memory SQLite database; invalidated on file modification events.

---

## 2. Workspace Isolation Model: Git Worktrees

To prevent multiple workers from corrupting the working tree simultaneously:

### 2.1 Isolation Strategy Comparison

| Approach | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- |
| **Shared Working Tree** | Low overhead | High race conditions & file corruption | REJECTED |
| **OverlayFS / Sandbox** | OS-level isolation | OS-specific (Linux only) | REJECTED |
| **Git Worktrees** | Native Git, cross-platform, isolated HEAD per worker | Minimal disk overhead | **SELECTED DEFAULT** |

### 2.2 Default Architecture: Git Worktree Per Worker
- Every active worker process operates in its own dedicated Git Worktree:
  ```
  .git/worktrees/worker-alice/
  .git/worktrees/worker-bob/
  ```
- Workers execute, verify, and commit atomically on their isolated branch.
- Upon completion, the worker's branch is merged cleanly into main by DevOps/Integration Manager.
