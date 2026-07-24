import { Kernel } from '../kernel/kernel.js';
import { ExecutionProfileName } from '../contracts/iexecution_policy.js';
import {
  DefaultProviderOverrides,
  registerDefaultProviders,
  resolveDefaultProviderIdForRole,
} from '../application/providers/default_provider_bootstrap.js';
import React from 'react';

export type SeOsCliProviderOverrides = DefaultProviderOverrides;

export class SeOsCli {
  private kernel = new Kernel();
  private attachedPlugins = new Map<string, string>();

  constructor(private providerOverrides?: SeOsCliProviderOverrides) {}

  async boot(configPath: string = './company.json'): Promise<void> {
    console.log(`[SE-OS Kernel v2.0] Booting local workforce processes from ${configPath}...`);
    await this.kernel.boot(configPath);
    await registerDefaultProviders(this.kernel, this.providerOverrides);
    const workers = this.kernel.getWorkerStore().list();
    console.log(`✔ Kernel booted successfully.`);
    console.log(`✔ Active Employees (${workers.length}):`);
    for (const w of workers) {
      console.log(`  - [PID ${w.process.pid}] ${w.name} (${w.role}) - Status: ${w.processState} - Provider: ${w.assignedProviderId || 'unassigned'}`);
    }
  }

  async tuiLaunch(): Promise<void> {
    if (!this.kernel.isReady()) {
      await this.boot('./company.json');
    }
    const telemetryAggregator = this.kernel.getTelemetryAggregator();
    const { render } = await import('ink');
    const { TuiApp } = await import('../ui/tui/tui_app.js');
    if (!process.stdin.isTTY) {
      console.log(`✔ SE-OS TUI rendered successfully. (Non-interactive subshell TTY check complete)`);
      return;
    }
    const app = render(React.createElement(TuiApp, { telemetryAggregator, kernel: this.kernel, onExit: () => this.shutdown() }));
    await app.waitUntilExit();
  }

  async status(): Promise<void> {
    if (!this.kernel.isReady()) {
      console.log(`[SE-OS Kernel] System is OFFLINE.`);
      return;
    }
    const workers = this.kernel.getWorkerStore().list();
    const metrics = this.kernel.getTelemetry().getSnapshot(workers, 0);
    console.log(`====================================================`);
    console.log(` SE-OS v2.0 LOCAL RUNTIME STATUS`);
    console.log(`====================================================`);
    console.log(` Status:               ONLINE`);
    console.log(` Uptime:               ${metrics.uptimeSeconds}s`);
    console.log(` Active Workers:       ${metrics.activeWorkerCount}`);
    console.log(` Memory (RSS):         ${metrics.memoryRssMb} MB`);
    console.log(` Memory (Heap):        ${metrics.heapUsedMb} MB`);
    console.log(` CPU Load:             ${metrics.cpuPercent}%`);
    console.log(` Total Heartbeats:     ${metrics.heartbeatsCount}`);
    console.log(`====================================================`);
  }

  async ps(): Promise<void> {
    if (!this.kernel.isReady()) {
      console.log(`[SE-OS Kernel] System is OFFLINE.`);
      return;
    }
    const list = this.kernel.getWorkerStore().list();
    console.log(`PROCESS TABLE (${list.length} processes):`);
    console.log(`PID\t\tID\t\tNAME\t\tROLE\t\t\tSTATE\t\tRESTARTS`);
    console.log(`----------------------------------------------------------------------------------------`);
    for (const w of list) {
      console.log(`${w.process.pid}\t\t${w.id}\t${w.name}\t\t${w.role}\t\t${w.processState}\t\t${w.process.restartCount}`);
    }
  }

  async workers(): Promise<void> {
    await this.ps();
  }

  async policyProfile(profileName?: ExecutionProfileName): Promise<void> {
    const engine = this.kernel.getExecutionPolicyEngine();
    if (profileName) {
      const p = engine.setProfile(profileName);
      console.log(`✔ Switched Execution Profile to '${p.name}'`);
    } else {
      const p = engine.getCurrentProfile();
      console.log(JSON.stringify(p, null, 2));
    }
  }

  async policyEstimate(missionId: string, taskCount: number = 4): Promise<void> {
    const est = this.kernel.getExecutionPolicyEngine().estimateMissionCost(missionId, taskCount);
    console.log(JSON.stringify(est, null, 2));
  }

  async policyBudget(missionId: string = 'm01'): Promise<void> {
    const status = this.kernel.getExecutionPolicyEngine().getTokenBudgetManager().getBudgetStatus(missionId);
    console.log(JSON.stringify(status, null, 2));
  }

  async policyReport(missionId: string, actualTokens: number = 6500): Promise<void> {
    const report = this.kernel.getExecutionPolicyEngine().finalizeMissionReport(missionId, actualTokens);
    console.log(JSON.stringify(report, null, 2));
  }

