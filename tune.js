const fs = require('fs');
const path = require('path');
const { createCanvas, Image, ImageData } = require('canvas');

// Mock DOM environment for image-processor.js
global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return createCanvas(32, 32);
    throw new Error(`Unsupported tag: ${tag}`);
  }
};
global.Image = Image;
global.ImageData = ImageData;

// Read ImageProcessor code and evaluate it
let code = fs.readFileSync(path.join(__dirname, 'js/image-processor.js'), 'utf8');
code = code.replace('const ImageProcessor =', 'var ImageProcessor =');
eval(code);

// Load templates
const TEMPLATE_FILES = [
  'TT2_Beet', 'TT2_Bone', 'TT2_BowTie', 'TT2_CandyCane', 'TT2_CatFood', 'TT2_Cherry', 
  'TT2_Emerald', 'TT2_EyeGlass', 'TT2_Grape', 'TT2_GreenFlower', 'TT2_HoneyComb', 'TT2_Leaf', 
  'TT2_Mushroom', 'TT2_Onion', 'TT2_Oranges', 'TT2_Pear', 'TT2_Pepper', 'TT2_PurpleFlower', 
  'TT2_RedTie', 'TT2_Starfish', 'TT2_Tennis', 'TT2_Walnut', 'TT2_Yarn', 'TT2_Rambutan',
  'Pet4Item', 'Pet15Item', 'Pet19Item', 'Pet20Item', 'Pet21Item', 'Pet30Item',
  'empty', 'empty(2)', 'empty(3)'
];

async function loadData() {
  const fileList = TEMPLATE_FILES.map(name => {
    let displayName = name;
    if (name.startsWith('TT2_')) displayName = name.replace('TT2_', '');
    else if (name.startsWith('Pet') && name.endsWith('Item')) displayName = name.replace('Pet', 'Pet ').replace('Item', '');
    return { url: path.join(__dirname, `imgs/${name}.png`), name: displayName };
  });

  // Override loadTemplates to use Node's fs for reading images since URL might not work
  const loadTemplatesNode = async (files, size) => {
    const promises = files.map(async (file) => {
      try {
        const img = new Image();
        const buffer = fs.readFileSync(file.url);
        img.src = buffer;
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const histogram = ImageProcessor.buildHistogram(imageData);
        
        // Expose computeEdgeMap for Node context
        const edgeMap = computeEdgeMapNode(imageData);
        
        return { name: file.name, img, histogram, imageData, edgeMap };
      } catch (err) {
        console.warn(`Failed to load: ${file.name}`);
        return null;
      }
    });
    return (await Promise.all(promises)).filter(r => r !== null);
  };

  function toGrayscaleNode(imageData) {
    const w = imageData.width, h = imageData.height;
    const d = imageData.data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
    }
    return gray;
  }

  function computeEdgeMapNode(imageData) {
    const w = imageData.width, h = imageData.height;
    const gray = toGrayscaleNode(imageData);
    const edges = new Float32Array(w * h);
    let maxMag = 0;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const gx = -1 * gray[(y-1)*w + (x-1)] + 1 * gray[(y-1)*w + (x+1)] +
                   -2 * gray[y*w + (x-1)]     + 2 * gray[y*w + (x+1)] +
                   -1 * gray[(y+1)*w + (x-1)] + 1 * gray[(y+1)*w + (x+1)];
        const gy = -1 * gray[(y-1)*w + (x-1)] + -2 * gray[(y-1)*w + x] + -1 * gray[(y-1)*w + (x+1)] +
                    1 * gray[(y+1)*w + (x-1)] +  2 * gray[(y+1)*w + x] +  1 * gray[(y+1)*w + (x+1)];
        const mag = Math.sqrt(gx * gx + gy * gy);
        edges[y * w + x] = mag;
        if (mag > maxMag) maxMag = mag;
      }
    }
    if (maxMag > 0) {
      for (let i = 0; i < edges.length; i++) edges[i] /= maxMag;
    }
    return edges;
  }

  const templates = await loadTemplatesNode(fileList, 32);

  // Load test cases
  const tests = [];
  for (let i = 1; i <= 5; i++) {
    const jsonPath = path.join(__dirname, `test/${i}.json`);
    const imgPath = path.join(__dirname, `test/${i}.png`);
    if (fs.existsSync(jsonPath) && fs.existsSync(imgPath)) {
      const truth = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const img = new Image();
      img.src = fs.readFileSync(imgPath);
      tests.push({ id: i, truth, img });
    }
  }

  return { templates, tests };
}

