import { AppState } from './ui/AppState.js';
import { GridRenderer } from './ui/GridRenderer.js';
import { UIController } from './ui/UIController.js';

document.addEventListener('DOMContentLoaded', () => {
  const state = new AppState();
  const canvas = document.getElementById('grid-canvas');
  const renderer = new GridRenderer(canvas);
  const ui = new UIController(state, renderer);
  
  ui.init();
});
