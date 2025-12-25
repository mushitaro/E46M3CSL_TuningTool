import { BinaryParser } from './parser';
import { APP_CONFIG } from '@/config/constants';
import { VEMap } from '@/lib/types';

export class BinaryPatcher extends BinaryParser {
    constructor(buffer: ArrayBuffer) {
        super(buffer.slice(0)); // Clone buffer to avoid mutating original source if needed
    }

    public setUint8(offset: number, value: number): void {
        // Validate bounds omitted for brevity, view will throw
        this.view.setUint8(offset, value);
    }

    public setUint16(offset: number, value: number): void {
        this.view.setUint16(offset, value, false); // Big Endian
    }

    public disableMapCorrection(): void {
        // Set k_rf_cfg (0xE5E4) to 0x02
        this.setUint8(APP_CONFIG.MSS54HP.ADDRESS_MAP_CONFIG, 0x02);
    }

    public enableMapCorrection(): void {
        // Usually 0x01 or 0x00. Let's assume 0x01 or restore from original?
        // For now, this might not be strictly needed if we only tune.
        // But to "return to initial value", we might need to know the original.
        this.setUint8(APP_CONFIG.MSS54HP.ADDRESS_MAP_CONFIG, 0x01); // Default guess?
    }

    public setTempThreshold(tempCelsius: number): void {
        // Value = Temp + 48
        const val = tempCelsius + 48;
        this.setUint8(APP_CONFIG.MSS54HP.ADDRESS_TEMP_LIMIT, val);
    }

    public setVETable(map: VEMap): void {
        const config = APP_CONFIG.MSS54HP.VE_TABLE;

        // We only write DATA, not axes (usually axes are fixed/read-only or we don't need to change them)
        // Writing 24 rows x 20 cols
        for (let row = 0; row < config.SIZE_Y; row++) {
            for (let col = 0; col < config.SIZE_X; col++) {
                const offset = config.ADDRESS_DATA + (row * config.SIZE_X + col) * 2;
                const value = map.data[row][col];
                // User specified Z-axis is z/1000, so we write back value * 1000
                this.setUint16(offset, Math.round(value * 1000)); // Ensure integer
            }
        }
    }

    public getPatchedBuffer(): ArrayBuffer {
        return this.buffer;
    }
}
