export interface ClaudeCliDetectionResult {
    available: boolean;
    executablePath?: string;
    version?: string;
    error?: string;
}
export declare class ClaudeCliDetector {
    detect(customPath?: string): ClaudeCliDetectionResult;
    private findInPath;
}
