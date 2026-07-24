"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeCliDetector = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ClaudeCliDetector {
    detect(customPath) {
        // 1. Check custom path or environment variable override
        const targetPath = customPath || process.env.CLAUDE_PATH || 'claude';
        try {
            const res = (0, child_process_1.spawnSync)(targetPath, ['--version'], { encoding: 'utf8', timeout: 5000 });
            if (res.status === 0 || (res.stdout && res.stdout.includes('claude'))) {
                const verOutput = (res.stdout || res.stderr || 'claude 1.0.0').trim();
                return {
                    available: true,
                    executablePath: targetPath,
                    version: verOutput,
                };
            }
        }
        catch (err) {
            // Fall through to system PATH lookup
        }
        // 2. System PATH resolution
        const resolved = this.findInPath('claude');
        if (resolved) {
            try {
                const res = (0, child_process_1.spawnSync)(resolved, ['--version'], { encoding: 'utf8', timeout: 5000 });
                return {
                    available: true,
                    executablePath: resolved,
                    version: (res.stdout || 'claude 1.0.0').trim(),
                };
            }
            catch (err) {
                return {
                    available: false,
                    error: `Executable found at ${resolved} but failed to execute: ${err.message}`,
                };
            }
        }
        return {
            available: false,
            error: `Claude Code CLI executable ('claude') not found in PATH or CLAUDE_PATH`,
        };
    }
    findInPath(binaryName) {
        const isWindows = process.platform === 'win32';
        const pathDelimiter = isWindows ? ';' : ':';
        const pathDirs = (process.env.PATH || '').split(pathDelimiter);
        const extensions = isWindows ? ['.exe', '.cmd', '.bat', ''] : [''];
        for (const dir of pathDirs) {
            for (const ext of extensions) {
                const fullPath = path.join(dir, binaryName + ext);
                try {
                    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                        return fullPath;
                    }
                }
                catch (err) {
                    // Ignore permission or access errors
                }
            }
        }
        return null;
    }
}
exports.ClaudeCliDetector = ClaudeCliDetector;
//# sourceMappingURL=claude_cli_detector.js.map