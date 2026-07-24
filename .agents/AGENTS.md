# Project Customization Rules

## Mandate: Operational Rules & Development Playbook

Before beginning any task or making any code modifications, the assistant MUST strictly follow all guidelines defined in [AI_DEVELOPMENT_RULES.md](file:///Users/mustafaberen41/Desktop/local-first-se-platform/AI_DEVELOPMENT_RULES.md).

### Enforcement Workflow:
1. **Pre-Task Verification**: Read [AI_DEVELOPMENT_RULES.md](file:///Users/mustafaberen41/Desktop/local-first-se-platform/AI_DEVELOPMENT_RULES.md) before implementing changes.
2. **Build & Test Requirement**: Run `npm run build && npm test` and ensure 100% pass before concluding any task.
3. **Documentation Updates**: Update `README.md`, `CHANGELOG.md`, and `VERSION` whenever functionality changes or a milestone is completed.
4. **Clean Tree & Git Release**: Ensure `git status` is clean, conventional commits are created, and git tags are added for milestones.
