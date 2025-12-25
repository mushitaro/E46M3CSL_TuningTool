export interface VEMap {
    xAxis: number[]; // RPM
    yAxis: number[]; // Load
    data: number[][]; // VE Values
}

export interface BinaryConfig {
    mapCorrection: boolean; // k_rf_cfg
    tempLimit: number; // K_LAA_TMOT_MIN
}

export interface LogDataPoint {
    time: number;
    rpm: number;
    rawLoad: number; // relativer Oeffnungsquerschnitt
    correctedLoad?: number; // AQ_REL_ALPHA_N (calculated)
    stft1: number;
    stft2: number;
    lambda1?: number; // [NEW] Actual Lambda
    lambda2?: number; // [NEW] Actual Lambda
    coolantTemp?: number; // [UPDATED] Optional
    correctionFactor?: number; // [NEW] For debugging validation
}

export interface ProcessedLog {
    fileName: string;
    data: LogDataPoint[];
    validCount: number;
    droppedCount: number;
}

export interface LogFilterConfig {
    enableCorrection: boolean; // Default: true. Set false if CSV is already processed.
    enableMinTemp: boolean;
    minTemp: number;         // Default: 65 (Water Temp > 65)

    enableIdle: boolean;
    idleRpm: number;         // Default: 1000 (Exclude < 1000 RPM & RawLoad=0)

    enableTransient: boolean;
    transientWindow: number; // Default: 4 (Frames to look back)
    rpmStableThreshold: number; // Default: 10 (% Change)
    tpsStableThreshold: number; // Default: 5 (Absolute Change in RO)
}

export interface InterpolationPoint {
    rpm: number;
    factor: number;
}
