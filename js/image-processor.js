/**
 * Critter Haven Bot — Image Processor v2
 * Template matching using reference block images.
 * 
 * Approach: for each grid cell in the screenshot, resize + compare against
 * all reference templates using normalized color histogram similarity.
 * Pick the best match above a threshold.
 */

const ImageProcessor = (() => {

  /**
   * Load image from File → HTMLImageElement.
   */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Load image from URL → HTMLImageElement.
   */
  function loadImageFromURL(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Extract pixel data from an image region, resized to a standard size.
   * Returns { data: Uint8ClampedArray, width, height }
   */
  function extractRegion(img, x, y, w, h, targetSize = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, x, y, w, h, 0, 0, targetSize, targetSize);
    return ctx.getImageData(0, 0, targetSize, targetSize);
  }

  /**
   * Extract pixel data from a canvas region.
   */
  function extractFromCanvas(sourceCanvas, x, y, w, h, targetSize = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, targetSize, targetSize);
    return ctx.getImageData(0, 0, targetSize, targetSize);
  }

  /**
   * Build a color histogram from ImageData (RGB, 8 bins per channel).
   * Returns Float64Array of length 512 (8^3 bins), normalized.
   */
  function buildHistogram(imageData) {
    const bins = 8;
    const hist = new Float64Array(bins * bins * bins);
    const data = imageData.data;
    let total = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = Math.min(bins - 1, Math.floor(data[i] / 32));
      const g = Math.min(bins - 1, Math.floor(data[i + 1] / 32));
      const b = Math.min(bins - 1, Math.floor(data[i + 2] / 32));
      const a = data[i + 3];
      if (a < 128) continue; // skip transparent
      hist[r * bins * bins + g * bins + b]++;
      total++;
    }

    // Normalize
    if (total > 0) {
      for (let i = 0; i < hist.length; i++) {
        hist[i] /= total;
      }
    }

    return hist;
  }

  /**
   * Compare two histograms using Bhattacharyya coefficient.
   * Returns value between 0 (no match) and 1 (identical).
   */
  function compareHistograms(h1, h2) {
    let sum = 0;
    for (let i = 0; i < h1.length; i++) {
      sum += Math.sqrt(h1[i] * h2[i]);
    }
    return sum; // already normalized
  }

  /**
   * Compute Mean Squared Error between two ImageData objects.
   * Lower = more similar. Compares center 60% of the image to avoid edge artifacts.
   */
  function computeMSE(imgData1, imgData2) {
    const w = imgData1.width;
    const h = imgData1.height;
    const d1 = imgData1.data;
    const d2 = imgData2.data;
    
    // Compare center region (skip edges which may have background)
    const marginX = Math.floor(w * 0.2);
    const marginY = Math.floor(h * 0.2);
    let totalError = 0;
    let count = 0;

    for (let y = marginY; y < h - marginY; y++) {
      for (let x = marginX; x < w - marginX; x++) {
        const idx = (y * w + x) * 4;
        const dr = d1[idx] - d2[idx];
        const dg = d1[idx + 1] - d2[idx + 1];
        const db = d1[idx + 2] - d2[idx + 2];
        totalError += dr * dr + dg * dg + db * db;
        count++;
      }
    }

    return count > 0 ? totalError / count : Infinity;
  }

  /**
   * Prepare a reference template from an image.
   * Returns { name, img, histogram, imageData }
   */
  async function prepareTemplate(url, name, targetSize = 32) {
    const img = await loadImageFromURL(url);
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, targetSize, targetSize);
    const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
    const histogram = buildHistogram(imageData);
    return { name, img, histogram, imageData };
  }

  /**
   * Load all reference templates from the imgs/ directory.
   * fileList: array of { url, name } objects
   */
  async function loadTemplates(fileList, targetSize = 32) {
    const templates = [];
    for (const file of fileList) {
      try {
        const template = await prepareTemplate(file.url, file.name, targetSize);
        templates.push(template);
      } catch (err) {
        console.warn(`Failed to load template: ${file.name}`, err);
      }
    }
    return templates;
  }

  /**
   * Match a grid cell against all templates.
   * Uses histogram comparison first (fast filter), then MSE for top candidates.
   * Returns { bestMatch: templateIndex, confidence: number, name: string }
   */
  function matchCell(cellImageData, templates, targetSize = 32) {
    const cellHist = buildHistogram(cellImageData);

    // Score all templates by histogram similarity
    const scores = templates.map((t, idx) => ({
      idx,
      histScore: compareHistograms(cellHist, t.histogram),
      name: t.name
    }));

    // Sort by histogram score (descending)
    scores.sort((a, b) => b.histScore - a.histScore);

    // Refine top 5 with MSE
    const topN = Math.min(5, scores.length);
    let bestIdx = scores[0].idx;
    let bestMSE = Infinity;
    let bestHistScore = scores[0].histScore;

    for (let i = 0; i < topN; i++) {
      const mse = computeMSE(cellImageData, templates[scores[i].idx].imageData);
      if (mse < bestMSE) {
        bestMSE = mse;
        bestIdx = scores[i].idx;
        bestHistScore = scores[i].histScore;
      }
    }

    return {
      bestMatch: bestIdx,
      confidence: bestHistScore,
      mse: bestMSE,
      name: templates[bestIdx].name
    };
  }

  /**
   * Full pipeline: screenshot + crop rect + grid dims + templates → grid matrix.
   * Returns { grid: number[][], matchDetails: object[][] }
   */
  function processImage(img, cropRect, rows, cols, templates, targetSize = 32) {
    // Draw full image to a source canvas
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.width;
    srcCanvas.height = img.height;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(img, 0, 0);

    const cellW = cropRect.width / cols;
    const cellH = cropRect.height / rows;

    const grid = [];
    const matchDetails = [];

    for (let r = 0; r < rows; r++) {
      const gridRow = [];
      const detailRow = [];
      for (let c = 0; c < cols; c++) {
        // Extract cell with slight inset to avoid grid lines
        const inset = Math.max(1, Math.floor(Math.min(cellW, cellH) * 0.08));
        const cx = cropRect.x + c * cellW + inset;
        const cy = cropRect.y + r * cellH + inset;
        const cw = cellW - inset * 2;
        const ch = cellH - inset * 2;

        const cellData = extractFromCanvas(srcCanvas, cx, cy, cw, ch, targetSize);
        const match = matchCell(cellData, templates, targetSize);

        // Template index + 1 (0 = empty)
        gridRow.push(match.bestMatch + 1);
        detailRow.push(match);
      }
      grid.push(gridRow);
      matchDetails.push(detailRow);
    }

    // Remap: find unique template indices used, assign sequential IDs
    const usedIndices = [...new Set(grid.flat())].sort((a, b) => a - b);
    const remap = {};
    usedIndices.forEach((val, i) => { remap[val] = i + 1; });

    const remappedGrid = grid.map(row => row.map(v => remap[v]));

    return {
      grid: remappedGrid,
      matchDetails,
      usedTemplates: usedIndices.map(i => templates[i - 1]),
      templateRemap: remap,
      numTypes: usedIndices.length
    };
  }

  return {
    loadImage,
    loadImageFromURL,
    prepareTemplate,
    loadTemplates,
    matchCell,
    processImage,
    // Keep old methods for backward compat
    buildHistogram,
    compareHistograms,
    computeMSE
  };

})();
