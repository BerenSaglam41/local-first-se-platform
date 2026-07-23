# Project Folder Tree

Here is the complete folder structure designed for the local-first AI Software Engineering Platform.

```
local-first-se-platform/
├── .gitignore                      # Git ignore patterns
├── package.json                    # Project configuration and dependencies (if TypeScript/Node)
├── tsconfig.json                   # TypeScript compiler configuration (if TypeScript/Node)
├── README.md                       # High-level overview
├── config/                         # Configuration system
│   ├── default.json                # Default global settings
│   └── roles/                      # JSON schemas defining agent roles and prompts
│       ├── ceo.json
│       ├── architect.json
│       ├── coder.json
│       └── qa.json
├── docs/                           # Project documentation
│   └── architecture.md             # Detailed architecture specification
├── src/
│   ├── main.ts                     # Bootstrapper / CLI Entry Point
│   ├── core/                       # Clean Architecture: Pure Core Domain and Application Logic
│   │   ├── domain/                 # Core Entities and Pure Interfaces (no external dependencies)
│   │   │   ├── models/             # Domain entities
│   │   │   │   ├── project.ts      # Project details
│   │   │   │   ├── task.ts         # Task entity and lifecycle
│   │   │   │   ├── message.ts      # Chat history / logs
│   │   │   │   └── event.ts        # Pub/Sub event schemas
│   │   │   └── interfaces/         # Contracts for all replaceable services
│   │   │       ├── provider.ts     # CLI AI Provider contracts
│   │   │       ├── agent.ts        # Agent, Role, Capability definitions
│   │   │       ├── memory.ts       # Short & long-term memory interface
│   │   │       ├── storage.ts      # SQLite/disk persistence
│   │   │       └── event_bus.ts    # decoupling messenger
│   │   └── application/            # Use Cases and Orchestrators
│   │       ├── state/              # Workflow state machine definitions
│   │       │   └── state_machine.ts
│   │       ├── workflow/           # DSL execution engine
│   │       │   ├── engine.ts       # DAG step resolver
│   │       │   └── scheduler.ts    # Thread limit & priority runner
│   │       └── event_bus/          # Memory-backed publisher/subscriber
│   │           └── event_bus.ts
│   └── infrastructure/             # Clean Architecture: External implementations and frameworks
│       ├── providers/              # CLI / CLI Wrappers
│       │   ├── base_cli_runner.ts  # Spawns node-pty/execa sub-processes
│       │   ├── claude_cli.ts       # Claude CLI adapter
│       │   ├── gemini_cli.ts       # Gemini CLI adapter
│       │   └── codex_cli.ts        # Codex CLI adapter
│       ├── storage/                # SQLite integration
│       │   └── sqlite_db.ts        # Schema definitions and raw queries
│       ├── memory/                 # Vector Indexing
│       │   └── vector_store.ts     # SQLite-VSS or hnswlib local indices
│       ├── terminal/               # Command shell driver
│       │   └── shell_manager.ts    # Timeout-protected bash runs
│       ├── git/                    # Version Control wrapper
│       │   └── git_client.ts       # Branch, commit, diff tool
│       ├── logging/                # Structured output logger
│       │   └── logger.ts           # JSON lines file writer
│       └── approval/               # User validation gates
│           └── interactive_cli.ts  # Direct stdin prompt loop
└── tests/                          # Unit and integration test files
    ├── core/
    └── infrastructure/
```
