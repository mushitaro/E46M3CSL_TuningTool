import Papa from 'papaparse';
import { APP_CONFIG } from '@/config/constants';
import { LogDataPoint } from '@/lib/types';

export const parseLogFile = (csvText: string): LogDataPoint[] => {
    const { data, meta } = Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimiter: '', // Auto-detect delimiter (semicolon or comma)
        transformHeader: (h) => h.trim()
    });

    // Debug info
    if (data.length > 0) {
        console.log('CSV First Row Raw Keys:', Object.keys(data[0] as any));
        console.log('Full First Row:', data[0]);
    }

    // Normalize headers to lowercase to avoid case issues (Motor Temp vs temp)
    const normalizedData = (data as any[]).map(row => {
        const newRow: any = {};
        Object.keys(row).forEach(k => {
            newRow[k.toLowerCase()] = row[k];
        });
        return newRow;
    });

    // Mapping keys should also be lowercase
    const mapping = {
        TIME: APP_CONFIG.CSV_MAPPING.TIME.toLowerCase(),
        RPM: APP_CONFIG.CSV_MAPPING.RPM.toLowerCase(),
        RAW_LOAD: APP_CONFIG.CSV_MAPPING.RAW_LOAD.toLowerCase(),
        STFT_1: APP_CONFIG.CSV_MAPPING.STFT_1.toLowerCase(),
        STFT_2: APP_CONFIG.CSV_MAPPING.STFT_2.toLowerCase(),
        COOLANT_TEMP: APP_CONFIG.CSV_MAPPING.COOLANT_TEMP.toLowerCase()
    };

    const results: LogDataPoint[] = [];

    // Headers matching
    // We already lowercased data keys.
    const mapKeys = {
        time: mapping.TIME,
        rpm: mapping.RPM,
        load: mapping.RAW_LOAD,
        stft1: mapping.STFT_1,
        stft2: mapping.STFT_2,
        lambda1: APP_CONFIG.CSV_MAPPING.LAMBDA_1.toLowerCase(), // [NEW]
        lambda2: APP_CONFIG.CSV_MAPPING.LAMBDA_2.toLowerCase(), // [NEW]
        // Fallbacks for Temp
        temp1: mapping.COOLANT_TEMP,
        temp2: 'motor temp.',
        temp3: 'coolant temp'
    };

    for (const row of normalizedData) {
        if (
            typeof row[mapKeys.time] !== 'number' ||
            typeof row[mapKeys.rpm] !== 'number'
        ) {
            continue;
        }

        // Coolant: Try configured, then fallbacks
        // [UPDATED] If missing, leave undefined. Do not default to 95.
        // The user intentionally wants to hide/skip temp if missing.
        let coolant = row[mapKeys.temp1];
        if (typeof coolant !== 'number') coolant = row[mapKeys.temp2];
        if (typeof coolant !== 'number') coolant = row[mapKeys.temp3];

        const coolantTemp = typeof coolant === 'number' ? coolant : undefined;

        // Handle Lambda Legacy: logic for 1 or 2 banks (STFT)
        let s1 = row[mapKeys.stft1];
        let s2 = row[mapKeys.stft2];

        // Validate number
        if (typeof s1 !== 'number') s1 = null;
        if (typeof s2 !== 'number') s2 = null;

        if (s1 === null && s2 === null) {
            s1 = 1.0;
            s2 = 1.0;
        } else if (s1 === null) {
            s1 = s2;
        } else if (s2 === null) {
            s2 = s1;
        }

        // [NEW] Handle Actual Lambda
        let l1 = row[mapKeys.lambda1];
        let l2 = row[mapKeys.lambda2];

        // If l1 missing, maybe try to match any "lambda" column? 
        // For now strict mapping + fallback logic similar to STFT potentially?
        // Let's keep it simple: if missing, undefined.
        // User said "included in original CSV".

        // User Requirement: Use Lambda Integrator (STFT) values as "Lambda" for display.
        // HOWEVER, if the CSV only has 1 bank (STFT 1), STFT 2 is auto-filled with STFT 1 for calculation safety.
        // For DISPLAY (Lambda columns), the user wants to see "Empty" if Bank 2 is missing, not a copy of Bank 1.

        const point: LogDataPoint = {
            time: row[mapKeys.time],
            rpm: row[mapKeys.rpm],
            rawLoad: row[mapKeys.load] || 0,
            stft1: s1, // Used for Calc (Auto-filled if missing)
            stft2: s2, // Used for Calc (Auto-filled if missing)
            lambda1: typeof row[mapKeys.stft1] === 'number' ? row[mapKeys.stft1] : undefined, // Display: Only if physically present
            lambda2: typeof row[mapKeys.stft2] === 'number' ? row[mapKeys.stft2] : undefined, // Display: Only if physically present
            coolantTemp: coolantTemp,
        };

        results.push(point);
    }

    return results;
};
