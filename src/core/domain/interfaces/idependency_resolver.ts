import { CodeSymbol, FileAst } from '../models/ast';

export interface DependencyResult {
  localDependencies: CodeSymbol[];
  externalDependencies: { filePath: string; symbolName: string }[];
}

export interface IDependencyResolver {
  resolveDependencies(
    symbolName: string,
    fileAst: FileAst,
    allFiles: FileAst[]
  ): DependencyResult;
}
