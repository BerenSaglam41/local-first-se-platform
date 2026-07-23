import { CodeSymbol } from '../models/ast';

export interface ICodeSliceEngine {
  extractSlice(content: string, startLine: number, endLine: number): string;
  attachComments(content: string, symbolStartLine: number): string | undefined;
}
