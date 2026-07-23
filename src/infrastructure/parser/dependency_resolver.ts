import { IDependencyResolver, DependencyResult } from '../../core/domain/interfaces/idependency_resolver';
import { FileAst, CodeSymbol } from '../../core/domain/models/ast';

export class DependencyResolver implements IDependencyResolver {
  resolveDependencies(
    symbolName: string,
    fileAst: FileAst,
    allFiles: FileAst[]
  ): DependencyResult {
    const localDeps = new Map<string, CodeSymbol>();
    const externalDeps = new Map<string, { filePath: string; symbolName: string }>();

    // Locate the starting symbol
    const startSymbol = fileAst.symbols.find((s) => s.name === symbolName);
    if (!startSymbol) {
      return { localDependencies: [], externalDependencies: [] };
    }

    const queue: string[] = [...startSymbol.dependencies];
    const visited = new Set<string>([symbolName]);

    while (queue.length > 0) {
      const currentRef = queue.shift()!;
      if (visited.has(currentRef)) continue;
      visited.add(currentRef);

      // 1. Check local symbols in same file AST
      const localMatch = fileAst.symbols.find((s) => s.name === currentRef);
      if (localMatch) {
        localDeps.set(localMatch.name, localMatch);
        // Transitively push dependencies
        queue.push(...localMatch.dependencies);
        continue;
      }

      // 2. Check exports in other files
      for (const otherFile of allFiles) {
        if (otherFile.filePath === fileAst.filePath) continue;

        // Find symbol matching the reference name that is exported
        const exportedSymbol = otherFile.symbols.find(
          (s) => s.name === currentRef && (s.type === 'export' || s.content.includes('export ') || s.content.includes('export {'))
        );

        if (exportedSymbol) {
          const key = `${otherFile.filePath}:${exportedSymbol.name}`;
          externalDeps.set(key, {
            filePath: otherFile.filePath,
            symbolName: exportedSymbol.name,
          });
          break; // Match found
        }
      }
    }

    return {
      localDependencies: Array.from(localDeps.values()),
      externalDependencies: Array.from(externalDeps.values()),
    };
  }
}
