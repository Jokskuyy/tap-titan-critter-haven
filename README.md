# Tap Titan Critter Haven Bot

Local web-based solver for Tap Titans 2 "Critter Haven" minigame. 
Calculates optimal block-matching sequence to clear the board with minimum taps.

## Features

- **Algorithmic Solver**: Uses Beam Search with iterative widening and Depth-First Search (DFS) with branch-and-bound to find the minimum-tap solution.
- **Image Recognition**: Upload screenshot. Extracts grid layout automatically using template matching (histogram comparison and MSE refinement).
- **Manual Input**: Interactive grid editor. Click to place blocks. Adjustable grid dimensions.
- **Visual Playback**: Step-by-step playback of the optimal solution. Highlights exact block to tap, dims others.

## Architecture

Pure client-side Single Page Application (SPA). No backend required.

- `index.html`: Main UI, canvas renderer, manual editor.
- `css/style.css`: Design system (dark mode, glassmorphism).
- `js/grid-engine.js`: Pure functions for game logic (gravity, flood-fill, move generation).
- `js/solver-worker.js`: Web Worker running Beam Search and DFS in background to prevent UI freeze.
- `js/image-processor.js`: Local image processing via Canvas API to detect blocks.
- `imgs/`: Reference images for template matching.

## Local Development

Web Workers require an HTTP server. Do not open `index.html` directly via `file://`.

```bash
# Start local HTTP server
python -m http.server 8080
```
Open `http://localhost:8080` in browser.

## Deployment

Fully static. Can be hosted directly on Vercel, Netlify, or GitHub Pages without build steps.

**GitHub Pages:**
1. Go to repository Settings > Pages.
2. Select `main` branch.
3. Save.

**Vercel:**
1. Import repository.
2. Select "Other" framework preset.
3. Deploy.
