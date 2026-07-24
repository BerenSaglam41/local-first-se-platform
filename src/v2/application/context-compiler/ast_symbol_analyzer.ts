import * as ts from 'typescript';
import { ContextSymbol } from '../../contracts/icontext_package';

export class AstSymbolAnalyzer {
  analyzeSource(filePath: string, codeContent: string): ContextSymbol[] {
    const symbols: ContextSymbol[] = [];
    const sourceFile = ts.createSourceFile(
      filePath,
      codeContent,
      ts.ScriptTarget.Latest,
      true
    );

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        symbols.push({ name: node.name.text, kind: 'FUNCTION', filePath });
      } else if (ts.isClassDeclaration(node) && node.name) {
        symbols.push({ name: node.name.text, kind: 'CLASS', filePath });
      } else if (ts.isInterfaceDeclaration(node) && node.name) {
        symbols.push({ name: node.name.text, kind: 'INTERFACE', filePath });
      } else if (ts.isEnumDeclaration(node) && node.name) {
        symbols.push({ name: node.name.text, kind: 'ENUM', filePath });
      } else if (ts.isImportDeclaration(node)) {
        symbols.push({ name: node.moduleSpecifier.getText(sourceFile), kind: 'IMPORT', filePath });
      } else if (ts.isExportDeclaration(node)) {
        symbols.push({ name: 'export', kind: 'EXPORT', filePath });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return symbols;
  }
}
