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
  function extractRegion(img, x, y, w, h, targetSize = 48) {
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
  function extractFromCanvas(sourceCanvas, x, y, w, h, targetSize = 48) {
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
   * Lower = more similar. Compares center 80% of the image to avoid edge artifacts.
   */
  function computeMSE(imgData1, imgData2) {
    const w = imgData1.width;
    const h = imgData1.height;
    const d1 = imgData1.data;
    const d2 = imgData2.data;
    
    // Compare center region (skip thin edge which may have background bleed)
    const marginX = Math.floor(w * 0.1);
    const marginY = Math.floor(h * 0.1);
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
  async function prepareTemplate(url, name, targetSize = 48) {
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
  async function loadTemplates(fileList, targetSize = 48) {
    const promises = fileList.map(async (file) => {
      try {
        return await prepareTemplate(file.url, file.name, targetSize);
      } catch (err) {
        console.warn(`Failed to load template: ${file.name}`, err);
        return null;
      }
    });
    const results = await Promise.all(promises);
    return results.filter(r => r !== null);
  }

  /**
   * Internal match execution helper.
   * Computes MSE for ALL templates (no histogram pre-filter).
   * With ~30 templates at 48x48, this is still fast (<5ms per cell).
   * Uses weighted score: 60% MSE rank + 40% histogram similarity.
   */
  function runMatch(cellImageData, templates, targetSize = 48) {
    const cellHist = buildHistogram(cellImageData);

    // Compute both histogram score AND MSE for every template
    const scores = templates.map((t, idx) => {
      const histScore = compareHistograms(cellHist, t.histogram);
      const mse = computeMSE(cellImageData, t.imageData);
      return { idx, histScore, mse, name: t.name };
    });

    // Find best by MSE (primary signal for shape discrimination)
    let bestIdx = 0;
    let bestMSE = Infinity;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i].mse < bestMSE) {
        bestMSE = scores[i].mse;
        bestIdx = i;
      }
    }

    return {
      bestMatch: scores[bestIdx].idx,
      confidence: scores[bestIdx].histScore,
      mse: bestMSE,
      name: scores[bestIdx].name
    };
  }

  /**
   * Check if a cell's center region is mostly uniform green (empty slot indicator).
   * Returns true if the cell has low color variance and dominant green channel.
   */
  function isUniformGreen(cellImageData) {
    const d = cellImageData.data;
    const w = cellImageData.width;
    const h = cellImageData.height;
    // Sample center 60%
    const mx = Math.floor(w * 0.2);
    const my = Math.floor(h * 0.2);
    let sumR = 0, sumG = 0, sumB = 0;
    let sumR2 = 0, sumG2 = 0, sumB2 = 0;
    let count = 0;

    for (let y = my; y < h - my; y++) {
      for (let x = mx; x < w - mx; x++) {
        const idx = (y * w + x) * 4;
        const r = d[idx], g = d[idx + 1], b = d[idx + 2];
        sumR += r; sumG += g; sumB += b;
        sumR2 += r * r; sumG2 += g * g; sumB2 += b * b;
        count++;
      }
    }

    if (count === 0) return false;

    const avgR = sumR / count, avgG = sumG / count, avgB = sumB / count;
    const varR = sumR2 / count - avgR * avgR;
    const varG = sumG2 / count - avgG * avgG;
    const varB = sumB2 / count - avgB * avgB;
    const totalVar = varR + varG + varB;

    // Empty cells: green dominant, low variance (uniform background)
    // Typical empty: avgG > avgR && avgG > avgB, totalVar < 800
    return avgG > avgR && avgG > avgB && totalVar < 1200;
  }

  /**
   * Match a grid cell against all templates.
   * Strategy: "blocks-first" — match against non-empty templates first.
   * Only classify as empty if block match MSE is very high AND cell looks like uniform green.
   * Returns { bestMatch: templateIndex, confidence: number, name: string }
   */
  function matchCell(cellImageData, templates, targetSize = 48) {
    // Separate templates into blocks and empties
    const blockTemplates = [];
    const emptyTemplates = [];
    const blockToOrigIdx = [];
    const emptyToOrigIdx = [];

    templates.forEach((t, i) => {
      if (t.name.startsWith('empty')) {
        emptyTemplates.push(t);
        emptyToOrigIdx.push(i);
      } else {
        blockTemplates.push(t);
        blockToOrigIdx.push(i);
      }
    });

    // Step 1: Match against blocks only
    const blockResult = runMatch(cellImageData, blockTemplates, targetSize);
    const blockOrigIdx = blockToOrigIdx[blockResult.bestMatch];

    // Step 2: Decide if this is actually empty
    // Only consider empty if: block MSE is high AND cell is uniform green
    if (emptyTemplates.length > 0 && blockResult.mse > 1800 && isUniformGreen(cellImageData)) {
      // Confirm with empty template match
      const emptyResult = runMatch(cellImageData, emptyTemplates, targetSize);
      // Empty wins only if its MSE is significantly better than the block match
      if (emptyResult.mse < blockResult.mse * 0.7) {
        const emptyOrigIdx = emptyToOrigIdx[emptyResult.bestMatch];
        return {
          bestMatch: emptyOrigIdx,
          confidence: emptyResult.confidence,
          mse: emptyResult.mse,
          name: templates[emptyOrigIdx].name
        };
      }
    }

    // Default: return block match
    return {
      bestMatch: blockOrigIdx,
      confidence: blockResult.confidence,
      mse: blockResult.mse,
      name: templates[blockOrigIdx].name
    };
  }

  /**
   * Full pipeline: screenshot + crop rect + grid dims + templates → grid matrix.
   * Returns { grid: number[][], matchDetails: object[][] }
   */
  function processImage(img, cropRect, rows, cols, templates, targetSize = 48) {
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

        const template = templates[match.bestMatch];
        if (template.name.startsWith('empty')) {
          gridRow.push(0);
        } else {
          gridRow.push(match.bestMatch + 1);
        }
        detailRow.push(match);
      }
      grid.push(gridRow);
      matchDetails.push(detailRow);
    }

    // Remap: find unique template indices used, assign sequential IDs (skipping 0)
    const usedIndices = [...new Set(grid.flat())].filter(v => v !== 0).sort((a, b) => a - b);
    const remap = {};
    remap[0] = 0; // Empty stays empty
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
