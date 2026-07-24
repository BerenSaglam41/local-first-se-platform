import { WorkspaceManager, WorkspaceException } from '../src/infrastructure/workspace/workspace_manager';
import * as fs from 'fs';
import * as path from 'path';

describe('WorkspaceManager', () => {
  const baseTestDir = path.join(__dirname, 'temp_workspace_tests');
  let workspaceManager: WorkspaceManager;

  beforeEach(() => {
    if (fs.existsSync(baseTestDir)) {
      fs.rmSync(baseTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(baseTestDir, { recursive: true });
    workspaceManager = new WorkspaceManager();
  });

  afterEach(() => {
    if (fs.existsSync(baseTestDir)) {
      fs.rmSync(baseTestDir, { recursive: true, force: true });
    }
  });

  it('should throw WorkspaceException when path does not exist', async () => {
    const bogusPath = path.join(baseTestDir, 'non_existent_folder');
    await expect(workspaceManager.resolveWorkspace(bogusPath)).rejects.toThrow(WorkspaceException);
  });

  it('should throw WorkspaceException when path is a file instead of a directory', async () => {
    const filePath = path.join(baseTestDir, 'dummy.txt');
    fs.writeFileSync(filePath, 'hello');
    await expect(workspaceManager.resolveWorkspace(filePath)).rejects.toThrow(WorkspaceException);
  });

  it('should detect Node.js workspace metadata', async () => {
    const nodeDir = path.join(baseTestDir, 'my_node_app');
    fs.mkdirSync(nodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(nodeDir, 'package.json'),
      JSON.stringify({ name: 'custom-node-app', scripts: { build: 'tsc', test: 'jest' } })
    );

    const meta = await workspaceManager.resolveWorkspace(nodeDir);
    expect(meta.name).toBe('custom-node-app');
    expect(meta.projectType).toBe('Node.js');
    expect(meta.manifestFile).toBe('package.json');
    expect(meta.buildCommand).toBe('npm run build');
    expect(meta.testCommand).toBe('npm test');
    expect(meta.verificationCommands).toEqual(['npm run build', 'npm test']);
  });

  it('should detect Rust workspace metadata', async () => {
    const rustDir = path.join(baseTestDir, 'my_rust_app');
    fs.mkdirSync(rustDir, { recursive: true });
    fs.writeFileSync(path.join(rustDir, 'Cargo.toml'), '[package]\nname = "rust_calculator"\nversion = "0.1.0"');

    const meta = await workspaceManager.resolveWorkspace(rustDir);
    expect(meta.name).toBe('rust_calculator');
    expect(meta.projectType).toBe('Rust');
    expect(meta.manifestFile).toBe('Cargo.toml');
    expect(meta.buildCommand).toBe('cargo check');
    expect(meta.testCommand).toBe('cargo test');
    expect(meta.verificationCommands).toEqual(['cargo check', 'cargo test']);
  });

  it('should detect Go workspace metadata', async () => {
    const goDir = path.join(baseTestDir, 'my_go_service');
    fs.mkdirSync(goDir, { recursive: true });
    fs.writeFileSync(path.join(goDir, 'go.mod'), 'module github.com/user/go_service\n\ngo 1.21');

    const meta = await workspaceManager.resolveWorkspace(goDir);
    expect(meta.name).toBe('go_service');
    expect(meta.projectType).toBe('Go');
    expect(meta.manifestFile).toBe('go.mod');
    expect(meta.buildCommand).toBe('go build ./...');
    expect(meta.testCommand).toBe('go test ./...');
    expect(meta.verificationCommands).toEqual(['go build ./...', 'go test ./...']);
  });

  it('should detect Python workspace metadata', async () => {
    const pyDir = path.join(baseTestDir, 'my_py_app');
    fs.mkdirSync(pyDir, { recursive: true });
    fs.writeFileSync(path.join(pyDir, 'pyproject.toml'), '[tool.poetry]\nname = "py_app"');

    const meta = await workspaceManager.resolveWorkspace(pyDir);
    expect(meta.projectType).toBe('Python');
    expect(meta.manifestFile).toBe('pyproject.toml');
    expect(meta.buildCommand).toBe('python -m py_compile');
    expect(meta.testCommand).toBe('pytest');
    expect(meta.verificationCommands).toEqual(['python -m py_compile', 'pytest']);
  });

  it('should detect Java Maven workspace metadata', async () => {
    const javaDir = path.join(baseTestDir, 'my_java_app');
    fs.mkdirSync(javaDir, { recursive: true });
    fs.writeFileSync(path.join(javaDir, 'pom.xml'), '<project></project>');

    const meta = await workspaceManager.resolveWorkspace(javaDir);
    expect(meta.projectType).toBe('Java');
    expect(meta.manifestFile).toBe('pom.xml');
    expect(meta.buildCommand).toBe('mvn compile');
    expect(meta.testCommand).toBe('mvn test');
    expect(meta.verificationCommands).toEqual(['mvn compile', 'mvn test']);
  });

  it('should locate project root searching upwards from subdirectories', async () => {
    const parentDir = path.join(baseTestDir, 'root_repo');
    const subDir = path.join(parentDir, 'src', 'deep', 'folder');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(parentDir, 'package.json'), JSON.stringify({ name: 'root-repo' }));

    const meta = await workspaceManager.resolveWorkspace(subDir);
    expect(meta.rootPath).toBe(parentDir);
    expect(meta.name).toBe('root-repo');
  });
});
