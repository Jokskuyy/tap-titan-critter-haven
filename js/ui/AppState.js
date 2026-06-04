export const BLOCK_COLORS = [
  null, // 0 = empty
  '#f59e0b', // 1 (Amber)
  '#ef4444', // 2 (Red)
  '#3b82f6', // 3 (Blue)
  '#f97316', // 4 (Orange)
  '#10b981', // 5 (Emerald)
  '#8b5cf6', // 6 (Violet)
  '#ec4899', // 7 (Pink)
  '#06b6d4', // 8 (Cyan)
  '#84cc16', // 9 (Lime)
  '#f43f5e', // 10 (Rose)
  '#6366f1', // 11 (Indigo)
  '#14b8a6', // 12 (Teal)
  '#a855f7', // 13 (Purple)
  '#d946ef', // 14 (Fuchsia)
  '#0ea5e9', // 15 (Sky)
  '#eab308', // 16 (Yellow)
  '#22c55e', // 17 (Green)
  '#f472b6', // 18 (Pink Light)
  '#fb7185', // 19 (Rose Light)
  '#38bdf8', // 20 (Sky Light)
  '#818cf8', // 21 (Indigo Light)
  '#34d399', // 22 (Emerald Light)
  '#fb923c', // 23 (Orange Light)
  '#a78bfa', // 24 (Violet Light)
  '#c084fc', // 25 (Purple Light)
  '#2dd4bf', // 26 (Teal Light)
  '#a3e635', // 27 (Lime Light)
  '#fda4af', // 28 (Rose Pink)
  '#93c5fd', // 29 (Blue Light)
  '#fde047', // 30 (Yellow Light)
];

export const TEMPLATE_FILES = [
  'TT2_Beet', 'TT2_Bone', 'TT2_BowTie', 'TT2_CandyCane', 'TT2_CatFood', 'TT2_Cherry', 
  'TT2_Emerald', 'TT2_EyeGlass', 'TT2_Grape', 'TT2_GreenFlower', 'TT2_HoneyComb', 'TT2_Leaf', 
  'TT2_Mushroom', 'TT2_Onion', 'TT2_Oranges', 'TT2_Pear', 'TT2_Pepper', 'TT2_PurpleFlower', 
  'TT2_RedTie', 'TT2_Starfish', 'TT2_Tennis', 'TT2_Walnut', 'TT2_Yarn', 'TT2_Rambutan',
  'Pet4Item', 'Pet15Item', 'Pet19Item', 'Pet20Item', 'Pet21Item', 'Pet30Item',
  'empty'
];

export class AppState {
  constructor() {
    this.grid = null;
    this.originalGrid = null;
    this.gridRows = 7;
    this.gridCols = 7;
    this.numTypes = 5;
    this.selectedType = 1;
    this.solution = null;
    this.currentStep = -1; // -1 = initial state
    
    this.templates = [];
    this.activeTemplateMap = {};

    this.cropImage = null;
    this.cropRect = null;
    this.isCropping = false;
    this.cropStart = null;
    
    this.solverWorker = null;
    this.autoplayInterval = null;
  }

  getCurrentDisplayGrid() {
    if (!this.solution || this.currentStep < 0) return this.grid;
    if (this.currentStep === 0) return this.originalGrid;
    return this.solution[this.currentStep - 1].gridAfter;
  }
}
