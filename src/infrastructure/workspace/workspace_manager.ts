import * as fs from 'fs';
import * as path from 'path';
import { IWorkspaceManager } from '../../core/domain/interfaces/iworkspace_manager';
import { WorkspaceMetadata, ProjectType } from '../../core/domain/models/workspace';

export class WorkspaceException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceException';
  }
}

export class WorkspaceManager implements IWorkspaceManager {
  async resolveWorkspace(inputPath: string): Promise<WorkspaceMetadata> {
    if (!inputPath || typeof inputPath !== 'string') {
      throw new WorkspaceException('Workspace path must be a non-empty string.');
    }

    // Expand ~ home directory
    let expandedPath = inputPath;
    if (expandedPath.startsWith('~')) {
      const home = process.env.HOME || process.env.USERPROFILE || '';
      expandedPath = path.join(home, expandedPath.slice(1));
    }

    const absPath = path.resolve(expandedPath);

    if (!fs.existsSync(absPath)) {
      throw new WorkspaceException(`Workspace path does not exist: "${absPath}"`);
    }

    const stat = fs.statSync(absPath);
    if (!stat.isDirectory()) {
      throw new WorkspaceException(`Workspace path is not a directory: "${absPath}"`);
    }

    const rootPath = this.locateProjectRoot(absPath);
    const metadata = this.detectMetadata(rootPath);

    return metadata;
  }

  private locateProjectRoot(startDir: string): string {
    let current = startDir;

    while (current) {
      const rootMarkers = [
        'package.json',
        'Cargo.toml',
        'go.mod',
        'pyproject.toml',
        'setup.py',
        'pom.xml',
        'build.gradle',
        'build.gradle.kts',
        '.git',
      ];

      for (const marker of rootMarkers) {
        if (fs.existsSync(path.join(current, marker))) {
          return current;
        }
      }

      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return startDir;
  }

  private detectMetadata(rootPath: string): WorkspaceMetadata {
    const dirName = path.basename(rootPath);

    // 1. Node.js (package.json)
    const pkgPath = path.join(rootPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      let name = dirName;
      let buildCommand: string | undefined = undefined;
      let testCommand: string | undefined = undefined;

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name) name = pkg.name;
        if (pkg.scripts?.build) {
          buildCommand = 'npm run build';
        } else if (fs.existsSync(path.join(rootPath, 'tsconfig.json'))) {
          buildCommand = 'npx tsc --noEmit';
        }
        if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
          testCommand = 'npm test';
        }
      } catch {}

      const verificationCommands = [buildCommand, testCommand].filter(Boolean) as string[];

      return {
        name,
        rootPath,
        projectType: 'Node.js',
        manifestFile: 'package.json',
        buildCommand,
        testCommand,
        verificationCommands,
      };
    }

    // 2. Rust (Cargo.toml)
    const cargoPath = path.join(rootPath, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      let name = dirName;
      try {
        const content = fs.readFileSync(cargoPath, 'utf8');
        const match = content.match(/name\s*=\s*["']([^"']+)["']/);
        if (match) name = match[1];
      } catch {}

      return {
        name,
        rootPath,
        projectType: 'Rust',
        manifestFile: 'Cargo.toml',
        buildCommand: 'cargo check',
        testCommand: 'cargo test',
        verificationCommands: ['cargo check', 'cargo test'],
      };
    }

    // 3. Go (go.mod)
    const goModPath = path.join(rootPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      let name = dirName;
      try {
        const content = fs.readFileSync(goModPath, 'utf8');
        const match = content.match(/^module\s+(.+)$/m);
        if (match) name = path.basename(match[1].trim());
      } catch {}

      return {
        name,
        rootPath,
        projectType: 'Go',
        manifestFile: 'go.mod',
        buildCommand: 'go build ./...',
        testCommand: 'go test ./...',
        verificationCommands: ['go build ./...', 'go test ./...'],
      };
    }

    // 4. Python (pyproject.toml / setup.py / requirements.txt)
    const pyProject = path.join(rootPath, 'pyproject.toml');
    const setupPy = path.join(rootPath, 'setup.py');
    const reqTxt = path.join(rootPath, 'requirements.txt');
    if (fs.existsSync(pyProject) || fs.existsSync(setupPy) || fs.existsSync(reqTxt)) {
      const manifestFile = fs.existsSync(pyProject)
        ? 'pyproject.toml'
        : fs.existsSync(setupPy)
        ? 'setup.py'
        : 'requirements.txt';

      return {
        name: dirName,
        rootPath,
        projectType: 'Python',
        manifestFile,
        buildCommand: 'python -m py_compile',
        testCommand: 'pytest',
        verificationCommands: ['python -m py_compile', 'pytest'],
      };
    }

    // 5. Java (pom.xml / build.gradle / build.gradle.kts)
    const pomXml = path.join(rootPath, 'pom.xml');
    const gradle = path.join(rootPath, 'build.gradle');
    const gradleKts = path.join(rootPath, 'build.gradle.kts');
    if (fs.existsSync(pomXml) || fs.existsSync(gradle) || fs.existsSync(gradleKts)) {
      const manifestFile = fs.existsSync(pomXml)
        ? 'pom.xml'
        : fs.existsSync(gradle)
        ? 'build.gradle'
        : 'build.gradle.kts';

      const buildCommand = fs.existsSync(pomXml) ? 'mvn compile' : './gradlew build';
      const testCommand = fs.existsSync(pomXml) ? 'mvn test' : './gradlew test';

      return {
        name: dirName,
        rootPath,
        projectType: 'Java',
        manifestFile,
        buildCommand,
        testCommand,
        verificationCommands: [buildCommand, testCommand],
      };
    }

    // 6. Unknown / Fallback
    return {
      name: dirName,
      rootPath,
      projectType: 'Unknown',
      verificationCommands: [],
    };
  }
}