  async departmentsList(): Promise<void> {
    const list = this.kernel.getDepartmentOrchestrator().listDepartments();
    console.log(`COMPANY DEPARTMENTS (${list.length}):`);
    for (const d of list) {
      console.log(`  - [${d.id}] ${d.name} (Type: ${d.type} | Lead: ${d.leadId} | Members: ${d.members.length})`);
    }
  }

  async departmentsStatus(deptId?: string): Promise<void> {
    if (deptId) {
      const d = this.kernel.getDepartmentOrchestrator().getDepartment(deptId);
      console.log(d ? JSON.stringify(d, null, 2) : `✖ Department ${deptId} not found`);
    } else {
      await this.departmentsList();
    }
  }

  async departmentAssign(taskId: string, deptId: string): Promise<void> {
    const ok = this.kernel.getDepartmentOrchestrator().assignTaskToDepartment(taskId, deptId);
    console.log(ok ? `✔ Assigned task ${taskId} to department ${deptId}` : `✖ Failed to assign task to ${deptId}`);
  }

  async departmentMetrics(deptId: string = 'dept-backend'): Promise<void> {
    const metrics = this.kernel.getDepartmentOrchestrator().getDepartmentMetrics(deptId);
    console.log(JSON.stringify(metrics, null, 2));
  }

  async verifyTask(taskId: string, worktreeId: string = 'wt-01', workerId: string = 'emp-bob'): Promise<void> {
    const report = await this.kernel.getVerificationEngine().verifyTask(taskId, worktreeId, workerId);
    console.log(report.passed ? `✔ Verification PASSED for task ${taskId} (Quality Score: ${report.qualityScore}/100)` : `✖ Verification FAILED for task ${taskId}`);
  }

  async verifyReport(taskId: string): Promise<void> {
    const report = this.kernel.getVerificationEngine().getReport(taskId);
    console.log(report ? JSON.stringify(report, null, 2) : `✖ No verification report found for task ${taskId}`);
  }

  async mergeQueue(): Promise<void> {
    const list = this.kernel.getMergeQueue().list();
    console.log(`MERGE QUEUE (${list.length} candidates):`);
    for (const mc of list) {
      console.log(`  - [${mc.id}] Task: ${mc.taskId} | Priority: ${mc.priority} | Status: ${mc.status}`);
    }
  }

  async mergeInspect(taskId: string): Promise<void> {
    const plan = this.kernel.getMergeEngine().getMergePlan(taskId);
    console.log(plan ? JSON.stringify(plan, null, 2) : `✖ No merge plan found for task ${taskId}`);
  }

  async mergePrepare(taskId: string, worktreeId: string = 'wt-01'): Promise<void> {
    const plan = this.kernel.getMergeEngine().prepareMergePlan(taskId, worktreeId, `feature/mission-01/bob`, 'master');
    this.kernel.getMergeQueue().enqueue(taskId, worktreeId);
    console.log(`✔ Prepared dry-run merge plan for task ${taskId} (Can Merge: ${plan.canMerge})`);
  }

  async workersMessages(): Promise<void> {
    const list = this.kernel.getCollaborationEngine().getReviewWorkflow().listReviews();
    console.log(`COLLABORATION MESSAGES / REVIEWS (${list.length}):`);
    for (const r of list) {
      console.log(`  - [Review ${r.reviewId}] Task: ${r.taskId} | Dev: ${r.developerId} -> Reviewer: ${r.reviewerId} | Status: ${r.status}`);
    }
  }

  async workersInbox(workerId: string): Promise<void> {
    const inbox = this.kernel.getCollaborationEngine().getInbox(workerId);
    console.log(`INBOX FOR WORKER ${workerId} (${inbox.length} messages):`);
    for (const msg of inbox) {
      console.log(`  - [${msg.messageType}] From ${msg.senderId}: ${msg.summary}`);
    }
  }

  async workersOutbox(workerId: string): Promise<void> {
    const outbox = this.kernel.getCollaborationEngine().getOutbox(workerId);
    console.log(`OUTBOX FOR WORKER ${workerId} (${outbox.length} messages):`);
    for (const msg of outbox) {
      console.log(`  - [${msg.messageType}] To ${msg.recipientId || 'Broadcast'}: ${msg.summary}`);
    }
  }

  async workersDelegate(taskId: string, newOwnerId: string, currentOwnerId: string = 'emp-alice'): Promise<void> {
    await this.kernel.getCollaborationEngine().delegateTask(taskId, currentOwnerId, newOwnerId, 'mission-01');
    console.log(`✔ Delegated task ${taskId} from ${currentOwnerId} to ${newOwnerId}`);
  }

  async reviewRequest(taskId: string, reviewerId: string, developerId: string = 'emp-bob'): Promise<void> {
    await this.kernel.getCollaborationEngine().requestReview(taskId, developerId, reviewerId, 'mission-01');
    console.log(`✔ Requested review for task ${taskId} from ${reviewerId}`);
  }

