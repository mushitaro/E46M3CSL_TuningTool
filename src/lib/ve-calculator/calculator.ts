import { LogDataPoint, VEMap } from '@/lib/types';
import { APP_CONFIG, CSL_STOCK_MAP_DATA, CSL_STOCK_WARMUP_MAP, CSL_STOCK_WOT_MAP, CSL_STOCK_WARMUP_RPM, CSL_STOCK_WARMUP_LOAD, CSL_STOCK_WOT_RPM } from '@/config/constants';

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

    /**
     * [EXPERIMENTAL] Auto-generates a Warmup Map based on the Tuned VE Map.
     * Logic: NewWarmup = NewVE_Intep * (StockWarmup / StockVE_Interp)
     * Handles Axis Mismatch by interpolating Main VE maps to match Warmup Map axes.
     */
    public generateWarmupMap(newVEMap: VEMap): VEMap {
        const stockVE = { // Construct VEMap object for Stock Data
            xAxis: APP_CONFIG.MSS54HP.AXIS_RPM,
            yAxis: APP_CONFIG.MSS54HP.AXIS_LOAD,
            data: CSL_STOCK_MAP_DATA
        };
        const stockWarmup = CSL_STOCK_WARMUP_MAP;

        // Use the specific axes for Cold Map
        const targetRpmAxis = CSL_STOCK_WARMUP_RPM;
        const targetLoadAxis = CSL_STOCK_WARMUP_LOAD;

        // Validation - ensure dimensions match our constants
        if (stockWarmup.length !== targetLoadAxis.length || stockWarmup[0].length !== targetRpmAxis.length) {
            console.warn("Stock Warmup Map dimensions mismatch with defined Constants. Returning New VE Map fallback.");
            return newVEMap;
        }

        const newWarmupData: number[][] = [];

        for (let r = 0; r < targetLoadAxis.length; r++) {
            const rowArr: number[] = [];
            const load = targetLoadAxis[r];

            for (let c = 0; c < targetRpmAxis.length; c++) {
                const rpm = targetRpmAxis[c];

                const sWarm = stockWarmup[r][c];

                // Interpolate Main Maps at Cold Map (rpm, load)
                // We need the value of the Main Map at this specific operating point
                const sVE_Interp = this.interpolateMap(stockVE, rpm, load);
                const nVE_Interp = this.interpolateMap(newVEMap, rpm, load);

                // Calculate Ratio: Stock Warmup / Stock Main (Interpolated)
                const ratio = sVE_Interp !== 0 ? sWarm / sVE_Interp : 1.0;

                // New Warmup = New VE (Interpolated) * Ratio
                rowArr.push(nVE_Interp * ratio);
            }
            newWarmupData.push(rowArr);
        }

        return {
            xAxis: targetRpmAxis,    // Return map with ITS OWN axes
            yAxis: targetLoadAxis,
            data: newWarmupData
        };
    }

    /**
     * Bilinear Interpolation helper to get value from a Map at any (rpm, load)
     */
    private interpolateMap(map: VEMap, rpm: number, load: number): number {
        // Find bounding indices
        const rInfo = this.findBoundingIndices(load, map.yAxis); // Load is Y-axis
        const cInfo = this.findBoundingIndices(rpm, map.xAxis);  // RPM is X-axis

        if (!rInfo || !cInfo) return 0;

        // 4 Neighbors
        const v11 = map.data[rInfo.idx1][cInfo.idx1]; // Top-Left
        const v12 = map.data[rInfo.idx1][cInfo.idx2]; // Top-Right
        const v21 = map.data[rInfo.idx2][cInfo.idx1]; // Bottom-Left
        const v22 = map.data[rInfo.idx2][cInfo.idx2]; // Bottom-Right

        // Interpolate Logic
        // Val = w1*w1*v11 + w1*w2*v12 ... 
        // My weights are: w1 (lower index weight), w2 (higher index weight)
        // rInfo.w1 is weight for idx1 (lower). rInfo.w2 is weight for idx2 (higher).

        // Lerp Formula: V = V_low * w_low + V_high * w_high
        const valRow1 = v11 * cInfo.w1 + v12 * cInfo.w2; // Interpolate X at Row 1
        const valRow2 = v21 * cInfo.w1 + v22 * cInfo.w2; // Interpolate X at Row 2

        const res = valRow1 * rInfo.w1 + valRow2 * rInfo.w2; // Interpolate Y

        return res;
    }
    /**
     * [EXPERIMENTAL] Auto-generates a WOT Curve based on the Tuned VE Map (100% Load Column).
     * Logic: NewWOT(rpm) = NewVE(rpm, 100%) * (StockWOT(rpm) / StockVE(rpm, 100%))
     */
    /**
     * [EXPERIMENTAL] Auto-generates a WOT Map (3x18) based on the Tuned VE Map (High Load).
     * Logic: NewWOT(rpm) = NewVE_Intep(rpm, maxLoad) * (StockWOT(rpm) / StockVE_Interp(rpm, maxLoad))
     */
    public generateWOTMap(newVEMap: VEMap): number[][] {
        const stockVE = { // Construct VEMap object for Stock Data
            xAxis: APP_CONFIG.MSS54HP.AXIS_RPM,
            yAxis: APP_CONFIG.MSS54HP.AXIS_LOAD,
            data: CSL_STOCK_MAP_DATA
        };
        const stockWOT = CSL_STOCK_WOT_MAP;
        const targetRpmAxis = CSL_STOCK_WOT_RPM;

        // Define "WOT Load" as the maximum load in the main map (e.g. 100% or highest defined)
        // We use the last value of the stock load axis.
        const maxLoad = APP_CONFIG.MSS54HP.AXIS_LOAD[APP_CONFIG.MSS54HP.AXIS_LOAD.length - 1];

        // Validation
        if (stockWOT[0].length !== targetRpmAxis.length) {
            console.warn("Stock WOT Map dimensions mismatch constants. Returning empty.");
            return [];
        }

        const calculatedRow: number[] = [];

        // Calculate the 1D Curve first (using the first row of Stock WOT as reference)
        for (let c = 0; c < targetRpmAxis.length; c++) {
            const rpm = targetRpmAxis[c];
            const sWotVal = stockWOT[0][c];

            const sVE_Interp = this.interpolateMap(stockVE, rpm, maxLoad);
            const nVE_Interp = this.interpolateMap(newVEMap, rpm, maxLoad);

            const ratio = sVE_Interp !== 0 ? sWotVal / sVE_Interp : 1.0;
            calculatedRow.push(nVE_Interp * ratio);
        }

        // Return 3 identical rows (matching Stock WOT structure)
        return [
            [...calculatedRow],
            [...calculatedRow],
            [...calculatedRow]
        ];
    }
}
