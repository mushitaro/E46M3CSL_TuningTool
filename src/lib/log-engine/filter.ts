import { LogDataPoint, ProcessedLog, LogFilterConfig, InterpolationPoint } from '@/lib/types';
import { APP_CONFIG } from '@/config/constants';

export const processLogData = (
    rawData: LogDataPoint[],
    fileName: string,
    config?: LogFilterConfig,
    customTable?: InterpolationPoint[]
): ProcessedLog => {
    const validData: LogDataPoint[] = [];
    let droppedCount = 0;

    // Use provided config or defaults
    const cfg: LogFilterConfig = config || {
        enableCorrection: true,
        enableMinTemp: true,
        minTemp: 65,
        enableIdle: true,
        idleRpm: 1000,
        enableTransient: true,
        transientWindow: 4,
        rpmStableThreshold: 10,
        tpsStableThreshold: 5,
    };

    // Helper: Get data point at index safely
    const getAt = (idx: number) => (idx >= 0 && idx < rawData.length) ? rawData[idx] : null;

    // Use custom table or default
    const interpTable = customTable || APP_CONFIG.MSS54HP.INTERPOLATION_TABLE;

    for (let i = 0; i < rawData.length; i++) {
        const current = rawData[i];

        // 1. Temperature Filter
        // Only apply if coolantTemp is valid (custom logic: assume < -40 or undefined is invalid/missing)
        // Code defaults missing temp to 95 in parser, so it will pass if missing.
        // User requirement: "If temp exists > 65 AND stable approx 80".
        // The parser sets missing temp to 95. We can assume if it's 95 strictly it might be fallback,
        // but real data could be 95. However, since we set it to 95 if missing, filtering on > 65 will pass it.
        // If real data < 65, it drops.
        // 1. Temperature Filter
        // [UPDATED] Check for undefined. If undefined, we SKIP the filter (allow the row).
        // Only Drop if temp exists and is below threshold.
        if (cfg.enableMinTemp && current.coolantTemp !== undefined && current.coolantTemp < cfg.minTemp) {
            droppedCount++;
            continue;
        }

        // 2. Idle Filter
        // Exclude if TPS <= 1.0 (approx 0%) and RPM < IdleThreshold
        // rawLoad is 'relative opening' (0-100)
        if (cfg.enableIdle && current.rawLoad <= 1.0 && current.rpm < cfg.idleRpm) {
            droppedCount++;
            continue;
        }

        // 3. Transient Filter
        // Check back N frames
        if (cfg.enableTransient && i >= cfg.transientWindow) {
            const prev = getAt(i - cfg.transientWindow);
            if (prev) {
                // RPM Stability Check (Relative %)
                const rpmDiffPct = Math.abs((current.rpm - prev.rpm) / prev.rpm) * 100;
                if (rpmDiffPct > cfg.rpmStableThreshold) {
                    droppedCount++;
                    continue;
                }

                // TPS Stability Check (Absolute Delta)
                const tpsDiffAbs = Math.abs(current.rawLoad - prev.rawLoad);
                if (tpsDiffAbs > cfg.tpsStableThreshold) {
                    droppedCount++;
                    continue;
                }
            }
        }

        // 4. Correction (Interpolation)
        // If disabled (user supplied processed CSV), use raw directly.
        let corrected = current.rawLoad;
        if (cfg.enableCorrection) {
            const factor = interpolateFactor(current.rpm, interpTable);
            const f = factor === 0 ? 1.0 : factor;
            corrected = current.rawLoad / f;

            // DEBUG: Log first few corrections to verify
            if (i < 5) {
                console.log(`[Corrector] RPM:${current.rpm} Raw:${current.rawLoad} Factor:${factor} Corrected:${corrected}`);
            }
        } else {
            if (i < 5) console.log(`[Corrector] Correction DISABLED. RPM:${current.rpm}`);
        }

        validData.push({
            ...current,
            correctedLoad: corrected,
            correctionFactor: cfg.enableCorrection ? (current.rawLoad / corrected) : 1.0 // Derive used factor for display
        });
    }

    return {
        fileName,
        data: validData,
        validCount: validData.length,
        droppedCount,
    };
};

function interpolateFactor(rpm: number, table: InterpolationPoint[]): number {
    // Table is sorted by RPM? Yes (0, 900, 1100...)
    // Find range
    if (rpm <= table[0].rpm) return table[0].factor;
    if (rpm >= table[table.length - 1].rpm) return table[table.length - 1].factor;

    for (let i = 0; i < table.length - 1; i++) {
        const p1 = table[i];
        const p2 = table[i + 1];

        if (rpm >= p1.rpm && rpm <= p2.rpm) {
            // Linear interpolation
            const ratio = (rpm - p1.rpm) / (p2.rpm - p1.rpm);
            return p1.factor + ratio * (p2.factor - p1.factor);
        }
    }

    return 1.0; // Should not reach here
}