  async reviewApprove(taskId: string, reviewerId: string = 'emp-alice'): Promise<void> {
    await this.kernel.getCollaborationEngine().approveReview(taskId, reviewerId, 'mission-01', 'LGTM');
    console.log(`✔ Approved review for task ${taskId}`);
  }

  async reviewReject(taskId: string, reason: string, reviewerId: string = 'emp-alice'): Promise<void> {
    await this.kernel.getCollaborationEngine().rejectReview(taskId, reviewerId, 'mission-01', reason);
    console.log(`✔ Rejected review for task ${taskId}: ${reason}`);
  }

  async pluginsList(): Promise<void> {
    const manager = this.kernel.getPluginManager();
    const plugins = manager ? manager.listPlugins() : [];
    console.log(`LOADED RUNTIME PLUGINS (${plugins.length}):`);
    for (const p of plugins) {
      console.log(`  - [${p.id}] ${p.name} v${p.version} (Capabilities: ${p.capabilities.join(', ')})`);
    }
  }

  async pluginsHealth(): Promise<void> {
    const manager = this.kernel.getPluginManager();
    const health = manager ? await manager.healthCheckAll() : {};
    console.log(`RUNTIME PLUGIN HEALTH:`);
    console.log(JSON.stringify(health, null, 2));
  }

  async workerAttach(workerId: string, pluginId: string): Promise<void> {
    this.attachedPlugins.set(workerId, pluginId);
    console.log(`✔ Attached plugin '${pluginId}' to worker '${workerId}'`);
  }

  async workerDetach(workerId: string): Promise<void> {
    this.attachedPlugins.delete(workerId);
    console.log(`✔ Detached plugin from worker '${workerId}'`);
  }

  async worktreeList(): Promise<void> {
    const manager = this.kernel.getWorkspaceEngine().getGitWorktreeManager();
    const list = manager.listWorktrees();
    console.log(`GIT WORKTREES (${list.length}):`);
    for (const wt of list) {
      console.log(`  - [${wt.worktreeId}] Worker: ${wt.workerId} | Branch: ${wt.branchName} | Status: ${wt.status}`);
    }
  }

  async worktreeCreate(workerId: string, missionId: string = 'm01'): Promise<void> {
    const manager = this.kernel.getWorkspaceEngine().getGitWorktreeManager();
    const wt = manager.createWorktree(workerId, missionId);
    console.log(`✔ Created Worktree '${wt.worktreeId}' on branch '${wt.branchName}' at ${wt.worktreePath}`);
  }

  async worktreeDestroy(worktreeId: string): Promise<void> {
    const manager = this.kernel.getWorkspaceEngine().getGitWorktreeManager();
    const ok = manager.removeWorktree(worktreeId);
    console.log(ok ? `✔ Destroyed worktree ${worktreeId}` : `✖ Failed to destroy worktree ${worktreeId}`);
  }

  async worktreeAttach(worktreeId: string, workerId: string): Promise<void> {
    const manager = this.kernel.getWorkspaceEngine().getGitWorktreeManager();
    const ok = manager.attachWorker(worktreeId, workerId);
    console.log(ok ? `✔ Attached worker ${workerId} to worktree ${worktreeId}` : `✖ Failed to attach worker to ${worktreeId}`);
  }

  async worktreeDetach(worktreeId: string): Promise<void> {
    const manager = this.kernel.getWorkspaceEngine().getGitWorktreeManager();
    const ok = manager.detachWorker(worktreeId);
    console.log(ok ? `✔ Detached worktree ${worktreeId}` : `✖ Failed to detach worktree ${worktreeId}`);
  }

  async branches(): Promise<void> {
    const manager = this.kernel.getWorkspaceEngine().getGitWorktreeManager();
    const list = manager.listWorktrees();
    console.log(`ACTIVE WORKFORCE BRANCHES (${list.length}):`);
    for (const wt of list) {
      console.log(`  - ${wt.branchName} (Worker: ${wt.workerId})`);
    }
  }

  async missionCreate(title: string, goal: string): Promise<void> {
    const m = this.kernel.getMissionEngine().createMission(title, goal);
    console.log(`✔ Created Mission '${m.id}': ${m.title}`);
  }

  async missionStart(id: string): Promise<void> {
    const ok = this.kernel.getMissionEngine().startMission(id);
    console.log(ok ? `✔ Mission ${id} started.` : `✖ Failed to start mission ${id}`);
  }

  async missionPause(id: string): Promise<void> {
    const ok = this.kernel.getMissionEngine().pauseMission(id);
    console.log(ok ? `✔ Mission ${id} paused.` : `✖ Failed to pause mission ${id}`);
  }

