export type SymbolType = 'function' | 'class' | 'interface' | 'enum' | 'type_alias' | 'import' | 'export' | 'other';

export interface CodeSymbol {
  name: string;
  type: SymbolType;
  startLine: number; // 1-indexed
  endLine: number;   // 1-indexed
  content: string;
  attachedComment?: string;
  dependencies: string[]; // Names of referenced types, variables, classes, or imports
}

export interface FileAst {
  filePath: string;
  symbols: CodeSymbol[];
}
