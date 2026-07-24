export interface TmuxPaneConfig {
  paneIndex: number;
  title: string;
}

export class TmuxIntegration {
  private sessionName: string;
  private panes = new Map<number, TmuxPaneConfig>();

  constructor(sessionName: string = 'se-os-company') {
    this.sessionName = sessionName;
  }

  createLayout(paneConfigs: TmuxPaneConfig[]): void {
    for (const config of paneConfigs) {
      this.panes.set(config.paneIndex, config);
    }
  }

  writePane(paneIndex: number, text: string): void {
    const pane = this.panes.get(paneIndex);
    if (pane) {
      // Abstraction for sending text to tmux pane
    }
  }

  clearPane(paneIndex: number): void {
    // Abstraction for clearing tmux pane
  }

  getSessionName(): string {
    return this.sessionName;
  }

  getPanes(): TmuxPaneConfig[] {
    return Array.from(this.panes.values());
  }
}