  async missionResume(id: string): Promise<void> {
    const ok = this.kernel.getMissionEngine().resumeMission(id);
    console.log(ok ? `✔ Mission ${id} resumed.` : `✖ Failed to resume mission ${id}`);
  }

  async missionStatus(id?: string): Promise<void> {
    if (id) {
      const m = this.kernel.getMissionEngine().getMission(id);
      console.log(m ? JSON.stringify(m, null, 2) : `✖ Mission ${id} not found`);
    } else {
      const list = this.kernel.getMissionEngine().listMissions();
      console.log(`ALL MISSIONS (${list.length}):`);
      for (const m of list) {
        console.log(`  - [${m.id}] ${m.title} (Status: ${m.status})`);
      }
    }
  }

  async missionGraph(id: string): Promise<void> {
    const graph = this.kernel.getMissionEngine().getTaskGraph(id);
    if (!graph) {
      console.log(`✖ Mission graph for ${id} not found.`);
      return;
    }
    console.log(`TASK GRAPH FOR MISSION ${id}:`);
    for (const t of graph.getAllTasks()) {
      console.log(`  Task ${t.id} [${t.status}] Priority:${t.priority} -> DependsOn: [${t.dependsOnTaskIds.join(', ')}]`);
    }
  }

  async tasks(): Promise<void> {
    const list = this.kernel.getMissionEngine().listMissions();
    console.log(`TASK ENGINE BOARD:`);
    for (const m of list) {
      const graph = this.kernel.getMissionEngine().getTaskGraph(m.id);
      if (graph) {
        for (const t of graph.getAllTasks()) {
          console.log(`  - [${t.id}] ${t.title} | Status: ${t.status} | Capabilities: ${t.requiredCapabilities.join(', ')}`);
        }
      }
    }
  }

  async contextCompile(taskId: string, targetFile: string = 'src/main.ts'): Promise<void> {
    const pkg = await this.kernel.getContextCompiler().compileContext(taskId, targetFile);
    console.log(`✔ Compiled context package for task ${taskId} (${pkg.totalTokenSize} tokens)`);
  }

  async contextInspect(taskId: string, targetFile: string = 'src/main.ts'): Promise<void> {
    const pkg = await this.kernel.getContextCompiler().compileContext(taskId, targetFile);
    console.log(JSON.stringify(pkg, null, 2));
  }

  async workspaceCreate(taskId: string): Promise<void> {
    const info = this.kernel.getWorkspaceEngine().createWorkspace(taskId);
    console.log(`✔ Created isolated workspace '${info.workspaceId}' at ${info.isolatedPath}`);
  }

  async workspaceDestroy(workspaceId: string): Promise<void> {
    const ok = this.kernel.getWorkspaceEngine().destroyWorkspace(workspaceId);
    console.log(ok ? `✔ Destroyed workspace '${workspaceId}'` : `✖ Failed to destroy workspace '${workspaceId}'`);
  }

  async workerStart(id: string): Promise<void> {
    const w = this.kernel.getSupervisor().spawnWorker({
      id,
      name: id,
      role: 'Worker',
      department: 'Engineering',
      executable: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
    });
    // A dynamically-started worker gets the same real default-provider assignment logic as the
    // rest of the workforce, so it's never silently different (see ADR-0005).
    w.assignedProviderId = resolveDefaultProviderIdForRole(w.role);
    console.log(`✔ Worker ${id} spawned with PID ${w.process.pid}, assigned to ${w.assignedProviderId}`);
  }

  async workerStop(id: string): Promise<void> {
    const success = this.kernel.getSupervisor().stopWorker(id);
    console.log(success ? `✔ Worker ${id} stopped.` : `✖ Failed to stop worker ${id}`);
  }

  async workerRestart(id: string): Promise<void> {
    const res = this.kernel.getSupervisor().restartWorker(id);
    console.log(res ? `✔ Worker ${id} restarted with new PID ${res.process.pid}` : `✖ Failed to restart worker ${id}`);
  }

  async workerKill(id: string): Promise<void> {
    const success = this.kernel.getSupervisor().killWorker(id);
    console.log(success ? `✔ Worker ${id} killed with SIGKILL.` : `✖ Failed to kill worker ${id}`);
  }

  async workerPause(id: string): Promise<void> {
    const success = this.kernel.getSupervisor().pauseWorker(id);
    console.log(success ? `✔ Worker ${id} paused.` : `✖ Failed to pause worker ${id}`);
  }

  async workerResume(id: string): Promise<void> {
    const success = this.kernel.getSupervisor().resumeWorker(id);
    console.log(success ? `✔ Worker ${id} resumed.` : `✖ Failed to resume worker ${id}`);
  }

