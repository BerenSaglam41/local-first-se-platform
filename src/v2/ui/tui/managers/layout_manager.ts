export interface TerminalDimensions {
  columns: number;
  rows: number;
}

export class LayoutManager {
  private dimensions: TerminalDimensions = {
    columns: process.stdout.columns || 120,
    rows: process.stdout.rows || 40,
  };

  updateDimensions(columns: number, rows: number): void {
    this.dimensions = { columns, rows };
  }

  getDimensions(): TerminalDimensions {
    return this.dimensions;
  }
}
