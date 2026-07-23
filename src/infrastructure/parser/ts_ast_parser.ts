import Parser from 'tree-sitter';
// @ts-ignore
import TypeScript from 'tree-sitter-typescript';
import { IASTParser } from '../../core/domain/interfaces/iast_parser';
import { CodeSymbol, SymbolType } from '../../core/domain/models/ast';
import { ICodeSliceEngine } from '../../core/domain/interfaces/icode_slice_engine';
import { ValidationException } from '../../core/domain/errors/exceptions';

export class TypeScriptASTParser implements IASTParser {
  private parser: Parser;

  constructor(private sliceEngine: ICodeSliceEngine) {
    this.parser = new Parser();
    this.parser.setLanguage(TypeScript.typescript);
  }

  supportsLanguage(language: string): boolean {
    return language === 'typescript' || language === 'tsx' || language === 'javascript';
  }

  parse(content: string, language: string): CodeSymbol[] {
    if (language === 'tsx') {
      this.parser.setLanguage(TypeScript.tsx);
    } else {
      this.parser.setLanguage(TypeScript.typescript);
    }

    const tree = this.parser.parse(content);
    const symbols: CodeSymbol[] = [];

    try {
      const traverse = (node: Parser.SyntaxNode | null | undefined) => {
        if (!node) return;
        // Safe check for malformed syntax ERROR nodes
        if (node.type === 'ERROR') {
          // Log warning or throw exception if critical
          throw new ValidationException(`Syntax error detected at line ${node.startPosition.row + 1}`);
        }

        let isSymbol = false;
        let type: SymbolType = 'other';
        let name = '';

        switch (node.type) {
          case 'function_declaration':
          case 'generator_function_declaration':
          case 'method_definition': {
            isSymbol = true;
            type = 'function';
            const nameNode = node.childForFieldName('name');
            name = nameNode ? nameNode.text : 'anonymous';
            break;
          }
          case 'class_declaration': {
            isSymbol = true;
            type = 'class';
            const nameNode = node.childForFieldName('name');
            name = nameNode ? nameNode.text : 'anonymous';
            break;
          }
          case 'interface_declaration': {
            isSymbol = true;
            type = 'interface';
            const nameNode = node.childForFieldName('name');
            name = nameNode ? nameNode.text : 'anonymous';
            break;
          }
          case 'enum_declaration': {
            isSymbol = true;
            type = 'enum';
            const nameNode = node.childForFieldName('name');
            name = nameNode ? nameNode.text : 'anonymous';
            break;
          }
          case 'type_alias_declaration': {
            isSymbol = true;
            type = 'type_alias';
            const nameNode = node.childForFieldName('name');
            name = nameNode ? nameNode.text : 'anonymous';
            break;
          }
          case 'import_statement': {
            isSymbol = true;
            type = 'import';
            name = node.text;
            break;
          }
          case 'lexical_declaration': {
            let targetDecl: Parser.SyntaxNode | null = null;
            for (let i = 0; i < node.childCount; i++) {
              const c = node.child(i);
              if (c && c.type === 'variable_declarator') {
                targetDecl = c;
                break;
              }
            }

            if (targetDecl) {
              const valueNode = targetDecl.childForFieldName('value');
              if (valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression')) {
                isSymbol = true;
                type = 'function';
                const nameNode = targetDecl.childForFieldName('name');
                name = nameNode ? nameNode.text : 'anonymous';
              }
            }
            break;
          }
        }

        if (isSymbol) {
          let startNode = node;
          if (node.parent && (node.parent.type === 'export_statement' || node.parent.type === 'export_declaration')) {
            startNode = node.parent;
          }

          const startLine = startNode.startPosition.row + 1;
          const endLine = node.endPosition.row + 1;
          const symbolContent = this.sliceEngine.extractSlice(content, startLine, endLine);
          const attachedComment = this.sliceEngine.attachComments(content, startLine);
          let dependencies = this.extractReferences(node, name);

          // If it is a class method, append class constructor dependencies semantically
          if (node.type === 'method_definition' && node.parent && node.parent.type === 'class_body') {
            const classBody = node.parent;
            for (let i = 0; i < classBody.childCount; i++) {
              const child = classBody.child(i);
              if (child && child.type === 'method_definition') {
                const constructorNameNode = child.childForFieldName('name');
                if (constructorNameNode && constructorNameNode.text === 'constructor') {
                  const constructorRefs = this.extractReferences(child, 'constructor');
                  dependencies = Array.from(new Set([...dependencies, ...constructorRefs]));
                  break;
                }
              }
            }
          }

          symbols.push({
            name,
            type,
            startLine,
            endLine,
            content: symbolContent,
            attachedComment,
            dependencies,
          });
        }

        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) {
            traverse(child);
          }
        }
      };

      traverse(tree.rootNode);
    } finally {
      // In native Node.js tree-sitter, the C++ memory allocated for the Syntax Tree is tied to the JS wrapper object
      // and freed automatically by V8's garbage collector via destructor hooks. Because we do not store any reference
      // to the tree or its nodes outside the scope of this method, they become immediately eligible for GC.
    }

    // De-duplicate symbols by name and type, prioritizing implementation bodies over overload declarations
    const uniqueSymbols = new Map<string, CodeSymbol>();
    for (const sym of symbols) {
      const key = `${sym.type}:${sym.name}`;
      const existing = uniqueSymbols.get(key);
      if (!existing) {
        uniqueSymbols.set(key, sym);
      } else {
        const hasBody = sym.content.includes('{') || sym.content.includes('=>');
        const existingHasBody = existing.content.includes('{') || existing.content.includes('=>');
        if (hasBody && !existingHasBody) {
          uniqueSymbols.set(key, sym);
        }
      }
    }

    return Array.from(uniqueSymbols.values());
  }

  private extractReferences(node: Parser.SyntaxNode, symbolName: string): string[] {
    const refs = new Set<string>();

    const findIdentifiers = (n: Parser.SyntaxNode) => {
      if (n.type === 'type_identifier' || n.type === 'identifier') {
        const text = n.text;
        if (text !== symbolName && text.length > 0) {
          refs.add(text);
        }
      }

      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) {
          findIdentifiers(child);
        }
      }
    };

    findIdentifiers(node);
    return Array.from(refs);
  }
}