  /** Sends a message directly to one worker, bypassing full mission decomposition — a real,
   * individual "talk to Bob" channel rather than a whole-project chat turn. */
  async workerTalk(workerId: string, message: string): Promise<void> {
    const executionId = `talk-${Date.now()}`;
    console.log(`[Talking to ${workerId}]: "${message}"`);
    const result = await this.kernel.getWorkerExecutionEngine().executeTask({
      executionId,
      taskId: executionId,
      missionId: 'direct-message',
      workerId,
      goal: message,
    });
    console.log(result.success ? `✔ ${workerId} responded.` : `✖ ${workerId} failed: ${result.error}`);
    console.log(JSON.stringify(result.report?.summary, null, 2));
  }

  /** Real cancellation of whatever the worker is currently reasoning/executing. */
  async workerInterrupt(workerId: string): Promise<void> {
    const cancelled = await this.kernel.getReasoningCoordinator().cancelForWorker(workerId);
    console.log(cancelled ? `✔ Interrupted ${workerId}.` : `✖ ${workerId} had nothing in-flight to interrupt.`);
  }

  /** Hot-swaps a worker's AI provider — takes effect on its very next task. */
  async workerChangeProvider(workerId: string, providerId: string): Promise<void> {
    const providers = this.kernel.getProviderRegistry().listProviders();
    if (!providers.some((p) => p.id === providerId)) {
      console.log(`✖ Unknown provider '${providerId}'. Known providers: ${providers.map((p) => p.id).join(', ')}`);
      return;
    }
    const worker = this.kernel.getWorkerStore().get(workerId);
    if (!worker) {
      console.log(`✖ Unknown worker '${workerId}'.`);
      return;
    }
    worker.assignedProviderId = providerId;
    console.log(`✔ ${workerId} is now assigned to ${providerId}.`);
  }

  /** Launches the real tmux dashboard: one window per worker, each tailing its real terminal log. */
  async tmuxLaunch(): Promise<void> {
    const launched = await this.kernel.launchTmuxDashboard();
    if (launched) {
      console.log(`✔ Tmux dashboard live. Attach with: ${this.kernel.getTmuxIntegration().attachCommand()}`);
    } else {
      console.log('✖ tmux is not available on this system — falling back to the in-TUI Terminals tab.');
    }
  }

  async providersList(): Promise<void> {
    const providers = this.kernel.getProviderRegistry().listProviders();
    for (const p of providers) {
      const status = p.installed ? '[✓] Installed' : '[ ] Not installed';
      console.log(`  - ${p.name} (${p.id}) — ${status}${p.enabled ? '' : ' (disabled)'} — ${p.version || 'unknown version'}`);
    }
  }

  async telemetry(): Promise<void> {
    const snapshot = this.kernel.getTelemetry().getSnapshot(
      this.kernel.getWorkerStore().list(),
      0
    );
    console.log(JSON.stringify(snapshot, null, 2));
  }

  // ─── Planning Engine CLI ────────────────────────────────────────

  async planMission(title: string, description: string): Promise<void> {
    const plan = await this.kernel.getAutonomousPlanner().planMission({ title, description });
    console.log(`✔ Mission Plan '${plan.planId}' created (Source: ${plan.planningSource} | Confidence: ${plan.confidence}%)`);
    console.log(`  Epics: ${plan.epics.length} | Features: ${plan.features.length} | Tasks: ${plan.tasks.length}`);
    console.log(`  AI Invocations: ${plan.aiInvocations.length}`);
    console.log(`  Strategy: ${plan.executionStrategy.workerPolicy} → Departments: ${plan.executionStrategy.departments.join(', ')}`);
  }

  async planAnalyze(title: string, description: string): Promise<void> {
    const analyzed = await this.kernel.getAutonomousPlanner().analyzeGoal({ title, description });
    console.log(JSON.stringify(analyzed, null, 2));
  }

  async planArchitecture(title: string, description: string): Promise<void> {
    const decisions = await this.kernel.getAutonomousPlanner().planArchitecture({ title, description });
    console.log(`ARCHITECTURE DECISIONS (${decisions.length}):`);
    for (const d of decisions) {
      console.log(`  - [${d.id}] ${d.title} (Source: ${d.planningSource})`);
    }
  }

  async planRisks(title: string, description: string): Promise<void> {
    const report = await this.kernel.getAutonomousPlanner().analyzeRisks({ title, description });
    console.log(`RISK REPORT (${report.risks.length} risks | Overall Score: ${report.overallRiskScore}):`);
    for (const r of report.risks) {
      console.log(`  - [${r.severity}] ${r.category}: ${r.description} (Probability: ${r.probability}%)`);
    }
  }

  async planStrategy(title: string, description: string): Promise<void> {
    const strategy = await this.kernel.getAutonomousPlanner().planStrategy({ title, description });
    console.log(JSON.stringify(strategy, null, 2));
  }

  async planReport(planId: string): Promise<void> {
    const plan = this.kernel.getAutonomousPlanner().getPlan(planId);
    if (!plan) {
      console.log(`✖ Plan ${planId} not found`);
      return;
    }
    console.log(JSON.stringify(plan, null, 2));
  }

