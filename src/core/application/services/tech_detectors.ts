export interface ITechnologyDetector {
  name: string;
  detect(packageJson: any, files: string[]): boolean;
}

export class TypeScriptDetector implements ITechnologyDetector {
  name = 'TypeScript';
  detect(packageJson: any, files: string[]): boolean {
    const hasDependency = packageJson && (
      (packageJson.dependencies && packageJson.dependencies.typescript) ||
      (packageJson.devDependencies && packageJson.devDependencies.typescript)
    );
    const hasTsFile = files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));
    return !!(hasDependency || hasTsFile);
  }
}

export class JavaScriptDetector implements ITechnologyDetector {
  name = 'JavaScript';
  detect(packageJson: any, files: string[]): boolean {
    return files.some(f => f.endsWith('.js') || f.endsWith('.jsx'));
  }
}

export class NodejsDetector implements ITechnologyDetector {
  name = 'Node.js';
  detect(packageJson: any, files: string[]): boolean {
    // If package.json is present, it's a Node.js project
    return !!packageJson;
  }
}

export class ReactDetector implements ITechnologyDetector {
  name = 'React';
  detect(packageJson: any, files: string[]): boolean {
    return !!(packageJson && (
      (packageJson.dependencies && packageJson.dependencies.react) ||
      (packageJson.devDependencies && packageJson.devDependencies.react)
    ));
  }
}

export class ExpressDetector implements ITechnologyDetector {
  name = 'Express';
  detect(packageJson: any, files: string[]): boolean {
    return !!(packageJson && (
      (packageJson.dependencies && packageJson.dependencies.express) ||
      (packageJson.devDependencies && packageJson.devDependencies.express)
    ));
  }
}

export class JestDetector implements ITechnologyDetector {
  name = 'Jest';
  detect(packageJson: any, files: string[]): boolean {
    return !!(packageJson && (
      (packageJson.dependencies && packageJson.dependencies.jest) ||
      (packageJson.devDependencies && packageJson.devDependencies.jest)
    ));
  }
}

export class VitestDetector implements ITechnologyDetector {
  name = 'Vitest';
  detect(packageJson: any, files: string[]): boolean {
    return !!(packageJson && (
      (packageJson.dependencies && packageJson.dependencies.vitest) ||
      (packageJson.devDependencies && packageJson.devDependencies.vitest)
    ));
  }
}

export const standardDetectors: ITechnologyDetector[] = [
  new TypeScriptDetector(),
  new JavaScriptDetector(),
  new NodejsDetector(),
  new ReactDetector(),
  new ExpressDetector(),
  new JestDetector(),
  new VitestDetector()
];
