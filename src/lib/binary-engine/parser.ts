import { APP_CONFIG } from '@/config/constants';
import { VEMap } from '@/lib/types';

export class BinaryParser {
    protected buffer: ArrayBuffer;
    protected view: DataView;
    protected uint8Array: Uint8Array;

    constructor(buffer: ArrayBuffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.uint8Array = new Uint8Array(buffer);
    }

    public getBuffer(): ArrayBuffer {
        return this.buffer;
    }

    public getUint8(offset: number): number {
        this.validateOffset(offset, 1);
        return this.view.getUint8(offset);
    }

    public getUint16(offset: number): number {
        this.validateOffset(offset, 2);
        return this.view.getUint16(offset, false); // Big Endian (Correct for data)
    }

    /**
     * Reads the VE Table from the binary at defined offsets.
     * Using Fixed Axes from constants as requested by user to ensure correct labels.
     */
    public getVETable(): VEMap {
        const config = APP_CONFIG.MSS54HP.VE_TABLE;

        // Use Fixed Axes
        const xAxis = APP_CONFIG.MSS54HP.AXIS_RPM;
        const yAxis = APP_CONFIG.MSS54HP.AXIS_LOAD;

        // Read Data (24 rows x 20 cols)
        const data: number[][] = [];
        for (let row = 0; row < config.SIZE_Y; row++) {
            const rowData: number[] = [];
            for (let col = 0; col < config.SIZE_X; col++) {
                // Offset = Start + (Row * Width + Col) * 2
                const offset = config.ADDRESS_DATA + (row * config.SIZE_X + col) * 2;
                // User specified Z-axis is z/1000
                const rawValue = this.getUint16(offset);
                rowData.push(rawValue / 1000);
            }
            data.push(rowData);
        }

        return { xAxis, yAxis, data };
    }

    public getMapCorrectionStatus(): boolean {
        const val = this.getUint8(APP_CONFIG.MSS54HP.ADDRESS_MAP_CONFIG);
        // 0x02 means OFF (as per plan: 0xE5E4 = 0x02)
        // If it is NOT 0x02, it might be ON (usually 0x01 or 0x00).
        return val === 0x02;
    }

    public getTempThreshold(): number {
        const val = this.getUint8(APP_CONFIG.MSS54HP.ADDRESS_TEMP_LIMIT);
        // Value = Temp + 48. So Temp = Value - 48.
        return val - 48;
    }

    private validateOffset(offset: number, size: number) {
        if (offset + size > this.buffer.byteLength) {
            throw new Error(`Offset ${offset} out of bounds (Buffer size: ${this.buffer.byteLength})`);
        }
    }
}
