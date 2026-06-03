/**
 * Critter Heaven Bot — Solver Web Worker
 * DFS solver with pruning, memoization, and greedy fallback.
 * 
 * Messages IN:  { type: 'solve', grid: number[][], timeLimit: number }
 * Messages OUT: { type: 'progress', statesExplored, currentBest, elapsed }
 *               { type: 'solution', moves: [{tap, cells, gridAfter}], taps, totalStates, time, optimal }
 *               { type: 'nosolution', reason, bestPartial, taps }
 */

// Import grid engine
importScripts('grid-engine.js');

const GE = GridEngine;

let aborted = false;
let statesExplored = 0;
let bestSolution = null;
let bestTaps = Infinity;
let startTime = 0;
let timeLimitMs = 30000;
let lastProgressUpdate = 0;

/**
 * Main solver entry point.
 */
function solve(grid, timeLimit) {
  aborted = false;
  statesExplored = 0;
  bestSolution = null;
  bestTaps = Infinity;
  startTime = performance.now();
  timeLimitMs = timeLimit;
  lastProgressUpdate = 0;

  const totalCells = GE.countRemaining(grid);

  if (totalCells === 0) {
    postMessage({ type: 'solution', moves: [], taps: 0, totalStates: 0, time: 0, optimal: true });
    return;
  }

  // First: run greedy to get an upper bound
  const greedySolution = solveGreedy(grid);
  if (greedySolution) {
    bestSolution = greedySolution;
    bestTaps = greedySolution.length;
  }

  // Then: DFS with branch-and-bound
  const visited = new Map();
  dfs(grid, [], visited);

  const elapsed = performance.now() - startTime;
  const timedOut = elapsed >= timeLimitMs;

  if (bestSolution) {
    postMessage({
      type: 'solution',
      moves: bestSolution,
      taps: bestSolution.length,
      totalStates: statesExplored,
      time: Math.round(elapsed),
      optimal: !timedOut
    });
  } else {
    // No full clear found — return greedy partial
    const partialSolution = solveGreedyPartial(grid);
    postMessage({
      type: 'nosolution',
      reason: 'No full clear possible within time limit',
      bestPartial: partialSolution,
      taps: partialSolution.length
    });
  }
}

/**
 * DFS solver with memoization and branch-and-bound.
 */
function dfs(grid, currentMoves, visited) {
  // Time check
  if (performance.now() - startTime > timeLimitMs) {
    aborted = true;
    return;
  }
  if (aborted) return;

  statesExplored++;

  // Progress update every 1000 states
  if (statesExplored - lastProgressUpdate >= 1000) {
    lastProgressUpdate = statesExplored;
    postMessage({
      type: 'progress',
      statesExplored,
      currentBest: bestTaps === Infinity ? null : bestTaps,
      elapsed: Math.round(performance.now() - startTime)
    });
  }

  // Check if cleared
  if (GE.isCleared(grid)) {
    if (currentMoves.length < bestTaps) {
      bestTaps = currentMoves.length;
      bestSolution = currentMoves.map(m => ({ ...m }));
    }
    return;
  }

  // Branch-and-bound: prune if current depth already >= best
  if (currentMoves.length >= bestTaps - 1) return;

  // Memoization: skip if we've seen this state at equal or fewer moves
  const hash = GE.hashGrid(grid);
  const prevDepth = visited.get(hash);
  if (prevDepth !== undefined && prevDepth <= currentMoves.length) return;
  visited.set(hash, currentMoves.length);

  // Get all unique moves (groups)
  const moves = GE.getAvailableMoves(grid);

  // Sort by group size descending (greedy heuristic — try big groups first)
  moves.sort((a, b) => b.cells.length - a.cells.length);

  // Lower bound pruning: minimum additional taps needed
  // Each tap removes at least 1 block, so remaining_blocks gives a lower bound
  // But better: count unique groups = exact number if all are singles
  const remaining = GE.countRemaining(grid);
  const minAdditional = Math.ceil(remaining / Math.max(...moves.map(m => m.cells.length), 1));
  if (currentMoves.length + minAdditional >= bestTaps) return;

  for (const move of moves) {
    if (aborted) return;

    const newGrid = GE.cloneGrid(grid);
    GE.removeGroup(newGrid, move.cells);
    GE.applyGravity(newGrid);

    const moveRecord = {
      tap: { row: move.tap.row, col: move.tap.col },
      cells: move.cells.map(c => ({ row: c.row, col: c.col })),
      type: move.type,
      groupSize: move.cells.length,
      gridAfter: newGrid
    };

    currentMoves.push(moveRecord);
    dfs(newGrid, currentMoves, visited);
    currentMoves.pop();
  }
}

/**
 * Greedy solver: always pick largest group.
 * Returns move list or null if can't fully clear.
 */
function solveGreedy(grid) {
  let current = GE.cloneGrid(grid);
  const moves = [];

  while (!GE.isCleared(current)) {
    const available = GE.getAvailableMoves(current);
    if (available.length === 0) break;

    // Pick largest group
    available.sort((a, b) => b.cells.length - a.cells.length);
    const best = available[0];

    const newGrid = GE.cloneGrid(current);
    GE.removeGroup(newGrid, best.cells);
    GE.applyGravity(newGrid);

    moves.push({
      tap: { row: best.tap.row, col: best.tap.col },
      cells: best.cells.map(c => ({ row: c.row, col: c.col })),
      type: best.type,
      groupSize: best.cells.length,
      gridAfter: newGrid
    });

    current = newGrid;
  }

  return GE.isCleared(current) ? moves : null;
}

/**
 * Greedy solver that returns partial solution (as many clears as possible).
 */
function solveGreedyPartial(grid) {
  let current = GE.cloneGrid(grid);
  const moves = [];

  while (true) {
    const available = GE.getAvailableMoves(current);
    if (available.length === 0) break;

    available.sort((a, b) => b.cells.length - a.cells.length);
    const best = available[0];

    const newGrid = GE.cloneGrid(current);
    GE.removeGroup(newGrid, best.cells);
    GE.applyGravity(newGrid);

    moves.push({
      tap: { row: best.tap.row, col: best.tap.col },
      cells: best.cells.map(c => ({ row: c.row, col: c.col })),
      type: best.type,
      groupSize: best.cells.length,
      gridAfter: newGrid
    });

    current = newGrid;
  }

  return moves;
}

// Message handler
self.onmessage = function (e) {
  const { type, grid, timeLimit } = e.data;

  if (type === 'solve') {
    solve(grid, timeLimit || 30000);
  } else if (type === 'abort') {
    aborted = true;
  }
};
