import { CodeSymbol } from '../models/ast';

export interface IASTParser {
  supportsLanguage(language: string): boolean;
  parse(content: string, language: string): CodeSymbol[];
}
