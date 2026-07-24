export interface IDashboard {
  initialize(sessionName?: string): Promise<boolean>;
  writeMain(text: string): void;
  writeKnowledge(text: string): void;
  writeProvider(text: string): void;
  writeVerification(text: string): void;
  writeGit(text: string): void;
  attachBanner(sessionName?: string): string;
}