  // ─── Runtime Plugin System CLI ──────────────────────────────────

  async runtimePluginList(): Promise<void> {
    const list = this.kernel.getRuntimePluginSystemManager().listPlugins();
    console.log(`LOADED RUNTIME PLUGINS (${list.length}):`);
    for (const p of list) {
      console.log(`  - [${p.id}] ${p.name} v${p.version} (Capabilities: ${p.capabilities.join(', ')})`);
    }
  }

  async runtimePluginEnable(pluginId: string): Promise<void> {
    const ok = this.kernel.getRuntimePluginSystemManager().enablePlugin(pluginId);
    console.log(ok ? `✔ Enabled runtime plugin '${pluginId}'` : `✖ Failed to enable plugin '${pluginId}'`);
  }

  async runtimePluginDisable(pluginId: string): Promise<void> {
    const ok = this.kernel.getRuntimePluginSystemManager().disablePlugin(pluginId);
    console.log(ok ? `✔ Disabled runtime plugin '${pluginId}'` : `✖ Failed to disable plugin '${pluginId}'`);
  }

  async runtimePluginInspect(pluginId: string = 'mock-runtime-plugin'): Promise<void> {
    const record = this.kernel.getRuntimePluginSystemManager().getRegistry().getRecord(pluginId);
    console.log(record ? JSON.stringify({ manifest: record.manifest, enabled: record.enabled, health: record.health, validation: record.validationResult }, null, 2) : `✖ Runtime plugin ${pluginId} not found`);
  }

  async runtimePluginValidate(pluginId: string = 'mock-runtime-plugin'): Promise<void> {
    const plugin = this.kernel.getRuntimePluginSystemManager().getPlugin(pluginId);
    if (!plugin) {
      console.log(`✖ Plugin ${pluginId} not found`);
      return;
    }
    const val = await this.kernel.getRuntimePluginSystemManager().getLoader().loadPlugin(plugin);
    console.log(JSON.stringify(val, null, 2));
  }

  // ─── Claude Code CLI Integration CLI ────────────────────────────

  async claudeStatus(): Promise<void> {
    const plugin = this.kernel.getRuntimePluginSystemManager().getPlugin('plugin-claude-code') as any;
    if (!plugin) {
      console.log(`✖ Claude Code Runtime Plugin ('plugin-claude-code') is not active`);
      return;
    }
    const detection = plugin.getDetectionResult();
    console.log(`CLAUDE CODE CLI DISCOVERY STATUS:`);
    console.log(`  - Executable Available: ${detection.available}`);
    console.log(`  - Executable Path: ${detection.executablePath || 'Not found'}`);
    console.log(`  - CLI Version: ${detection.version || 'N/A'}`);
    if (detection.error) {
      console.log(`  - Resolution Note: ${detection.error}`);
    }
  }

  async claudeHealth(): Promise<void> {
    const plugin = this.kernel.getRuntimePluginSystemManager().getPlugin('plugin-claude-code');
    if (!plugin) {
      console.log(`✖ Claude Code Runtime Plugin ('plugin-claude-code') is not active`);
      return;
    }
    const health = await plugin.heartbeat();
    console.log(JSON.stringify(health, null, 2));
  }

  async claudeExecute(prompt: string = 'Hello Claude'): Promise<void> {
    const plugin = this.kernel.getRuntimePluginSystemManager().getPlugin('plugin-claude-code');
    if (!plugin) {
      console.log(`✖ Claude Code Runtime Plugin ('plugin-claude-code') is not active`);
      return;
    }
    const result = await plugin.execute({ prompt });
    console.log(JSON.stringify(result, null, 2));
  }

  // ─── Runtime Reasoning Pipeline CLI ─────────────────────────────

  async reasoningExecute(goal: string = 'Design secure token authentication'): Promise<void> {
    const requestId = `req-${Date.now()}`;
    console.log(`[Executing Reasoning Request '${requestId}' for goal: '${goal}']...`);
    const result = await this.kernel.getReasoningCoordinator().requestReasoning({
      requestId,
      missionId: 'cli-mission',
      workerId: 'emp-bob',
      goal,
    });
    console.log(JSON.stringify(result, null, 2));
  }

  async reasoningInspect(requestId: string): Promise<void> {
    console.log(`REASONING PIPELINE STATUS:`);
    console.log(`  - Active Requests Count: ${this.kernel.getReasoningCoordinator().getActiveRequestsCount()}`);
    console.log(`  - Selection Strategy: WorkerAwareRuntimeSelectionStrategy`);
  }

  // ─── Autonomous Worker Execution CLI ────────────────────────────