async function run() {
  const { templates, tests } = await loadData();
  console.log(`Loaded ${templates.length} templates and ${tests.length} tests.`);

  const configs = [];
  for (let marginRatio of [0.0, 0.1, 0.2]) {
    for (let wEdge of [0.0, 0.1, 0.2, 0.3]) {
      for (let wHist of [0.3, 0.4, 0.5, 0.6]) {
        for (let wMSE of [0.2, 0.3, 0.4, 0.5, 0.6]) {
          if (Math.abs(wEdge + wHist + wMSE - 1.0) > 0.01) continue;
          configs.push({ wEdge, wHist, wMSE, marginRatio });
        }
      }
    }
  }

  console.log(`Testing ${configs.length} configurations...`);
  
  let bestAcc = 0;
  let bestConfig = null;

  for (const config of configs) {
    let correct = 0;
    let total = 0;

    // We can inject the weights directly into the global ImageProcessor for testing
    // To do this properly, we need to add a way to set weights in image-processor.js
    for (const tc of tests) {
      if (typeof global !== 'undefined') global.debugTc = tc.id;
      const result = ImageProcessor.processImage(tc.img, { x: 0, y: 0, width: tc.img.width, height: tc.img.height }, tc.truth.rows, tc.truth.cols, templates, 32, config);
      const truthGrid = tc.truth.grid;
      const detectedGrid = result.grid;

      for (let r = 0; r < tc.truth.rows; r++) {
        for (let c = 0; c < tc.truth.cols; c++) {
          global.debugCoords = { tc: tc.id, r, c };
          total++;
          const truthName = truthGrid[r][c];
          let detectedName = 'empty';
          if (detectedGrid[r][c] !== 0) {
            detectedName = result.matchDetails[r][c].name;
          }
          if (truthName === detectedName) correct++;
        }
      }
    }

    const accuracy = (correct / total) * 100;
    if (accuracy > bestAcc) {
      bestAcc = accuracy;
      bestConfig = config;
      console.log(`New Best: ${accuracy.toFixed(2)}% | wEdge:${config.wEdge.toFixed(1)} wHist:${config.wHist.toFixed(1)} wMSE:${config.wMSE.toFixed(1)}`);
      if (accuracy === 100) break;
    }
  }

  console.log('--- SEARCH COMPLETE ---');
  console.log(`Best Accuracy: ${bestAcc.toFixed(2)}%`);
  console.log(`Best Config:`, bestConfig);

  if (bestConfig) {
    console.log('\n--- MISMATCHES ---');
    for (const tc of tests) {
      const result = ImageProcessor.processImage(tc.img, { x: 0, y: 0, width: tc.img.width, height: tc.img.height }, tc.truth.rows, tc.truth.cols, templates, 32, bestConfig);
      const truthGrid = tc.truth.grid;
      const detectedGrid = result.grid;

      for (let r = 0; r < tc.truth.rows; r++) {
        for (let c = 0; c < tc.truth.cols; c++) {
          const truthName = truthGrid[r][c];
          let detectedName = 'empty';
          if (detectedGrid[r][c] !== 0) {
            detectedName = result.matchDetails[r][c].name;
          }
          if (truthName !== detectedName) {
            console.log(`Test ${tc.id} [${r},${c}]: Expected ${truthName}, got ${detectedName}`);
          }
        }
      }
    }
  }
}

run().catch(console.error);
