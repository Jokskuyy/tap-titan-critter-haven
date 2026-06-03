export const BLOCK_COLORS = [
  null, // 0 = empty
  '#f59e0b', // 1
  '#ef4444', // 2
  '#3b82f6', // 3
  '#f97316', // 4
  '#10b981', // 5
  '#8b5cf6', // 6
  '#ec4899', // 7
  '#06b6d4', // 8
  '#84cc16', // 9
  '#f43f5e', // 10
];

export const TEMPLATE_FILES = [
  'TT2_Beet', 'TT2_Bone', 'TT2_BowTie', 'TT2_CandyCane', 'TT2_CatFood', 'TT2_Cherry', 
  'TT2_Emerald', 'TT2_EyeGlass', 'TT2_Grape', 'TT2_GreenFlower', 'TT2_HoneyComb', 'TT2_Leaf', 
  'TT2_Mushroom', 'TT2_Onion', 'TT2_Oranges', 'TT2_Pear', 'TT2_Pepper', 'TT2_PurpleFlower', 
  'TT2_RedTie', 'TT2_Starfish', 'TT2_Tennis', 'TT2_Walnut', 'TT2_Yarn', 'TT2_Rambutan'
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
