import { EventEmitter } from 'events';
import { IRuntimePlugin, RuntimePluginManifest, RuntimeCapability, RuntimeValidationResult, RuntimePluginHealth, RuntimeConfiguration } from '../../src/v2/contracts/iruntime_plugin_system';
import { IRuntimeSession, SessionStreamOptions, SessionStreamResult } from '../../src/v2/contracts/iruntime_session';
import { IEventStore } from '../../src/v2/contracts/ievent_store';
import { ClaudeCliDetectionResult } from './claude_cli_detector';
export declare class ClaudeCodeRuntimePlugin extends EventEmitter implements IRuntimePlugin {
    private eventStore?;
    private attachedSessions;
    private detector;
    private detectionResult;
    private isInitialized;
    private manifest;
    constructor(eventStore?: IEventStore | undefined);
    initialize(config?: RuntimeConfiguration): Promise<void>;
    validate(): Promise<RuntimeValidationResult>;
    attachSession(session: IRuntimeSession): Promise<boolean>;
    detachSession(sessionId: string): Promise<boolean>;
    execute(taskPayload: Record<string, any>): Promise<Record<string, any>>;
    cancel(sessionId: string): Promise<boolean>;
    stream(sessionId: string, input: string, options?: SessionStreamOptions): Promise<SessionStreamResult>;
    heartbeat(): Promise<RuntimePluginHealth>;
    shutdown(): Promise<void>;
    capabilities(): RuntimeCapability[];
    metadata(): RuntimePluginManifest;
    getDetectionResult(): ClaudeCliDetectionResult;
    private emitEvent;
}
