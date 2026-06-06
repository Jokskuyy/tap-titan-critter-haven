/**
 * Grid Detector — Automatically detects grid cell boundaries
 * within a cropped game screenshot using gradient projection analysis.
 * 
 * Works by finding periodic patterns of color transitions that indicate
 * where one cell ends and the next begins.
 */
const GridDetector = (() => {

  /**
   * Detect precise grid cell positions within the cropped area.
   * @param {HTMLCanvasElement} srcCanvas - Source canvas with full screenshot
   * @param {{ x, y, width, height }} cropRect - Rough crop area
   * @param {number} expectedRows - Expected number of rows (e.g., 7)
   * @param {number} expectedCols - Expected number of columns (e.g., 7)
   * @returns {{ cells: Array<Array<{x,y,w,h}>>, detected: boolean }}
   */
  function detectGrid(srcCanvas, cropRect, expectedRows, expectedCols) {
    const w = Math.floor(cropRect.width);
    const h = Math.floor(cropRect.height);

    if (w < 50 || h < 50) {
      return { cells: uniformGrid(cropRect, expectedRows, expectedCols), detected: false };
    }

    // Extract cropped region
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(srcCanvas, cropRect.x, cropRect.y, w, h, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // Convert to grayscale
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
    }

    // Vertical edge projection (for finding vertical grid lines → column boundaries)
    const vertProj = new Float32Array(w);
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let y = 0; y < h; y++) {
        sum += Math.abs(gray[y * w + x + 1] - gray[y * w + x - 1]);
      }
      vertProj[x] = sum;
    }

    // Horizontal edge projection (for finding horizontal grid lines → row boundaries)
    const horizProj = new Float32Array(h);
    for (let y = 1; y < h - 1; y++) {
      let sum = 0;
      for (let x = 0; x < w; x++) {
        sum += Math.abs(gray[(y + 1) * w + x] - gray[(y - 1) * w + x]);
      }
      horizProj[y] = sum;
    }

    // Find grid lines from projections
    const vertLines = findGridLines(vertProj, expectedCols, w);
    const horizLines = findGridLines(horizProj, expectedRows, h);

    const detected = vertLines.length === expectedCols + 1 && horizLines.length === expectedRows + 1;

    // Build cell rectangles
    const vLines = detected ? vertLines : uniformLines(expectedCols, w);
    const hLines = detected ? horizLines : uniformLines(expectedRows, h);

    const cells = [];
    for (let r = 0; r < hLines.length - 1; r++) {
      const row = [];
      for (let c = 0; c < vLines.length - 1; c++) {
        row.push({
          x: cropRect.x + vLines[c],
          y: cropRect.y + hLines[r],
          w: vLines[c + 1] - vLines[c],
          h: hLines[r + 1] - hLines[r]
        });
      }
      cells.push(row);
    }

    return { cells, detected };
  }

  /**
   * Find grid lines from an edge projection array.
   * Grid lines appear as VALLEYS (low gradient) between cells,
   * or as PEAKS (high gradient) at cell boundaries.
   * 
   * Strategy: find periodic peaks/valleys matching expected cell spacing.
   */
  function findGridLines(projection, expectedDivisions, totalSize) {
    const expectedSpacing = totalSize / expectedDivisions;
    const kernelSize = Math.max(3, Math.floor(expectedSpacing * 0.08));

    // Smooth the projection
    const smoothed = smooth(projection, kernelSize);

    // Compute autocorrelation to find exact cell period
    const period = findPeriod(smoothed, expectedSpacing, totalSize);

    // Use the detected period to find optimal grid offset
    const { offset, lines } = findBestAlignment(smoothed, period, expectedDivisions, totalSize);

    return lines;
  }

  /**
   * Find the repeating period in the projection using autocorrelation.
   */
  function findPeriod(projection, expectedSpacing, totalSize) {
    const minPeriod = Math.floor(expectedSpacing * 0.8);
    const maxPeriod = Math.ceil(expectedSpacing * 1.2);
    let bestPeriod = Math.round(expectedSpacing);
    let bestCorr = -Infinity;

    for (let period = minPeriod; period <= maxPeriod; period++) {
      let corr = 0;
      let count = 0;
      for (let i = 0; i < projection.length - period; i++) {
        corr += projection[i] * projection[i + period];
        count++;
      }
      corr /= count;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestPeriod = period;
      }
    }

    return bestPeriod;
  }

  /**
   * Find the best grid alignment by testing different offsets.
   * Maximizes total edge energy at grid line positions.
   */
  function findBestAlignment(projection, period, divisions, totalSize) {
    let bestScore = -Infinity;
    let bestOffset = 0;

    // Try offsets from 0 to period
    const halfPeriod = Math.floor(period / 2);
    for (let offset = 0; offset < period; offset++) {
      let score = 0;
      for (let i = 0; i <= divisions; i++) {
        const pos = Math.round(offset + i * period);
        if (pos >= 0 && pos < projection.length) {
          // Score = sum of edge energy in a small window around the line position
          const windowSize = Math.max(2, Math.floor(period * 0.05));
          for (let w = -windowSize; w <= windowSize; w++) {
            const p = pos + w;
            if (p >= 0 && p < projection.length) {
              score += projection[p];
            }
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestOffset = offset;
      }
    }

    // Generate final line positions
    const lines = [];
    for (let i = 0; i <= divisions; i++) {
      let pos = Math.round(bestOffset + i * period);
      // Snap to nearest local peak within small window
      pos = snapToPeak(projection, pos, Math.floor(period * 0.15));
      lines.push(Math.max(0, Math.min(totalSize, pos)));
    }

    // Ensure first = 0 and last = totalSize
    lines[0] = 0;
    lines[lines.length - 1] = totalSize;

    return { offset: bestOffset, lines };
  }

  /**
   * Snap a position to the nearest peak in the projection within a window.
   */
  function snapToPeak(projection, pos, window) {
    let bestPos = pos;
    let bestVal = -Infinity;
    const start = Math.max(0, pos - window);
    const end = Math.min(projection.length - 1, pos + window);
    for (let i = start; i <= end; i++) {
      if (projection[i] > bestVal) {
        bestVal = projection[i];
        bestPos = i;
      }
    }
    return bestPos;
  }

  /**
   * Smooth an array with a moving average.
   */
  function smooth(arr, kernelSize) {
    const result = new Float32Array(arr.length);
    const half = Math.floor(kernelSize / 2);
    for (let i = 0; i < arr.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
        sum += arr[j];
        count++;
      }
      result[i] = sum / count;
    }
    return result;
  }

  /**
   * Generate uniform grid lines (fallback).
   */
  function uniformLines(divisions, totalSize) {
    const lines = [];
    for (let i = 0; i <= divisions; i++) {
      lines.push(Math.round(i * totalSize / divisions));
    }
    return lines;
  }

  /**
   * Generate uniform grid cells (fallback).
   */
  function uniformGrid(cropRect, rows, cols) {
    const cellW = cropRect.width / cols;
    const cellH = cropRect.height / rows;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({
          x: cropRect.x + c * cellW,
          y: cropRect.y + r * cellH,
          w: cellW,
          h: cellH
        });
      }
      cells.push(row);
    }
    return cells;
  }

  return { detectGrid };
})();
