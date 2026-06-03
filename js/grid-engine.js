/**
 * Critter Heaven Bot — Grid Engine
 * Pure game logic functions for the block-matching puzzle.
 * 
 * Grid representation: 2D array grid[row][col] = blockType (integer)
 *   0 = empty, 1+ = block types
 *   Row 0 = top, Row N-1 = bottom
 */

const GridEngine = (() => {

  /**
   * Deep clone a grid.
   */
  function cloneGrid(grid) {
    return grid.map(row => [...row]);
  }

  /**
   * Get grid dimensions.
   */
  function getDimensions(grid) {
    return { rows: grid.length, cols: grid[0]?.length || 0 };
  }

  /**
   * BFS flood-fill to find all connected cells of the same type.
   * Returns array of {row, col} objects.
   */
  function findGroup(grid, startRow, startCol) {
    const { rows, cols } = getDimensions(grid);
    const type = grid[startRow][startCol];
    if (type === 0) return [];

    const visited = new Set();
    const queue = [{ row: startRow, col: startCol }];
    const group = [];
    const key = (r, c) => r * cols + c;

    visited.add(key(startRow, startCol));

    while (queue.length > 0) {
      const { row, col } = queue.shift();
      group.push({ row, col });

      const neighbors = [
        { row: row - 1, col },
        { row: row + 1, col },
        { row, col: col - 1 },
        { row, col: col + 1 }
      ];

      for (const n of neighbors) {
        if (n.row >= 0 && n.row < rows && n.col >= 0 && n.col < cols
          && !visited.has(key(n.row, n.col))
          && grid[n.row][n.col] === type) {
          visited.add(key(n.row, n.col));
          queue.push(n);
        }
      }
    }

    return group;
  }

  /**
   * Remove a group of cells (set to 0).
   * Mutates grid in place.
   */
  function removeGroup(grid, cells) {
    for (const { row, col } of cells) {
      grid[row][col] = 0;
    }
  }

  /**
   * Apply gravity: blocks fall down to fill empty spaces.
   * No column shifting. Mutates grid in place.
   */
  function applyGravity(grid) {
    const { rows, cols } = getDimensions(grid);

    for (let col = 0; col < cols; col++) {
      // Collect non-empty cells from bottom to top
      const blocks = [];
      for (let row = rows - 1; row >= 0; row--) {
        if (grid[row][col] !== 0) {
          blocks.push(grid[row][col]);
        }
      }

      // Fill column from bottom with blocks, rest empty
      for (let row = rows - 1; row >= 0; row--) {
        const idx = rows - 1 - row;
        grid[row][col] = idx < blocks.length ? blocks[idx] : 0;
      }
    }
  }

  /**
   * Get all unique groups (connected components) on the grid.
   * Each group returned once, represented by its cells and a canonical key.
   * Returns array of { cells: [{row, col}], type: number }
   */
  function getAvailableMoves(grid) {
    const { rows, cols } = getDimensions(grid);
    const visited = new Set();
    const groups = [];
    const cellKey = (r, c) => r * cols + c;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (grid[row][col] !== 0 && !visited.has(cellKey(row, col))) {
          const group = findGroup(grid, row, col);
          for (const cell of group) {
            visited.add(cellKey(cell.row, cell.col));
          }
          groups.push({
            cells: group,
            type: grid[row][col],
            // Use top-left cell as tap target for display
            tap: group.reduce((best, c) =>
              (c.row < best.row || (c.row === best.row && c.col < best.col)) ? c : best
            )
          });
        }
      }
    }

    return groups;
  }

  /**
   * Check if grid is fully cleared.
   */
  function isCleared(grid) {
    for (const row of grid) {
      for (const cell of row) {
        if (cell !== 0) return false;
      }
    }
    return true;
  }

  /**
   * Count remaining non-empty cells.
   */
  function countRemaining(grid) {
    let count = 0;
    for (const row of grid) {
      for (const cell of row) {
        if (cell !== 0) count++;
      }
    }
    return count;
  }

  /**
   * Hash a grid state for memoization.
   * Returns a compact string representation.
   */
  function hashGrid(grid) {
    // Use a compact encoding: each cell is a single char
    return grid.map(row => row.join(',')).join(';');
  }

  /**
   * Execute a move: pop group at (row, col), apply gravity.
   * Returns new grid (does not mutate input).
   */
  function executeMove(grid, row, col) {
    const newGrid = cloneGrid(grid);
    const group = findGroup(newGrid, row, col);
    if (group.length === 0) return newGrid;
    removeGroup(newGrid, group);
    applyGravity(newGrid);
    return newGrid;
  }

  /**
   * Create an empty grid.
   */
  function createGrid(rows, cols) {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
  }

  /**
   * Get unique block types present in grid (excluding 0/empty).
   */
  function getBlockTypes(grid) {
    const types = new Set();
    for (const row of grid) {
      for (const cell of row) {
        if (cell !== 0) types.add(cell);
      }
    }
    return [...types].sort();
  }

  return {
    cloneGrid,
    getDimensions,
    findGroup,
    removeGroup,
    applyGravity,
    getAvailableMoves,
    isCleared,
    countRemaining,
    hashGrid,
    executeMove,
    createGrid,
    getBlockTypes
  };

})();

// Support both browser and Web Worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GridEngine;
}
