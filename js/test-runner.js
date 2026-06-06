import { TEMPLATE_FILES } from './ui/AppState.js';

const $ = id => document.getElementById(id);

let testCases = {};
let templates = [];

async function init() {
  $('btn-load-files').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', handleFileSelect);
  $('btn-run-tests').addEventListener('click', runTests);

  // Load templates
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

  try {
    $('summary').textContent = 'Loading templates...';
    templates = await ImageProcessor.loadTemplates(fileList, 32);
    $('summary').textContent = `Loaded ${templates.length} templates. Ready to load test files.`;
  } catch (err) {
    $('summary').innerHTML = `<span class="error">Failed to load templates: ${err.message}</span>`;
  }
}

async function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  testCases = {};

  for (const file of files) {
    const match = file.name.match(/^(test_\d+)\.(png|json)$/);
    if (!match) continue;
    
    const basename = match[1];
    const ext = match[2];

    if (!testCases[basename]) testCases[basename] = { name: basename };

    if (ext === 'png') {
      testCases[basename].imageFile = file;
    } else if (ext === 'json') {
      const text = await file.text();
      testCases[basename].truth = JSON.parse(text);
    }
  }

  const validTests = Object.values(testCases).filter(tc => tc.imageFile && tc.truth);
  
  if (validTests.length > 0) {
    $('summary').textContent = `Loaded ${validTests.length} complete test cases (PNG + JSON).`;
    $('btn-run-tests').disabled = false;
  } else {
    $('summary').textContent = 'No matching test pairs found. Upload both PNGs and JSONs.';
    $('btn-run-tests').disabled = true;
  }
}

async function runTests() {
  const validTests = Object.values(testCases).filter(tc => tc.imageFile && tc.truth);
  if (validTests.length === 0) return;

  $('btn-run-tests').disabled = true;
  const logs = $('logs');
  logs.innerHTML = '';
  $('summary').textContent = 'Running tests...';

  let totalCells = 0;
  let correctCells = 0;
  let falseEmpties = 0;
  let falseBlocks = 0;
  let misclassifications = 0;

  for (const tc of validTests) {
    const div = document.createElement('div');
    div.className = 'test-result';
    div.innerHTML = `<h3>Testing: ${tc.name}</h3>`;
    logs.appendChild(div);

    try {
      const img = await ImageProcessor.loadImage(tc.imageFile);
      const rows = tc.truth.rows;
      const cols = tc.truth.cols;
      const cropRect = { x: 0, y: 0, width: img.width, height: img.height };

      const result = ImageProcessor.processImage(img, cropRect, rows, cols, templates, 32);
      
      const truthGrid = tc.truth.grid;
      const detectedGrid = result.grid;
      
      let localErrors = 0;
      let mismatchesHtml = '';

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          totalCells++;
          const truthName = truthGrid[r][c]; // Now this is a string name or 'empty'
          const detectedId = detectedGrid[r][c];
          
          let detectedName = 'empty';
          if (detectedId !== 0) {
             // In processImage, usedTemplates maps indices. But we didn't expose activeTemplateMap cleanly in result in some previous versions.
             // Wait, processImage returns { grid, matchDetails, usedTemplates, templateRemap, numTypes }
             // matchDetails[r][c] contains { bestMatch, confidence, mse, name }
             detectedName = result.matchDetails[r][c].name;
          }

          if (truthName === detectedName) {
            correctCells++;
          } else {
            localErrors++;
            
            mismatchesHtml += `<div class="mismatch">Row ${r}, Col ${c}: Expected <strong>${truthName}</strong>, but detected <strong>${detectedName}</strong></div>`;
            
            if (truthName === 'empty' && detectedName !== 'empty') falseBlocks++;
            else if (truthName !== 'empty' && detectedName === 'empty') falseEmpties++;
            else misclassifications++;
          }
        }
      }

      if (localErrors === 0) {
        div.innerHTML += `<div class="success">✅ Perfect Match! (${rows * cols} cells)</div>`;
      } else {
        div.innerHTML += `<div class="error">❌ ${localErrors} Mismatches</div>`;
        div.innerHTML += mismatchesHtml;
      }

    } catch (err) {
      div.innerHTML += `<div class="error">Error processing: ${err.message}</div>`;
    }
  }

  const accuracy = ((correctCells / totalCells) * 100).toFixed(2);
  
  $('summary').innerHTML = `
    Completed ${validTests.length} tests.<br>
    Accuracy: <span class="${accuracy === '100.00' ? 'success' : 'error'}">${accuracy}%</span> (${correctCells}/${totalCells})<br>
    <div style="font-size:1rem; font-weight:normal; margin-top:0.5rem; color:#94a3b8">
      False Empties: ${falseEmpties} | False Blocks: ${falseBlocks} | Misclassifications: ${misclassifications}
    </div>
  `;
  
  $('btn-run-tests').disabled = false;
}

window.addEventListener('DOMContentLoaded', init);
