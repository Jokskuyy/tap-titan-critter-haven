import { BLOCK_COLORS } from './AppState.js';

export class GridRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  render(state, highlightCells = null, tapCell = null) {
    if (!state.grid) return;
    const wrapper = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(wrapper.clientWidth, 500);
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padding = 8;
    const gap = 3;
    const cellW = (size - padding * 2 - gap * (state.gridCols - 1)) / state.gridCols;
    const cellH = (size - padding * 2 - gap * (state.gridRows - 1)) / state.gridRows;
    const cellSize = Math.min(cellW, cellH);
    const offsetX = (size - (cellSize * state.gridCols + gap * (state.gridCols - 1))) / 2;
    const offsetY = (size - (cellSize * state.gridRows + gap * (state.gridRows - 1))) / 2;

    // Background
    this.ctx.fillStyle = '#0f1320';
    this.ctx.beginPath();
    this.ctx.roundRect(0, 0, size, size, 12);
    this.ctx.fill();

    // Subtle grid lines
    this.ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    this.ctx.lineWidth = 1;

    const displayGrid = state.getCurrentDisplayGrid();

    for (let r = 0; r < state.gridRows; r++) {
      for (let c = 0; c < state.gridCols; c++) {
        const x = offsetX + c * (cellSize + gap);
        const y = offsetY + r * (cellSize + gap);
        const type = displayGrid[r][c];
        const radius = Math.max(4, cellSize * 0.15);

        const isHighlighted = highlightCells && highlightCells.some(h => h.row === r && h.col === c);
        const isTap = tapCell && tapCell.row === r && tapCell.col === c;

        if (type === 0) {
          // Empty cell
          this.ctx.fillStyle = 'rgba(255,255,255,0.02)';
          this.ctx.beginPath();
          this.ctx.roundRect(x, y, cellSize, cellSize, radius);
          this.ctx.fill();
        } else {
          // Block — try drawing template image
          const tpl = state.activeTemplateMap[type];

          this.ctx.save();

          // Highlight styling: dim others, glow target
          if (highlightCells && highlightCells.length > 0) {
            if (!isHighlighted) {
              this.ctx.globalAlpha = 0.3; // Dim non-highlighted
            } else {
              this.ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
              this.ctx.shadowBlur = 20; // Glow effect
            }
          }

          // Clip rounded rect
          this.ctx.beginPath();
          this.ctx.roundRect(x, y, cellSize, cellSize, radius);
          this.ctx.clip();

          if (tpl && tpl.img) {
            // Draw template image
            this.ctx.drawImage(tpl.img, x, y, cellSize, cellSize);
          } else {
            // Fallback: colored block
            const color = BLOCK_COLORS[type] || '#888';
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x, y, cellSize, cellSize);

            // Label
            this.ctx.fillStyle = 'rgba(255,255,255,0.85)';
            this.ctx.font = `bold ${Math.max(10, cellSize * 0.35)}px Inter, sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(type, x + cellSize / 2, y + cellSize / 2);
          }

          this.ctx.restore();

          // Highlight border & tap crosshair
          if (isHighlighted) {
            this.ctx.strokeStyle = isTap ? '#ffffff' : 'rgba(255,255,255,0.8)';
            this.ctx.lineWidth = isTap ? 4 : 2;
            this.ctx.beginPath();
            this.ctx.roundRect(x + 1, y + 1, cellSize - 2, cellSize - 2, radius);
            this.ctx.stroke();

            if (isTap) {
              // Tap indicator — crosshair
              this.ctx.strokeStyle = '#ef4444'; // Red crosshair for visibility
              this.ctx.lineWidth = 3;
              this.ctx.beginPath();
              // Horizontal line
              this.ctx.moveTo(x - 5, y + cellSize / 2);
              this.ctx.lineTo(x + cellSize + 5, y + cellSize / 2);
              // Vertical line
              this.ctx.moveTo(x + cellSize / 2, y - 5);
              this.ctx.lineTo(x + cellSize / 2, y + cellSize + 5);
              this.ctx.stroke();
              
              // Center dot
              this.ctx.fillStyle = '#ffffff';
              this.ctx.beginPath();
              this.ctx.arc(x + cellSize / 2, y + cellSize / 2, 4, 0, Math.PI * 2);
              this.ctx.fill();
            }
          }
        }
      }
    }
  }
}
