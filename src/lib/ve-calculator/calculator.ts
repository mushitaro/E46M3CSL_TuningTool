import { LogDataPoint, VEMap } from '@/lib/types';
import { APP_CONFIG } from '@/config/constants';

interface GridCell {
    sumStftWeighted: number; // Sum(STFT * Weight)
    weightSum: number;       // Sum(Weight)
    rawCount: number;        // Count of samples (integer)
}

export class VECalculator {
    private rpmAxis: number[];
    private loadAxis: number[];

    constructor() {
        this.rpmAxis = APP_CONFIG.MSS54HP.AXIS_RPM;
        this.loadAxis = APP_CONFIG.MSS54HP.AXIS_LOAD;
    }

    /**
     * Calculates the new VE map based on multiple log files and the current VE map.
     * Logic:
     * 1. Aggregate STFT data from all logs into the grid using BILINEAR INTERPOLATION (Weighted).
     * 2. Calculate Weighted Average STFT for each cell.
     * 3. Apply correction: NewVE = OldVE * AvgSTFT
     */
    public calculateNewVEMap(
        currentMap: VEMap,
        logData: LogDataPoint[]
    ): { newMap: VEMap; diffMap: number[][]; hitMap: number[][]; correctionMap: number[][]; weightMap: number[][] } {
        const rows = this.loadAxis.length;
        const cols = this.rpmAxis.length;

        // Initialize accumulation grid
        const grid: GridCell[][] = Array(rows)
            .fill(null)
            .map(() =>
                Array(cols)
                    .fill(null)
                    .map(() => ({ sumStftWeighted: 0, weightSum: 0, rawCount: 0 }))
            );

        // 1. Binning / Aggregation (Weighted)
        for (const point of logData) {
            // Use Corrected Load if available, else Raw Load
            const loadVal = point.correctedLoad ?? point.rawLoad;
            const rpmVal = point.rpm;
            const avgStft = (point.stft1 + point.stft2) / 2;

            // Find 4 bounding cells
            const rpmInfo = this.findBoundingIndices(rpmVal, this.rpmAxis);
            const loadInfo = this.findBoundingIndices(loadVal, this.loadAxis);

            if (!rpmInfo || !loadInfo) continue;

            // Distribute to up to 4 neighbors
            this.distributeWeight(grid, rows, cols, rpmInfo, loadInfo, avgStft);
        }

        // 2. Calculation
        const newMapData: number[][] = [];
        const diffMap: number[][] = [];
        const hitMap: number[][] = [];
        const correctionMap: number[][] = [];
        const weightMap: number[][] = [];

        for (let r = 0; r < rows; r++) {
            const newRow: number[] = [];
            const diffRow: number[] = [];
            const hitRow: number[] = [];
            const correctionRow: number[] = [];
            const weightRow: number[] = [];

            for (let c = 0; c < cols; c++) {
                const cell = grid[r][c];
                const oldVal = currentMap.data[r][c];

                // Check sufficient weight data
                if (cell.weightSum > 0.1) {
                    // Calculation uses Weighted Average
                    // Avg = Sum(Value * Weight) / Sum(Weight)
                    const avgCorrection = cell.sumStftWeighted / cell.weightSum;

                    // Formula: New = Old * Correction
                    const newVal = oldVal * avgCorrection;

                    newRow.push(newVal);
                    // Ratio % = (New / Old) * 100
                    // This is equivalent to Correction Factor * 100
                    diffRow.push(avgCorrection * 100);

                    // HitMap shows RAW Counts (matching MLV "Cell Hit Count")
                    hitRow.push(cell.rawCount);

                    // Correction itself (Lambda Deviation)
                    correctionRow.push(avgCorrection);

                    // Weight Sum (Cell Weight)
                    weightRow.push(cell.weightSum);
                } else {
                    newRow.push(oldVal); // No change
                    diffRow.push(100); // Ratio % (No change = 100%)
                    hitRow.push(0);
                    correctionRow.push(1.0); // No correction
                    weightRow.push(0);
                }
            }
            newMapData.push(newRow);
            diffMap.push(diffRow);
            hitMap.push(hitRow);
            correctionMap.push(correctionRow);
            weightMap.push(weightRow);
        }

        return {
            newMap: {
                xAxis: [...currentMap.xAxis], // Preserve axes
                yAxis: [...currentMap.yAxis],
                data: newMapData,
            },
            diffMap,
            hitMap, // Returns Integer Hits
            correctionMap,
            weightMap // Returns Weight Sum
        };
    }

    private findBoundingIndices(value: number, axis: number[]): { idx1: number; idx2: number; w1: number; w2: number } | null {
        // Handle out of bounds - clamp to edge? Or ignore?
        // MLV likely clamps or ignores. Let's clamp to valid range essentially but effectively Nearest on edges if outside.
        // Actually, if it's below min or above max, we might just assign 100% to the edge cell.

        if (value <= axis[0]) return { idx1: 0, idx2: 0, w1: 1.0, w2: 0.0 };
        if (value >= axis[axis.length - 1]) return { idx1: axis.length - 1, idx2: axis.length - 1, w1: 1.0, w2: 0.0 };

        for (let i = 0; i < axis.length - 1; i++) {
            if (value >= axis[i] && value <= axis[i + 1]) {
                const range = axis[i + 1] - axis[i];
                if (range === 0) return { idx1: i, idx2: i, w1: 1.0, w2: 0.0 };

                const w2 = (value - axis[i]) / range; // Weight for higher index
                const w1 = 1.0 - w2;                  // Weight for lower index
                return { idx1: i, idx2: i + 1, w1, w2 };
            }
        }
        return null; // Should be covered by boundary checks
    }

    private distributeWeight(
        grid: GridCell[][],
        rows: number,
        cols: number,
        rpm: { idx1: number; idx2: number; w1: number; w2: number },
        load: { idx1: number; idx2: number; w1: number; w2: number },
        val: number
    ) {
        // 4 corners:
        // (r1, c1) weight: load.w1 * rpm.w1
        // (r1, c2) weight: load.w1 * rpm.w2
        // (r2, c1) weight: load.w2 * rpm.w1
        // (r2, c2) weight: load.w2 * rpm.w2

        const add = (r: number, c: number, w: number) => {
            if (r >= 0 && r < rows && c >= 0 && c < cols && w > 0) {
                grid[r][c].sumStftWeighted += val * w; // Accumulate Weighted Value
                grid[r][c].weightSum += w;             // Accumulate Weight
                grid[r][c].rawCount++;                 // Increment Raw Count (Integer)
            }
        };

        add(load.idx1, rpm.idx1, load.w1 * rpm.w1);
        add(load.idx1, rpm.idx2, load.w1 * rpm.w2);
        add(load.idx2, rpm.idx1, load.w2 * rpm.w1);
        add(load.idx2, rpm.idx2, load.w2 * rpm.w2);
    }
}