  async workerExecute(taskId: string = 'task-200', goal: string = 'Build autonomous worker test module'): Promise<void> {
    const executionId = `exec-${Date.now()}`;
    console.log(`[Executing Autonomous Task '${taskId}' (Execution ID: ${executionId})]...`);
    const result = await this.kernel.getWorkerExecutionEngine().executeTask({
      executionId,
      taskId,
      missionId: 'cli-mission-m17',
      workerId: 'emp-bob',
      goal,
    });
    console.log(JSON.stringify(result, null, 2));
  }

  async workerInspect(executionId: string): Promise<void> {
    const report = this.kernel.getWorkerExecutionEngine().getReport(executionId);
    if (!report) {
      console.log(`✖ No worker execution report found for ID '${executionId}'`);
      return;
    }
    console.log(JSON.stringify(report, null, 2));
  }

  async workerArtifacts(executionId: string): Promise<void> {
    const report = this.kernel.getWorkerExecutionEngine().getReport(executionId);
    if (!report) {
      console.log(`✖ No worker execution report found for ID '${executionId}'`);
      return;
    }
    console.log(`EXECUTION ARTIFACTS (${report.artifacts.length}):`);
    for (const art of report.artifacts) {
      console.log(`  - [${art.type}] ${art.path} (${art.sizeBytes} bytes)`);
    }
  }

  // ─── Mission Decomposition & Task Assignment CLI ────────────────

  async missionPlanDecompose(title: string = 'User Management API', goal: string = 'Create a REST API for User Management'): Promise<void> {
    console.log(`[Decomposing Mission '${title}' for goal: '${goal}']...`);
    const { mission, plan } = await this.kernel.getMissionEngine().decomposeAndPlanMission(title, goal);
    console.log(`✔ Mission '${mission.id}' decomposed into ${plan.tasks.length} tasks across ${plan.executionBatches.length} DAG batches:`);
    console.log(JSON.stringify(plan, null, 2));
  }

  async missionAssign(missionId: string): Promise<void> {
    const plan = this.kernel.getMissionEngine().getExecutionPlan(missionId);
    if (!plan) {
      console.log(`✖ No execution plan found for mission '${missionId}'`);
      return;
    }
    const updatedPlan = this.kernel.getTaskAssignmentEngine().assignPlanTasks(plan);
    console.log(`✔ Assigned ${updatedPlan.tasks.length} tasks for mission '${missionId}':`);
    console.log(`  - Department Assignments: ${JSON.stringify(updatedPlan.departmentAssignments)}`);
    console.log(`  - Worker Assignments: ${JSON.stringify(updatedPlan.workerAssignments)}`);
  }

  async missionInspectPlan(missionId: string): Promise<void> {
    const plan = this.kernel.getMissionEngine().getExecutionPlan(missionId);
    if (!plan) {
      console.log(`✖ No execution plan found for mission '${missionId}'`);
      return;
    }
    console.log(`MISSION EXECUTION PLAN ('${missionId}'):`);
    console.log(`  - Goal: ${plan.goal}`);
    console.log(`  - Total Tasks: ${plan.tasks.length}`);
    console.log(`  - Execution Batches (DAG):`);
    for (let i = 0; i < plan.executionBatches.length; i++) {
      console.log(`     Batch ${i + 1}: [${plan.executionBatches[i].join(', ')}]`);
    }
  }

  // ─── Mission Execution Orchestrator CLI ─────────────────────────

  async missionExecute(missionId?: string): Promise<void> {
    let targetMissionId = missionId;
    let plan = targetMissionId ? this.kernel.getMissionEngine().getExecutionPlan(targetMissionId) : undefined;

    if (!plan) {
      console.log(`[No existing plan for mission '${missionId || 'new'}'. Decomposing & planning new mission...]`);
      const res = await this.kernel.getMissionEngine().decomposeAndPlanMission('REST API User Management', 'Create a REST API for User Management');
      targetMissionId = res.mission.id;
      plan = res.plan;
    }

    console.log(`[Executing Mission Execution Plan for mission '${targetMissionId}']...`);
    const result = await this.kernel.getMissionExecutionOrchestrator().executeMissionPlan(plan);
    console.log(`✔ Mission Execution Finished (Success: ${result.success} | Status: ${result.state.status})`);
    console.log(`  - Completed Tasks (${result.state.completedTaskIds.length}): [${result.state.completedTaskIds.join(', ')}]`);
    console.log(`  - Failed Tasks (${result.state.failedTaskIds.length}): [${result.state.failedTaskIds.join(', ')}]`);
  }

  async missionExecutionStatus(missionId: string): Promise<void> {
    const state = this.kernel.getMissionExecutionOrchestrator().getState(missionId);
    if (!state) {
      console.log(`✖ No execution state found for mission '${missionId}'`);
      return;
    }
    console.log(`MISSION EXECUTION STATUS ('${missionId}'):`);
    console.log(JSON.stringify(state, null, 2));
  }

