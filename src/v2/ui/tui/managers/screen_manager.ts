export type TuiScreenType =
  | 'STARTUP'
  | 'RUNTIME_SELECTION'
  | 'MAIN_MENU'
  | 'NEW_PROJECT_PROMPT'
  | 'PROJECT_EXECUTION'
  | 'WORKSPACE_VIEWER'
  | 'SETTINGS'
  | 'EXIT';

export class ScreenManager {
  private currentScreen: TuiScreenType = 'STARTUP';
  private screenHistory: TuiScreenType[] = [];

  getCurrentScreen(): TuiScreenType {
    return this.currentScreen;
  }

  navigateTo(screen: TuiScreenType): void {
    if (this.currentScreen !== screen) {
      this.screenHistory.push(this.currentScreen);
      this.currentScreen = screen;
    }
  }

  goBack(): void {
    const prev = this.screenHistory.pop();
    if (prev) {
      this.currentScreen = prev;
    } else {
      this.currentScreen = 'MAIN_MENU';
    }
  }
}
