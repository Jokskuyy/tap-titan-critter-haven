const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const code = fs.readFileSync(path.join(__dirname, 'js/image-processor.js'), 'utf-8');
eval(code);
const IP = typeof ImageProcessor !== 'undefined' ? ImageProcessor : global.ImageProcessor;

async function run() {
  const templates = await IP.loadTemplates([
    ...fs.readdirSync('imgs')
       .filter(f => f.endsWith('.png'))
       .map(f => ({ url: 'imgs/' + f, name: f.replace('.png', '') }))
  ], 32);

  const testFile = 'test/2.png';
  const img = await loadImage(testFile);
  const truth = JSON.parse(fs.readFileSync('test/2.json', 'utf-8'));

  for (let shift = 0; shift <= 4; shift++) {
    const config = {wEdge: 0.1, wHist: 0.4, wMSE: 0.5};
    const cropRect = { x: shift, y: shift, width: img.width, height: img.height };
    const result = IP.processImage(img, cropRect, truth.rows, truth.cols, templates, 32);
    
    let correct = 0;
    let total = 0;
    for (let r = 0; r < truth.rows; r++) {
      for (let c = 0; c < truth.cols; c++) {
        total++;
        const truthName = truth.grid[r][c];
        let detectedName = 'empty';
        if (result.grid[r][c] !== 0) {
          detectedName = result.matchDetails[r][c].name;
        }
        if (truthName === detectedName) correct++;
      }
    }
    console.log(`Shift ${shift}px: ${((correct/total)*100).toFixed(2)}%`);
  }
}

run().catch(console.error);