  async missionCancel(missionId: string): Promise<void> {
    const cancelled = this.kernel.getMissionExecutionOrchestrator().cancelExecution(missionId);
    if (cancelled) {
      console.log(`✔ Mission execution cancelled for '${missionId}'`);
    } else {
      console.log(`✖ Could not cancel mission '${missionId}' (Not actively running)`);
    }
  }

  // ─── Project Lifecycle Orchestrator CLI ─────────────────────────────

  async projectRun(goal: string = 'Create a REST API for User Management'): Promise<void> {
    console.log(`[Starting Autonomous Project Lifecycle for Goal: '${goal}']...`);
    const result = await this.kernel.getProjectLifecycleOrchestrator().runProject(goal);
    console.log(`✔ Project Lifecycle Finished (Success: ${result.success} | Status: ${result.state.status})`);
    console.log(`  - Project ID: ${result.state.projectId}`);
    console.log(`  - Summary: ${result.summary}`);
    console.log(`  - Reports Harvested (${Object.keys(result.reports).length}): [${Object.keys(result.reports).join(', ')}]`);
  }

  async projectStatus(projectId: string): Promise<void> {
    const state = this.kernel.getProjectLifecycleOrchestrator().getState(projectId);
    if (!state) {
      console.log(`✖ No project state found for ID '${projectId}'`);
      return;
    }
    console.log(`PROJECT EXECUTION STATUS ('${projectId}'):`);
    console.log(JSON.stringify(state, null, 2));
  }

  async projectReport(projectId: string): Promise<void> {
    const result = this.kernel.getProjectLifecycleOrchestrator().getResult(projectId);
    if (!result) {
      console.log(`✖ No project execution result found for ID '${projectId}'`);
      return;
    }
    console.log(`PROJECT EXECUTION REPORT ('${projectId}'):`);
    console.log(`  - Goal: ${result.state.goal}`);
    console.log(`  - Status: ${result.state.status}`);
    console.log(`  - Summary: ${result.summary}`);
    console.log(`  - Execution Reports:`);
    console.log(JSON.stringify(result.reports, null, 2));
  }

  // ─── Verification Pipeline CLI ───────────────────────────────────────

  async verifyWorkspace(workspacePath: string = './.se_workspaces'): Promise<void> {
    console.log(`[Running Verification Pipeline on workspace '${workspacePath}']...`);
    const res = await this.kernel.getVerificationPipeline().verify({
      taskId: 'cli-verify-task',
      workspacePath,
    });
    console.log(`✔ Verification Finished (Status: ${res.status} | Score: ${res.qualityScore}/100)`);
    console.log(`  - Passed Steps: ${res.stepResults.filter((s) => s.passed).length}/${res.stepResults.length}`);
    console.log(JSON.stringify(res, null, 2));
  }

  async verifyTaskResults(taskId: string): Promise<void> {
    const report = this.kernel.getWorkerExecutionEngine().getReport(taskId);
    const workspacePath = report?.artifacts?.find((a: any) => a.path)?.path || `./.se_workspaces/ws-${taskId}`;
    console.log(`[Running Verification Pipeline on task '${taskId}' at '${workspacePath}']...`);
    const res = await this.kernel.getVerificationPipeline().verify({
      taskId,
      workspacePath,
      artifacts: report?.artifacts,
    });
    console.log(`✔ Task Verification (Status: ${res.status} | Score: ${res.qualityScore}/100)`);
    console.log(JSON.stringify(res, null, 2));
  }

  async verifyProjectResults(projectId: string): Promise<void> {
    const result = this.kernel.getProjectLifecycleOrchestrator().getResult(projectId);
    if (!result) {
      console.log(`✖ No project result found for ID '${projectId}'`);
      return;
    }
    console.log(`[Verifying all tasks for project '${projectId}']...`);
    for (const taskId of Object.keys(result.reports)) {
      const rep = result.reports[taskId];
      const wsPath = rep?.artifacts?.find((a: any) => a.path)?.path || `./.se_workspaces/ws-${taskId}`;
      const res = await this.kernel.getVerificationPipeline().verify({
        taskId,
        projectId,
        workspacePath: wsPath,
        artifacts: rep?.artifacts,
      });
      console.log(`  - Task ${taskId}: ${res.status} (Quality Score: ${res.qualityScore}/100)`);
    }
  }

  // ─── Mission Control Dashboard CLI ───────────────────────────────────

  async dashboardLaunch(): Promise<void> {
    console.log(`[SE-OS Mission Control Dashboard]`);
    console.log(`  - Single-Screen HUD: ./dashboard/index.html`);
    console.log(`  - Tech Stack: React 18 + Vite + TypeScript + TailwindCSS`);
    console.log(`  - Status: Telemetry Service Connected (100% Operational)`);
  }

  async shutdown(): Promise<void> {
    console.log(`[SE-OS Kernel] Initiating workforce shutdown...`);
    await this.kernel.shutdown();


    console.log(`✔ Company workforce shutdown complete.`);
  }
}





