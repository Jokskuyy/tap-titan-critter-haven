/**
 * Critter Heaven Bot — Image Processor
 * Screenshot → Grid matrix via color sampling + k-means clustering.
 */

const ImageProcessor = (() => {

  /**
   * Load image from File object → HTMLImageElement.
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
   * Load image from URL string → HTMLImageElement.
   */
  function loadImageFromURL(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Sample pixel color at center of each grid cell.
   * cropRect: { x, y, width, height } — area of screenshot containing grid
   * rows, cols: grid dimensions
   * Returns 2D array of [r, g, b] values.
   */
  function sampleColors(img, cropRect, rows, cols) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const cellW = cropRect.width / cols;
    const cellH = cropRect.height / rows;
    const colors = [];

    for (let r = 0; r < rows; r++) {
      const rowColors = [];
      for (let c = 0; c < cols; c++) {
        // Sample 3x3 area at cell center for more robust color
        const cx = Math.floor(cropRect.x + c * cellW + cellW / 2);
        const cy = Math.floor(cropRect.y + r * cellH + cellH / 2);
        const samples = [];

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const pixel = ctx.getImageData(cx + dx, cy + dy, 1, 1).data;
            samples.push([pixel[0], pixel[1], pixel[2]]);
          }
        }

        // Average the samples
        const avg = [0, 0, 0];
        for (const s of samples) {
          avg[0] += s[0]; avg[1] += s[1]; avg[2] += s[2];
        }
        avg[0] = Math.round(avg[0] / samples.length);
        avg[1] = Math.round(avg[1] / samples.length);
        avg[2] = Math.round(avg[2] / samples.length);

        rowColors.push(avg);
      }
      colors.push(rowColors);
    }

    return colors;
  }

  /**
   * Euclidean distance between two RGB colors.
   */
  function colorDistance(a, b) {
    return Math.sqrt(
      (a[0] - b[0]) ** 2 +
      (a[1] - b[1]) ** 2 +
      (a[2] - b[2]) ** 2
    );
  }

  /**
   * K-Means clustering on RGB colors.
   * Returns { labels: 2D array of cluster IDs, centroids: array of [r,g,b] }
   */
  function kMeansClustering(colors2D, k, maxIter = 30) {
    // Flatten colors
    const rows = colors2D.length;
    const cols = colors2D[0].length;
    const flat = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        flat.push(colors2D[r][c]);
      }
    }

    // Initialize centroids using k-means++ style
    const centroids = [];
    centroids.push([...flat[Math.floor(Math.random() * flat.length)]]);

    for (let i = 1; i < k; i++) {
      const distances = flat.map(color => {
        const minDist = Math.min(...centroids.map(c => colorDistance(color, c)));
        return minDist * minDist;
      });
      const totalDist = distances.reduce((a, b) => a + b, 0);
      let rnd = Math.random() * totalDist;
      let idx = 0;
      for (let j = 0; j < distances.length; j++) {
        rnd -= distances[j];
        if (rnd <= 0) { idx = j; break; }
      }
      centroids.push([...flat[idx]]);
    }

    // Iterate
    let assignments = new Array(flat.length).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
      // Assign each point to nearest centroid
      let changed = false;
      for (let i = 0; i < flat.length; i++) {
        let minDist = Infinity;
        let bestCluster = 0;
        for (let j = 0; j < k; j++) {
          const d = colorDistance(flat[i], centroids[j]);
          if (d < minDist) {
            minDist = d;
            bestCluster = j;
          }
        }
        if (assignments[i] !== bestCluster) {
          assignments[i] = bestCluster;
          changed = true;
        }
      }

      if (!changed) break;

      // Update centroids
      for (let j = 0; j < k; j++) {
        const members = flat.filter((_, idx) => assignments[idx] === j);
        if (members.length === 0) continue;
        centroids[j] = [
          Math.round(members.reduce((s, c) => s + c[0], 0) / members.length),
          Math.round(members.reduce((s, c) => s + c[1], 0) / members.length),
          Math.round(members.reduce((s, c) => s + c[2], 0) / members.length)
        ];
      }
    }

    // Reshape labels to 2D
    const labels = [];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push(assignments[idx++] + 1); // +1 because 0 = empty
      }
      labels.push(row);
    }

    return { labels, centroids };
  }

  /**
   * Auto-detect number of clusters using silhouette-like heuristic.
   * Tests k from 2 to maxK and picks the one with best intra-cluster tightness.
   */
  function detectOptimalK(colors2D, maxK = 8) {
    const rows = colors2D.length;
    const cols = colors2D[0].length;
    const flat = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        flat.push(colors2D[r][c]);
      }
    }

    let bestK = 3;
    let bestScore = Infinity;

    for (let k = 2; k <= Math.min(maxK, flat.length); k++) {
      // Run k-means multiple times, pick best
      let bestInertia = Infinity;
      for (let trial = 0; trial < 3; trial++) {
        const result = kMeansClustering(colors2D, k);
        // Calculate inertia (sum of squared distances to centroid)
        let inertia = 0;
        let idx = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cluster = result.labels[r][c] - 1;
            inertia += colorDistance(colors2D[r][c], result.centroids[cluster]) ** 2;
            idx++;
          }
        }
        bestInertia = Math.min(bestInertia, inertia);
      }

      // Elbow method: penalize additional clusters
      const penalty = k * 500;
      const score = bestInertia + penalty;

      if (score < bestScore) {
        bestScore = score;
        bestK = k;
      }
    }

    return bestK;
  }

  /**
   * Full pipeline: image + crop + grid dims → grid matrix + color map.
   */
  function processImage(img, cropRect, rows, cols, numTypes = null) {
    const colors = sampleColors(img, cropRect, rows, cols);
    const k = numTypes || detectOptimalK(colors);
    const { labels, centroids } = kMeansClustering(colors, k);

    // Sort centroids by brightness for consistent ordering
    const sortedIndices = centroids
      .map((c, i) => ({ brightness: c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114, idx: i }))
      .sort((a, b) => a.brightness - b.brightness)
      .map(x => x.idx);

    // Remap labels
    const remap = {};
    sortedIndices.forEach((oldIdx, newIdx) => { remap[oldIdx + 1] = newIdx + 1; });
    const remappedLabels = labels.map(row => row.map(v => remap[v]));
    const remappedCentroids = sortedIndices.map(i => centroids[i]);

    return {
      grid: remappedLabels,
      colorMap: remappedCentroids,
      k
    };
  }

  return {
    loadImage,
    loadImageFromURL,
    sampleColors,
    kMeansClustering,
    detectOptimalK,
    processImage
  };

})();
