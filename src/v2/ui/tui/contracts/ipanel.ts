import React from 'react';

export interface IPanel {
  id: string;
  title: string;
  isFocused: boolean;
  isFullscreen: boolean;
  focus(): void;
  blur(): void;
  toggleFullscreen(): void;
  handleInput(input: string, key: any): void;
}
