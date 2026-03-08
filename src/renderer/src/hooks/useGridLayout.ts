/**
 * useGridLayout Hook
 *
 * Calculates optimal grid layout based on number of agents.
 */

import { useMemo } from 'react';

export interface GridLayout {
  cols: number;
  rows: number;
}

export function useGridLayout(agentCount: number): GridLayout {
  return useMemo(() => {
    if (agentCount <= 0) return { cols: 1, rows: 1 };
    if (agentCount === 1) return { cols: 1, rows: 1 };
    if (agentCount === 2) return { cols: 2, rows: 1 };
    if (agentCount <= 4) return { cols: 2, rows: 2 };
    if (agentCount <= 6) return { cols: 3, rows: 2 };
    if (agentCount <= 9) return { cols: 3, rows: 3 };
    if (agentCount <= 12) return { cols: 4, rows: 3 };
    return { cols: 4, rows: Math.ceil(agentCount / 4) };
  }, [agentCount]);
}
