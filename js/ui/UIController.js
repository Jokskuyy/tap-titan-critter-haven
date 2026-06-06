import { BLOCK_COLORS, TEMPLATE_FILES } from './AppState.js';

const $ = id => document.getElementById(id);

export class UIController {
  constructor(state, renderer) {
    this.state = state;
    this.renderer = renderer;
    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');
  }

  init() {
    this.setupTabs();
    this.buildManualGrid();
    this.setupUpload();
    this.setupCrop();
    this.setupSolver();
    this.setupPlayback();
    this.setupUI();
    this.renderer.render(this.state);
    this.loadTemplates();
  }

  setupUI() {
    const modal = $('tutorial-modal');
    $('btn-tutorial').addEventListener('click', () => modal.classList.add('active'));
    $('btn-close-tutorial').addEventListener('click', () => modal.classList.remove('active'));

    setTimeout(() => {
      if (!localStorage.getItem('hideGithubToast')) {
        $('github-toast').classList.add('active');
      }
    }, 3000);

    $('btn-close-toast').addEventListener('click', () => {
      $('github-toast').classList.remove('active');
      localStorage.setItem('hideGithubToast', 'true');
    });
  }

  async loadTemplates() {
    const gallery = $('template-gallery');
    const status = $('template-status');

    const fileList = TEMPLATE_FILES.map(name => {
      let displayName = name;
      if (name.startsWith('TT2_')) {
        displayName = name.replace('TT2_', '');
      } else if (name.startsWith('Pet') && name.endsWith('Item')) {
        displayName = name.replace('Pet', 'Pet ').replace('Item', '');
      }
      return {
        url: `imgs/${name}.png`,
        name: displayName
      };
    });

    // Skeleton loader
    gallery.innerHTML = fileList.map(() =>
      '<div class="template-skeleton"></div>'
    ).join('');

    try {
      this.state.templates = await ImageProcessor.loadTemplates(fileList, 32);
      this.renderTemplateGallery();
      status.textContent = `${this.state.templates.length} templates loaded`;
      status.style.color = 'var(--accent-success)';
      this.buildDefaultTemplateMap();
      this.buildPalette();
      this.renderManualGrid();
    } catch (err) {
      gallery.innerHTML = '';
      status.textContent = 'Failed to load templates: ' + err.message;
      status.style.color = 'var(--accent-danger)';
    }
  }

  renderTemplateGallery() {
    const gallery = $('template-gallery');
    gallery.innerHTML = '';

    this.state.templates.forEach((t) => {
      if (t.name.startsWith('empty')) return;
      const item = document.createElement('div');
      item.className = 'template-item';
      item.title = t.name;

      const imgEl = document.createElement('img');
      imgEl.src = t.img.src;
      imgEl.alt = t.name;
      imgEl.loading = 'lazy';
      item.appendChild(imgEl);

      const label = document.createElement('span');
      label.className = 'template-label';
      label.textContent = t.name;
      item.appendChild(label);

      gallery.appendChild(item);
    });
  }

