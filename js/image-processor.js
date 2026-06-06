/**
 * Critter Haven Bot — Image Processor v4
 * Template matching using EDGE/OUTLINE detection + color histogram.
 * 
 * Each block has a unique silhouette. By comparing edge maps (Sobel),
 * we match shapes rather than colors, making detection robust against
 * background color variations.
 */

const ImageProcessor = (() => {

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function loadImageFromURL(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function extractRegion(img, x, y, w, h, targetSize = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, x, y, w, h, 0, 0, targetSize, targetSize);
    return ctx.getImageData(0, 0, targetSize, targetSize);
  }

  function extractFromCanvas(sourceCanvas, x, y, w, h, targetSize = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, targetSize, targetSize);
    return ctx.getImageData(0, 0, targetSize, targetSize);
  }

  // ─── Color Histogram ───────────────────────────────────────────

  function buildHistogram(imgData) {
    const bins = 8;
    const hist = new Float32Array(bins * bins * bins);
    const data = imgData.data;
    let count = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue; // Ignore transparent pixels
      
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      
      // Ignore board background (green)
      const isBg = (g > r + 30) && (g > b + 50) && (r > 80 && r < 200) && (g > 140 && g < 240) && (b < 120);
      if (isBg) continue;
      
      const binR = Math.floor((r / 256) * bins);
      const binG = Math.floor((g / 256) * bins);
      const binB = Math.floor((b / 256) * bins);
      
      hist[binR * bins * bins + binG * bins + binB]++;
      count++;
    }
    
    if (count > 0) {
      for (let i = 0; i < hist.length; i++) {
        hist[i] /= count;
      }
    }
    return hist;
  }

  function compareHistograms(h1, h2) {
    let sum = 0;
    for (let i = 0; i < h1.length; i++) sum += Math.sqrt(h1[i] * h2[i]);
    return sum;
  }

  // ─── Edge Detection (Sobel) ────────────────────────────────────

  /**
   * Convert ImageData to grayscale Float32Array.
   */
  function toGrayscale(imageData) {
    const w = imageData.width, h = imageData.height;
    const d = imageData.data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
    }
    return gray;
  }

  /**
   * Compute Sobel edge magnitude map from ImageData.
   * Returns Float32Array of gradient magnitudes, normalized to [0, 1].
   */
  function computeEdgeMap(imageData) {
    const w = imageData.width, h = imageData.height;
    const gray = toGrayscale(imageData);
    const edges = new Float32Array(w * h);
    let maxMag = 0;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        // Sobel X kernel
        const gx =
          -1 * gray[(y-1)*w + (x-1)] + 1 * gray[(y-1)*w + (x+1)] +
          -2 * gray[y*w + (x-1)]     + 2 * gray[y*w + (x+1)] +
          -1 * gray[(y+1)*w + (x-1)] + 1 * gray[(y+1)*w + (x+1)];
        // Sobel Y kernel
        const gy =
          -1 * gray[(y-1)*w + (x-1)] + -2 * gray[(y-1)*w + x] + -1 * gray[(y-1)*w + (x+1)] +
           1 * gray[(y+1)*w + (x-1)] +  2 * gray[(y+1)*w + x] +  1 * gray[(y+1)*w + (x+1)];
        
        const mag = Math.sqrt(gx * gx + gy * gy);
        edges[y * w + x] = mag;
        if (mag > maxMag) maxMag = mag;
      }
    }

    // Normalize to [0, 1]
    if (maxMag > 0) {
      for (let i = 0; i < edges.length; i++) edges[i] /= maxMag;
    }

    return edges;
  }

  /**
   * Compare two edge maps using normalized cross-correlation.
   * Returns value between 0 (no match) and 1 (identical outline).
   * Only considers center 70% to avoid edge artifacts.
   */
  function compareEdgeMaps(edges1, edges2, size = 32, tImgData) {
    let sum1 = 0, sum2 = 0, sumProd = 0, sumSq1 = 0, sumSq2 = 0, count = 0;
    const margin = 1; // Only 1px margin to preserve outlines
    
    for (let y = margin; y < size - margin; y++) {
      for (let x = margin; x < size - margin; x++) {
        const idx = y * size + x;
        // Only evaluate edge correlation where the template actually has content
        if (tImgData.data[idx * 4 + 3] > 128) {
          const v1 = edges1[idx], v2 = edges2[idx];
          sum1 += v1; sum2 += v2; sumProd += v1 * v2;
          sumSq1 += v1 * v1; sumSq2 += v2 * v2; count++;
        }
      }
    }
    if (count === 0) return 0;
    
    const mean1 = sum1 / count, mean2 = sum2 / count;
    const var1 = sumSq1 / count - mean1 * mean1;
    const var2 = sumSq2 / count - mean2 * mean2;
    const covar = sumProd / count - mean1 * mean2;
    
    const denom = Math.sqrt(var1 * var2);
    if (denom < 0.0001) return 0;
    return Math.max(0, covar / denom);
  }

  // ─── MSE ───────────────────────────────────────────────────────

  function computeMSE(img1, img2) {
    const d1 = img1.data;
    const d2 = img2.data;
    let err = 0;
    let count = 0;
    const margin = Math.floor(img1.width * 0.15); // Match edge margin
    const w = img1.width;
    const h = img1.height;
    
    for (let y = margin; y < h - margin; y++) {
      for (let x = margin; x < w - margin; x++) {
        const idx = (y * w + x) * 4;
        // Compute MSE ONLY where the template has content
        if (d2[idx + 3] > 128) {
          const dr = d1[idx] - d2[idx];
          const dg = d1[idx + 1] - d2[idx + 1];
          const db = d1[idx + 2] - d2[idx + 2];
          err += dr * dr + dg * dg + db * db;
          count++;
        }
      }
    }
    return count === 0 ? Infinity : err / count;
  }

  // ─── Template Loading ──────────────────────────────────────────

  /**
   * Prepare template with histogram, imageData, AND edge map.
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
    const edgeMap = computeEdgeMap(imageData);
    return { name, img, histogram, imageData, edgeMap };
  }

  async function loadTemplates(fileList, targetSize = 32) {
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

  // ─── Matching ──────────────────────────────────────────────────

  /**
   * Match cell using 3-stage approach:
   * 1. Histogram → coarse filter (top 10)
   * 2. Edge map correlation → shape matching (primary signal)
   * 3. MSE → final tiebreaker
   */
  function matchCell(cellImageData, templates, targetSize = 32, config = {wEdge: 0.1, wHist: 0.4, wMSE: 0.5}) {
    const cellHist = buildHistogram(cellImageData);
    const cellEdges = computeEdgeMap(cellImageData);

    // Stage 1: Histogram coarse filter — all templates
    const histScores = templates.map((t, idx) => ({
      idx,
      histScore: compareHistograms(cellHist, t.histogram)
    }));
    histScores.sort((a, b) => b.histScore - a.histScore);

    // Stage 2+3: Edge correlation + MSE on top candidates
    const candidates = [];
    for (let i = 0; i < histScores.length; i++) {
      const t = templates[histScores[i].idx];
      const edgeScore = compareEdgeMaps(cellEdges, t.edgeMap, targetSize, t.imageData);
      const mse = computeMSE(cellImageData, t.imageData);
      candidates.push({
        idx: histScores[i].idx,
        histScore: histScores[i].histScore,
        edgeScore,
        mse,
        name: t.name
      });
    }

    // Normalize MSE to [0,1] range (invert: lower MSE = higher score)
    const maxMSE = Math.max(...candidates.map(c => c.mse));
    const minMSE = Math.min(...candidates.map(c => c.mse));
    const mseRange = maxMSE - minMSE;

    for (const c of candidates) {
      const mseNorm = mseRange > 0 ? 1 - (c.mse - minMSE) / mseRange : 1;
      c.combinedScore = (config.wEdge * c.edgeScore) + (config.wHist * c.histScore) + (config.wMSE * mseNorm);
    }

    candidates.sort((a, b) => b.combinedScore - a.combinedScore);
    
    
    const best = candidates[0];

    return {
      bestMatch: best.idx,
      confidence: best.combinedScore,
      mse: best.mse,
      name: best.name
    };
  }

  // ─── Empty Detection ───────────────────────────────────────────

  function isCellEmpty(cellImageData) {
    const d = cellImageData.data;
    const w = cellImageData.width, h = cellImageData.height;
    const mx = Math.floor(w * 0.2), my = Math.floor(h * 0.2);
    let sumR = 0, sumG = 0, sumB = 0;
    let sumR2 = 0, sumG2 = 0, sumB2 = 0;
    let count = 0;

    for (let y = my; y < h - my; y++) {
      for (let x = mx; x < w - mx; x++) {
        const idx = (y * w + x) * 4;
        const r = d[idx], g = d[idx+1], b = d[idx+2];
        sumR += r; sumG += g; sumB += b;
        sumR2 += r*r; sumG2 += g*g; sumB2 += b*b;
        count++;
      }
    }
    if (count === 0) return false;

    const avgR = sumR/count, avgG = sumG/count, avgB = sumB/count;
    const varR = sumR2/count - avgR*avgR;
    const varG = sumG2/count - avgG*avgG;
    const varB = sumB2/count - avgB*avgB;
    const totalVar = varR + varG + varB;

    // Must be green-dominant and low variance
    if (!(avgG > avgR && avgG > avgB && totalVar < 800)) return false;

    // Edge energy check: empty cells have almost no edges (flat green)
    // Blocks like Leaf are green but have visible outlines/veins
    const edges = computeEdgeMap(cellImageData);
    let edgeEnergy = 0;
    for (let y = my; y < h - my; y++) {
      for (let x = mx; x < w - mx; x++) {
        edgeEnergy += edges[y * w + x];
      }
    }
    edgeEnergy /= count; // average edge energy in center

    // Empty cells have very low edge energy (<0.05), blocks have more
    return edgeEnergy < 0.08;
  }

  // ─── Pipeline ──────────────────────────────────────────────────

  function processImage(img, cropRect, rows, cols, templates, targetSize = 32) {
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.width;
    srcCanvas.height = img.height;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(img, 0, 0);

    // GridDetector for precise cells
    let detectedCells = null;
    if (typeof GridDetector !== 'undefined') {
      const result = GridDetector.detectGrid(srcCanvas, cropRect, rows, cols);
      detectedCells = result.cells;
      console.log(`Grid detection: ${result.detected ? 'SUCCESS' : 'FALLBACK'}`);
    }

    const blockTemplates = templates.filter(t => !t.name.startsWith('empty'));
    const grid = [];
    const matchDetails = [];

    for (let r = 0; r < rows; r++) {
      const gridRow = [];
      const detailRow = [];
      for (let c = 0; c < cols; c++) {
        let cx, cy, cw, ch;

        if (detectedCells) {
          const cell = detectedCells[r][c];
          const inset = Math.max(1, Math.floor(Math.min(cell.w, cell.h) * 0.1));
          cx = cell.x + inset;
          cy = cell.y + inset;
          cw = cell.w - inset * 2;
          ch = cell.h - inset * 2;
        } else {
          const cellW = cropRect.width / cols;
          const cellH = cropRect.height / rows;
          const inset = Math.max(1, Math.floor(Math.min(cellW, cellH) * 0.08));
          cx = cropRect.x + c * cellW + inset;
          cy = cropRect.y + r * cellH + inset;
          cw = cellW - inset * 2;
          ch = cellH - inset * 2;
        }

        const cellImg = extractFromCanvas(srcCanvas, cx, cy, cw, ch, targetSize);
        if (typeof global !== 'undefined') {
          global.debugR = r;
          global.debugC = c;
        }

        if (isCellEmpty(cellImg)) {
          gridRow.push(0);
          detailRow.push({ bestMatch: -1, confidence: 0, mse: 0, name: 'empty' });
          continue;
        }

        const match = matchCell(cellImg, blockTemplates, targetSize);
        const originalIdx = templates.indexOf(blockTemplates[match.bestMatch]);

        gridRow.push(originalIdx + 1);
        detailRow.push({
          bestMatch: originalIdx,
          confidence: match.confidence,
          mse: match.mse,
          name: match.name
        });
      }
      grid.push(gridRow);
      matchDetails.push(detailRow);
    }

    // ─── Gravity Rule ─────────────────────────────────────────
    // Empty cells can't exist below filled cells in the same column.
    // Gravity pulls blocks down, so empties must be at TOP of column.
    // If we find empty below a block, re-match it as a block.
    for (let c = 0; c < cols; c++) {
      let foundBlock = false;
      for (let r = 0; r < rows; r++) {
        if (grid[r][c] !== 0) {
          foundBlock = true;
        } else if (foundBlock && grid[r][c] === 0) {
          // Impossible empty — re-match as block
          let cx2, cy2, cw2, ch2;
          if (detectedCells) {
            const cell = detectedCells[r][c];
            const inset = Math.max(1, Math.floor(Math.min(cell.w, cell.h) * 0.1));
            cx2 = cell.x + inset; cy2 = cell.y + inset;
            cw2 = cell.w - inset * 2; ch2 = cell.h - inset * 2;
          } else {
            const cellW = cropRect.width / cols;
            const cellH = cropRect.height / rows;
            const inset = Math.max(1, Math.floor(Math.min(cellW, cellH) * 0.08));
            cx2 = cropRect.x + c * cellW + inset; cy2 = cropRect.y + r * cellH + inset;
            cw2 = cellW - inset * 2; ch2 = cellH - inset * 2;
          }
          const cellData = extractFromCanvas(srcCanvas, cx2, cy2, cw2, ch2, targetSize);
          const match = matchCell(cellData, blockTemplates, targetSize);
          const originalIdx = templates.indexOf(blockTemplates[match.bestMatch]);
          grid[r][c] = originalIdx + 1;
          matchDetails[r][c] = {
            bestMatch: originalIdx, confidence: match.confidence,
            mse: match.mse, name: match.name
          };
          console.log(`Gravity fix: [${r},${c}] was empty → ${match.name}`);
        }
      }
    }

    const usedIndices = [...new Set(grid.flat())].filter(v => v !== 0).sort((a, b) => a - b);
    const remap = { 0: 0 };
    usedIndices.forEach((val, i) => { remap[val] = i + 1; });

    return {
      grid: grid.map(row => row.map(v => remap[v])),
      matchDetails,
      usedTemplates: usedIndices.map(i => templates[i - 1]),
      templateRemap: remap,
      numTypes: usedIndices.length
    };
  }

  return {
    loadImage, loadImageFromURL, prepareTemplate, loadTemplates,
    matchCell, processImage, buildHistogram, compareHistograms, computeMSE
  };

})();