  setupTabs() {
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        this.tabContents.forEach(c => c.classList.toggle('active', c.dataset.tab === tab));
      });
    });
  }

  buildPalette() {
    const paletteEl = $('color-palette');
    paletteEl.innerHTML = '';

    const eraser = document.createElement('div');
    eraser.className = 'color-swatch eraser' + (this.state.selectedType === 0 ? ' active' : '');
    eraser.textContent = '✕';
    eraser.title = 'Eraser (right-click cell)';
    eraser.addEventListener('click', () => {
      this.state.selectedType = 0;
      this.updatePaletteSelection();
    });
    paletteEl.appendChild(eraser);

    const activeTemplates = this.state.templates.filter(t => !t.name.startsWith('empty'));
    const totalSwatches = activeTemplates.length > 0 ? activeTemplates.length : this.state.numTypes;

    for (let i = 1; i <= totalSwatches; i++) {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch' + (this.state.selectedType === i ? ' active' : '');
      const tpl = this.state.activeTemplateMap[i];
      if (tpl && tpl.img) {
        swatch.style.background = 'var(--bg-tertiary)';
        const img = document.createElement('img');
        img.src = tpl.img.src;
        img.alt = tpl.name || i;
        img.style.cssText = 'width:100%;height:100%;border-radius:6px;object-fit:cover;';
        swatch.appendChild(img);
        swatch.title = tpl.name || `Type ${i}`;
      } else {
        swatch.style.background = BLOCK_COLORS[i] || '#888';
        swatch.textContent = i;
        swatch.title = `Type ${i}`;
      }
      swatch.addEventListener('click', () => {
        this.state.selectedType = i;
        this.updatePaletteSelection();
      });
      paletteEl.appendChild(swatch);
    }
  }

  updatePaletteSelection() {
    const swatches = $('color-palette').querySelectorAll('.color-swatch');
    swatches.forEach((s, idx) => {
      s.classList.toggle('active', idx === this.state.selectedType || (idx === 0 && this.state.selectedType === 0));
    });
  }

  buildDefaultTemplateMap() {
    this.state.activeTemplateMap = {};
    const activeTemplates = this.state.templates.filter(t => !t.name.startsWith('empty'));
    for (let i = 0; i < activeTemplates.length; i++) {
      this.state.activeTemplateMap[i + 1] = activeTemplates[i];
    }
  }

  buildManualGrid() {
    this.state.gridRows = parseInt($('input-rows').value) || 7;
    this.state.gridCols = parseInt($('input-cols').value) || 7;
    this.state.numTypes = TEMPLATE_FILES.filter(n => !n.startsWith('empty')).length; // Always match template file count (excluding empty)
    this.state.grid = GridEngine.createGrid(this.state.gridRows, this.state.gridCols);
    this.state.originalGrid = GridEngine.cloneGrid(this.state.grid);
    this.state.selectedType = 1;
    this.buildDefaultTemplateMap();
    this.buildPalette();
    this.renderManualGrid();
    this.renderer.render(this.state);
    this.updateSolveButton();
    this.clearSolution();
  }

  renderManualGrid() {
    const manualGridEl = $('manual-grid');
    manualGridEl.innerHTML = '';
    for (let r = 0; r < this.state.gridRows; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'manual-grid-row';
      for (let c = 0; c < this.state.gridCols; c++) {
        const cell = document.createElement('div');
        cell.className = 'manual-grid-cell' + (this.state.grid[r][c] === 0 ? ' empty' : '');
        if (this.state.grid[r][c] !== 0) {
          const tpl = this.state.activeTemplateMap[this.state.grid[r][c]];
          if (tpl && tpl.img) {
            cell.style.background = 'transparent';
            cell.style.padding = '2px';
            const img = document.createElement('img');
            img.src = tpl.img.src;
            img.alt = tpl.name || this.state.grid[r][c];
            img.style.cssText = 'width:100%;height:100%;border-radius:4px;object-fit:cover;';
            cell.appendChild(img);
          } else {
            cell.style.background = BLOCK_COLORS[this.state.grid[r][c]] || '#888';
            cell.textContent = this.state.grid[r][c];
          }
        }
        cell.addEventListener('click', () => {
          if (this.state.grid[r][c] === this.state.selectedType && this.state.selectedType !== 0) {
            this.state.grid[r][c] = 0; // Erase if clicking the same block type again
          } else {
            this.state.grid[r][c] = this.state.selectedType; // Set to selected type
          }
          this.state.originalGrid = GridEngine.cloneGrid(this.state.grid);
          this.renderManualGrid();
          this.renderer.render(this.state);
          this.updateSolveButton();
          this.clearSolution();
        });
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.state.grid[r][c] = 0;
          this.state.originalGrid = GridEngine.cloneGrid(this.state.grid);
          this.renderManualGrid();
          this.renderer.render(this.state);
          this.updateSolveButton();
          this.clearSolution();
        });
        rowEl.appendChild(cell);
      }
      manualGridEl.appendChild(rowEl);
    }
  }

  setupUpload() {
    const zone = $('upload-zone');
    const input = $('file-input');

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) this.handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => {
      if (input.files.length > 0) this.handleFile(input.files[0]);
    });

    // Global paste handler
    document.addEventListener('paste', e => {
      if (e.clipboardData && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          this.handleFile(file);
          
          // Switch to image tab automatically
          this.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === 'image'));
          this.tabContents.forEach(c => c.classList.toggle('active', c.dataset.tab === 'image'));
        }
      }
    });
  }

  drawCropSelection(rect) {
    const cropCanvas = $('crop-canvas');
    const cropCtx = cropCanvas.getContext('2d');
    if (!this.state.cropImage) return;

    // Reset canvas to image
    cropCtx.drawImage(this.state.cropImage, 0, 0);
    if (!rect) return;

    // Draw dashed selection rectangle
    cropCtx.strokeStyle = '#6366f1';
    cropCtx.lineWidth = 3;
    cropCtx.setLineDash([8, 4]);
    cropCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    cropCtx.setLineDash([]);

    // Draw dark overlay outside selection
    cropCtx.fillStyle = 'rgba(0,0,0,0.4)';
    cropCtx.fillRect(0, 0, this.state.cropImage.width, rect.y);
    cropCtx.fillRect(0, rect.y + rect.height, this.state.cropImage.width, this.state.cropImage.height - (rect.y + rect.height));
    cropCtx.fillRect(0, rect.y, rect.x, rect.height);
    cropCtx.fillRect(rect.x + rect.width, rect.y, this.state.cropImage.width - (rect.x + rect.width), rect.height);
  }

  async handleFile(file) {
    try {
      this.state.cropImage = await ImageProcessor.loadImage(file);
      const preview = $('crop-preview');
      preview.style.display = 'block';
      const cropCanvas = $('crop-canvas');
      cropCanvas.width = this.state.cropImage.width;
      cropCanvas.height = this.state.cropImage.height;

      const w = this.state.cropImage.width;
      const h = this.state.cropImage.height;
      this.state.cropRect = null;

      // Smart Auto-Crop for standard vertical screenshots
      if (h / w > 1.3) {
        this.state.cropRect = {
          x: w * 0.05,
          y: h * 0.28,
          width: w * 0.90,
          height: h * 0.37
        };
        this.drawCropSelection(this.state.cropRect);
        this.showStatus('Auto-detected vertical screenshot. Tap Detect Grid or adjust selection.', 'success');
      } else {
        this.drawCropSelection(null);
        this.showStatus('Image loaded. Draw a rectangle over the grid area.', 'info');
      }

      $('image-grid-controls').style.display = 'block';
    } catch (err) {
      this.showStatus('Failed to load image: ' + err.message, 'error');
    }
  }

  setupCrop() {
    const cropCanvas = $('crop-canvas');

    const startCrop = (clientX, clientY) => {
      if (!this.state.cropImage) return;
      this.state.isCropping = true;
      const rect = cropCanvas.getBoundingClientRect();
      const scaleX = this.state.cropImage.width / rect.width;
      const scaleY = this.state.cropImage.height / rect.height;
      this.state.cropStart = {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const moveCrop = (clientX, clientY) => {
      if (!this.state.isCropping || !this.state.cropImage) return;
      const rect = cropCanvas.getBoundingClientRect();
      const scaleX = this.state.cropImage.width / rect.width;
      const scaleY = this.state.cropImage.height / rect.height;
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;

      const currentRect = {
        x: Math.min(this.state.cropStart.x, x),
        y: Math.min(this.state.cropStart.y, y),
        width: Math.abs(x - this.state.cropStart.x),
        height: Math.abs(y - this.state.cropStart.y)
      };
      this.drawCropSelection(currentRect);
    };

    const endCrop = (clientX, clientY) => {
      if (!this.state.isCropping || !this.state.cropImage) return;
      this.state.isCropping = false;
      const rect = cropCanvas.getBoundingClientRect();
      const scaleX = this.state.cropImage.width / rect.width;
      const scaleY = this.state.cropImage.height / rect.height;
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;

      this.state.cropRect = {
        x: Math.min(this.state.cropStart.x, x),
        y: Math.min(this.state.cropStart.y, y),
        width: Math.abs(x - this.state.cropStart.x),
        height: Math.abs(y - this.state.cropStart.y)
      };

      if (this.state.cropRect.width < 20 || this.state.cropRect.height < 20) {
        this.state.cropRect = null;
        this.drawCropSelection(null);
        this.showStatus('Crop area too small. Draw a larger rectangle.', 'warning');
      } else {
        this.drawCropSelection(this.state.cropRect);
      }
    };

    cropCanvas.addEventListener('mousedown', e => startCrop(e.clientX, e.clientY));
    cropCanvas.addEventListener('mousemove', e => moveCrop(e.clientX, e.clientY));
    cropCanvas.addEventListener('mouseup', e => endCrop(e.clientX, e.clientY));

    // Touch support (prevent scrolling during drag gesture on mobile)
    cropCanvas.addEventListener('touchstart', e => {
      if (e.touches.length > 0) {
        e.preventDefault();
        startCrop(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    cropCanvas.addEventListener('touchmove', e => {
      if (e.touches.length > 0) {
        e.preventDefault();
        moveCrop(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    cropCanvas.addEventListener('touchend', e => {
      if (e.changedTouches.length > 0) {
        e.preventDefault();
        endCrop(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
    }, { passive: false });

    $('btn-detect').addEventListener('click', () => this.detectGrid());
  }

  detectGrid() {
    if (!this.state.cropImage) {
      this.showStatus('Upload an image first.', 'warning');
      return;
    }
    if (this.state.templates.length === 0) {
      this.showStatus('Templates not loaded yet. Wait or check imgs/ folder.', 'warning');
      return;
    }

    const rect = this.state.cropRect || { x: 0, y: 0, width: this.state.cropImage.width, height: this.state.cropImage.height };
    const rows = parseInt($('img-rows').value) || 7;
    const cols = parseInt($('img-cols').value) || 7;

    try {
      const result = ImageProcessor.processImage(this.state.cropImage, rect, rows, cols, this.state.templates, 32);
      this.state.grid = result.grid;
      this.state.gridRows = rows;
      this.state.gridCols = cols;
      this.state.numTypes = result.numTypes;
      this.state.originalGrid = GridEngine.cloneGrid(this.state.grid);

      this.state.activeTemplateMap = {};
      result.usedTemplates.forEach((t, i) => {
        this.state.activeTemplateMap[i + 1] = t;
      });
      // Fill the rest of the activeTemplateMap with unused templates (except 'empty') so they show as images instead of numbers
      const activeTemplates = this.state.templates.filter(t => !t.name.startsWith('empty'));
      const unusedTemplates = activeTemplates.filter(t => !result.usedTemplates.includes(t));
      unusedTemplates.forEach((t, i) => {
        this.state.activeTemplateMap[result.usedTemplates.length + 1 + i] = t;
      });

      $('input-rows').value = rows;
      $('input-cols').value = cols;

      const usedNames = result.usedTemplates.map(t => t.name).join(', ');
      this.showStatus(`Detected ${this.state.numTypes} types (${usedNames}) on ${rows}×${cols}. Verify in Manual tab.`, 'success');

      this.buildPalette();
      this.renderManualGrid();
      this.renderer.render(this.state);
      this.updateSolveButton();
      this.clearSolution();

      this.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === 'manual'));
      this.tabContents.forEach(c => c.classList.toggle('active', c.dataset.tab === 'manual'));
    } catch (err) {
      console.error('Detection error:', err);
      this.showStatus('Detection failed: ' + err.message, 'error');
    }
  }

  setupSolver() {
    $('btn-build-grid').addEventListener('click', () => this.buildManualGrid());
    $('btn-clear-grid').addEventListener('click', () => this.clearGrid());
    $('btn-export-test').addEventListener('click', () => this.exportTestCase());
    $('btn-solve').addEventListener('click', () => this.startSolve());
    $('btn-abort').addEventListener('click', () => this.abortSolve());
  }

  exportTestCase() {
    if (!this.state.cropImage) {
      this.showStatus('No image to export.', 'warning');
      return;
    }
    
    const timestamp = Date.now();
    const basename = `test_${timestamp}`;

    // 1. Export JSON with template names instead of arbitrary IDs
    const namedGrid = this.state.grid.map(row => 
      row.map(id => id === 0 ? 'empty' : (this.state.activeTemplateMap[id]?.name || `Type ${id}`))
    );

    const data = {
      rows: this.state.gridRows,
      cols: this.state.gridCols,
      grid: namedGrid // This is the corrected ground truth with names
    };
    
    const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const aJson = document.createElement('a');
    aJson.href = jsonUrl;
    aJson.download = `${basename}.json`;
    aJson.click();
    URL.revokeObjectURL(jsonUrl);

    // 2. Export cropped image
    const rect = this.state.cropRect || { x: 0, y: 0, width: this.state.cropImage.width, height: this.state.cropImage.height };
    const canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.state.cropImage, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    
    canvas.toBlob((blob) => {
      const imgUrl = URL.createObjectURL(blob);
      const aImg = document.createElement('a');
      aImg.href = imgUrl;
      aImg.download = `${basename}.png`;
      aImg.click();
      URL.revokeObjectURL(imgUrl);
    }, 'image/png');

    this.showStatus('Exported test case (PNG and JSON).', 'success');
  }

  clearGrid() {
    this.state.grid = GridEngine.createGrid(this.state.gridRows, this.state.gridCols);
    this.state.originalGrid = GridEngine.cloneGrid(this.state.grid);
    this.renderManualGrid();
    this.renderer.render(this.state);
    this.updateSolveButton();
    this.clearSolution();
  }

  updateSolveButton() {
    const hasBlocks = this.state.grid && GridEngine.countRemaining(this.state.grid) > 0;
    $('btn-solve').disabled = !hasBlocks;
  }

  startSolve() {
    if (!this.state.grid || GridEngine.countRemaining(this.state.grid) === 0) return;

    this.clearSolution();
    this.state.originalGrid = GridEngine.cloneGrid(this.state.grid);
    this.state.bestSolutionSoFar = null;
    this.state.bestTapsSoFar = null;
    this.state.bestIsPartialSoFar = false;

    if (this.state.solverWorker) this.state.solverWorker.terminate();
    // Use string URL to prevent 404/resolution issues in mobile Safari
    this.state.solverWorker = new Worker('js/solver-worker.js');

    const timeLimit = (parseInt($('time-limit').value) || 30) * 1000;

    $('progress-section').classList.add('active');
    $('btn-solve').disabled = true;
    $('btn-abort').classList.remove('hidden');
    this.showStatus('Solving...', 'info');

    this.state.solverWorker.onmessage = (e) => {
      const data = e.data;

      if (data.type === 'progress') {
        $('stat-states').textContent = data.statesExplored.toLocaleString();
        $('stat-best').textContent = data.currentBest !== null ? `${data.currentBest} taps` : '—';
        $('stat-time').textContent = (data.elapsed / 1000).toFixed(1) + 's';
        const progress = Math.min(90, (data.elapsed / timeLimit) * 100);
        $('progress-bar').style.width = progress + '%';
      } else if (data.type === 'best_so_far') {
        this.state.bestSolutionSoFar = data.moves;
        this.state.bestTapsSoFar = data.taps;
        this.state.bestIsPartialSoFar = data.partial || false;
      } else if (data.type === 'solution') {
        $('progress-bar').style.width = '100%';
        this.state.solution = data.moves;
        this.state.currentStep = 0;
        this.showSolution(data);
        this.solverDone();
      } else if (data.type === 'nosolution') {
        this.state.solution = data.bestPartial;
        this.state.currentStep = 0;
        this.showPartialSolution(data);
        this.solverDone();
      }
    };

    this.state.solverWorker.onerror = (err) => {
      console.error('Worker error:', err);
      const errMsg = err.message || 'Worker initialization failed (check browser compatibility/security settings)';
      this.showStatus('Solver error: ' + errMsg, 'error');
      this.solverDone();
    };

    this.state.solverWorker.postMessage({ type: 'solve', grid: this.state.grid, timeLimit });
  }

  abortSolve() {
    if (this.state.solverWorker) {
      this.state.solverWorker.terminate();
      this.state.solverWorker = null;
    }

    if (this.state.bestSolutionSoFar) {
      this.state.solution = this.state.bestSolutionSoFar;
      this.state.currentStep = 0;
      if (this.state.bestIsPartialSoFar) {
        this.showPartialSolution({
          taps: this.state.bestTapsSoFar,
          bestPartial: this.state.bestSolutionSoFar
        });
      } else {
        const elapsedText = $('stat-time').textContent || '0s';
        const statesText = $('stat-states').textContent || '0';
        this.showSolution({
          taps: this.state.bestTapsSoFar,
          moves: this.state.bestSolutionSoFar,
          optimal: false,
          totalStates: parseInt(statesText.replace(/,/g, '')) || 0,
          time: parseFloat(elapsedText) * 1000 || 0
        });
      }
    } else {
      this.showStatus('Aborted. No solution found.', 'warning');
    }

    this.solverDone();
  }

  solverDone() {
    $('btn-solve').disabled = false;
    $('btn-abort').classList.add('hidden');
    setTimeout(() => {
      $('progress-section').classList.remove('active');
    }, 1000);
  }

  showSolution(data) {
    const section = $('solution-section');
    section.classList.add('active');

    $('solution-badge').innerHTML = data.optimal
      ? '<span class="solution-badge optimal">✅ Optimal</span>'
      : '<span class="solution-badge suboptimal">⚡ Best Found</span>';

    $('solution-meta').innerHTML = `
      <strong>${data.taps}</strong> taps · 
      <strong>${data.totalStates.toLocaleString()}</strong> states explored · 
      <strong>${(data.time / 1000).toFixed(1)}s</strong> elapsed
    `;

    this.showStatus(`Solution found: ${data.taps} taps${data.optimal ? ' (optimal)' : ''}`, 'success');
    this.buildMoveList();
    this.updatePlayback();
  }

  showPartialSolution(data) {
    const section = $('solution-section');
    section.classList.add('active');

    $('solution-badge').innerHTML = '<span class="solution-badge suboptimal">⚠️ Partial Clear</span>';
    $('solution-meta').innerHTML = `<strong>${data.taps}</strong> taps (partial clear)`;

    this.showStatus('No full clear found. Showing best partial solution.', 'warning');
    this.buildMoveList();
    this.updatePlayback();
  }

  clearSolution() {
    this.state.solution = null;
    this.state.currentStep = -1;
    this.stopAutoplay();
    $('solution-section').classList.remove('active');
    $('move-list').innerHTML = '';
  }

  buildMoveList() {
    const list = $('move-list');
    list.innerHTML = '';

    if (!this.state.solution) return;

    const initItem = document.createElement('div');
    initItem.className = 'move-item' + (this.state.currentStep === 0 ? ' active' : '');
    initItem.innerHTML = `
      <span class="move-num">0</span>
      <span class="move-detail">Initial state</span>
    `;
    initItem.addEventListener('click', () => this.goToStep(0));
    list.appendChild(initItem);

    this.state.solution.forEach((move, i) => {
      const item = document.createElement('div');
      item.className = 'move-item' + (this.state.currentStep === i + 1 ? ' active' : '');
      const color = BLOCK_COLORS[move.type] || '#888';
      item.innerHTML = `
        <span class="move-num">${i + 1}</span>
        <span class="move-color" style="background:${color}"></span>
        <span class="move-detail">Tap <strong>(${move.tap.row},${move.tap.col})</strong> — ${move.groupSize} block${move.groupSize > 1 ? 's' : ''}</span>
      `;
      item.addEventListener('click', () => this.goToStep(i + 1));
      list.appendChild(item);
    });
  }

  setupPlayback() {
    $('btn-first').addEventListener('click', () => this.goToStep(0));
    $('btn-prev').addEventListener('click', () => this.goToStep(Math.max(0, this.state.currentStep - 1)));
    $('btn-next').addEventListener('click', () => {
      if (this.state.solution) this.goToStep(Math.min(this.state.solution.length, this.state.currentStep + 1));
    });
    $('btn-last').addEventListener('click', () => {
      if (this.state.solution) this.goToStep(this.state.solution.length);
    });
    $('btn-autoplay').addEventListener('click', () => this.toggleAutoplay());
  }

  goToStep(step) {
    if (!this.state.solution) return;
    this.state.currentStep = step;
    this.updatePlayback();
  }

  updatePlayback() {
    if (!this.state.solution) return;

    const total = this.state.solution.length;
    $('step-counter').textContent = `${this.state.currentStep} / ${total}`;

    let highlightCells = null;
    let tapCell = null;

    if (this.state.currentStep === 0) {
      if (this.state.solution.length > 0) {
        highlightCells = this.state.solution[0].cells;
        tapCell = this.state.solution[0].tap;
      }
    } else {
      if (this.state.currentStep < this.state.solution.length) {
        highlightCells = this.state.solution[this.state.currentStep].cells;
        tapCell = this.state.solution[this.state.currentStep].tap;
      }
    }

    this.renderer.render(this.state, highlightCells, tapCell);

    if (this.state.currentStep === 0 && this.state.solution.length > 0) {
      const next = this.state.solution[0];
      $('step-info').innerHTML = `Next: tap <span class="highlight">(${next.tap.row}, ${next.tap.col})</span> — ${next.groupSize} block${next.groupSize > 1 ? 's' : ''}`;
    } else if (this.state.currentStep > 0 && this.state.currentStep <= this.state.solution.length) {
      const prev = this.state.solution[this.state.currentStep - 1];
      let info = `Tapped <span class="highlight">(${prev.tap.row}, ${prev.tap.col})</span> — removed ${prev.groupSize} block${prev.groupSize > 1 ? 's' : ''}`;
      if (this.state.currentStep < this.state.solution.length) {
        const next = this.state.solution[this.state.currentStep];
        info += ` · Next: <span class="highlight">(${next.tap.row}, ${next.tap.col})</span>`;
      } else {
        info += ' · <span class="highlight">✨ Board cleared!</span>';
      }
      $('step-info').innerHTML = info;
    } else {
      $('step-info').innerHTML = '';
    }

    const items = $('move-list').querySelectorAll('.move-item');
    items.forEach((item, i) => {
      item.classList.toggle('active', i === this.state.currentStep);
    });

    const activeItem = $('move-list').querySelector('.move-item.active');
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  toggleAutoplay() {
    if (this.state.autoplayInterval) {
      this.stopAutoplay();
    } else {
      this.startAutoplay();
    }
  }

  startAutoplay() {
    if (!this.state.solution) return;
    $('btn-autoplay').textContent = '⏸';
    this.state.autoplayInterval = setInterval(() => {
      if (this.state.currentStep >= this.state.solution.length) {
        this.stopAutoplay();
        return;
      }
      this.goToStep(this.state.currentStep + 1);
    }, 1500);
  }

  stopAutoplay() {
    if (this.state.autoplayInterval) {
      clearInterval(this.state.autoplayInterval);
      this.state.autoplayInterval = null;
    }
    $('btn-autoplay').textContent = '▶';
  }

  showStatus(msg, type = 'info') {
    const el = $('status-msg');
    el.className = `status-msg active ${type}`;
    el.innerHTML = `<span>${msg}</span>`;
  }
}
