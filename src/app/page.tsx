'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic'; // Added dynamic import
import { DropZone } from '@/components/DropZone';
import { MapEditor } from '@/components/MapEditor';
// Dynamic imports for heavy components
const MapVisualizer = dynamic(() => import('@/components/MapVisualizer').then(mod => mod.MapVisualizer), { ssr: false });
const LogTimeSeriesChart = dynamic(() => import('@/components/LogTimeSeriesChart').then(mod => mod.LogTimeSeriesChart), { ssr: false });
import { BinaryParser } from '@/lib/binary-engine/parser';
import { BinaryPatcher } from '@/lib/binary-engine/patcher';
import { parseLogFile } from '@/lib/log-engine/parser';
import { processLogData } from '@/lib/log-engine/filter';
import { VECalculator } from '@/lib/ve-calculator/calculator';
import { VEMap, ProcessedLog, LogDataPoint, LogFilterConfig, InterpolationPoint } from '@/lib/types';
import { FilterConfigPanel } from '@/components/FilterConfigPanel';
import { InterpolationTableEditor } from '@/components/InterpolationTableEditor';
import { LogDataTable } from '@/components/LogDataTable';
import { AlertCircle, CheckCircle, Download, FileCode, FileSpreadsheet, Settings, Power, Zap, Thermometer, Cpu, Trash2, Github, BookOpen } from 'lucide-react';
import { APP_CONFIG, MAP_DIMENSIONS, RPM_AXIS, TPS_AXIS, CSL_STOCK_MAP_DATA, CSL_STOCK_WARMUP_RPM, CSL_STOCK_WARMUP_LOAD, CSL_STOCK_WOT_RPM, CSL_STOCK_WOT_LOAD } from '@/config/constants';

export default function Home() {
  // State
  const [binaryFile, setBinaryFile] = useState<File | null>(null);
  const [binaryBuffer, setBinaryBuffer] = useState<ArrayBuffer | null>(null);
  const [currentMap, setCurrentMap] = useState<VEMap | null>(null);

  const [logFile, setLogFile] = useState<File | null>(null);
  const [rawLogData, setRawLogData] = useState<LogDataPoint[] | null>(null); // Store raw parsed data
  const [processedLog, setProcessedLog] = useState<ProcessedLog | null>(null);
  const [filterConfig, setFilterConfig] = useState<LogFilterConfig>({
    enableCorrection: true,
    enableMinTemp: true,
    minTemp: 65,
    enableIdle: true,
    idleRpm: 1000,
    enableTransient: true,
    transientWindow: 4,
    rpmStableThreshold: 10,
    tpsStableThreshold: 5,
  });

  const [interpolationTable, setInterpolationTable] = useState<InterpolationPoint[]>(APP_CONFIG.MSS54HP.INTERPOLATION_TABLE);

  const [newMap, setNewMap] = useState<VEMap | null>(null);
  const [initialMapData, setInitialMapData] = useState<number[][]>(Array(MAP_DIMENSIONS.rows).fill(Array(MAP_DIMENSIONS.cols).fill(0)));

  // [NEW] Flexible Comparison State
  const [diffSubject, setDiffSubject] = useState<'tuned' | 'current' | 'stock'>('tuned');
  const [diffReference, setDiffReference] = useState<'tuned' | 'current' | 'stock'>('current');

  const [mapData, setMapData] = useState<number[][]>(Array(MAP_DIMENSIONS.rows).fill(Array(MAP_DIMENSIONS.cols).fill(0)));
  const [hitMap, setHitMap] = useState<number[][] | null>(null);
  const [correctionMap, setCorrectionMap] = useState<number[][] | null>(null);
  const [weightMap, setWeightMap] = useState<number[][] | null>(null);

  // [EXPERIMENTAL]
  const [warmupMap, setWarmupMap] = useState<VEMap | null>(null);
  const [wotMap, setWotMap] = useState<VEMap | null>(null);

  // [EXPERIMENTAL] UI Controls
  const [applyWotDisable, setApplyWotDisable] = useState<boolean>(false); // Default OFF
  const [writeWarmup, setWriteWarmup] = useState<boolean>(false); // Default OFF
  const [writeWot, setWriteWot] = useState<boolean>(false); // Default OFF

  const [patchStatus, setPatchStatus] = useState<{ mapOff: boolean; tempLimit: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'lambda' | 'new' | 'diff' | 'log' | 'warmup' | 'wot'>('current');
  const [debugHex, setDebugHex] = useState<string>('');
  const [applyPatch, setApplyPatch] = useState<boolean>(false);

  // [NEW] Windowing State
  const [logWindowStart, setLogWindowStart] = useState<number>(0);
  const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null); // [NEW] Selection State
  const LOG_WINDOW_SIZE = 2000;

  // Reset window when file changes
  useEffect(() => {
    setLogWindowStart(0);
    setSelectedLogIndex(null);
  }, [processedLog]);

  // Reset selection when window slides
  useEffect(() => {
    setSelectedLogIndex(null);
  }, [logWindowStart]);

  // Compute windowed data
  const windowedLogData = useMemo(() => {
    if (!processedLog) return [];
    return processedLog.data.slice(logWindowStart, logWindowStart + LOG_WINDOW_SIZE);
  }, [processedLog, logWindowStart]);

  // [EXPERIMENTAL] Auto-gen Warmup Map Effect
  useEffect(() => {
    if (newMap) {
      try {
        const calc = new VECalculator();
        const wMap = calc.generateWarmupMap(newMap);
        setWarmupMap(wMap);

        const wotData = calc.generateWOTMap(newMap);
        setWotMap({
          xAxis: CSL_STOCK_WOT_RPM,
          yAxis: CSL_STOCK_WOT_LOAD,
          data: wotData
        });
      } catch (e) {
        console.error("Failed to gen experimental maps", e);
      }
    } else {
      setWarmupMap(null);
      setWotMap(null);
    }
  }, [newMap]);

  // Logic
  const handleBinaryUpload = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const parser = new BinaryParser(buffer);
      const map = parser.getVETable();

      setBinaryFile(file);
      setBinaryBuffer(buffer);
      setCurrentMap(map);
      setInitialMapData(map.data); // Store initial map data for comparison

      // Debug: Read first 16 bytes at VE Table Data address
      try {
        const offset = 0xD356;
        const view = new DataView(buffer);
        let hex = '';
        for (let i = 0; i < 16; i++) {
          hex += view.getUint8(offset + i).toString(16).padStart(2, '0').toUpperCase() + ' ';
        }
        setDebugHex(hex);
      } catch (e) { }

      // Check patch status
      const isMapOff = parser.getMapCorrectionStatus();
      const tempVal = parser.getTempThreshold();
      const isTempHigh = tempVal >= 99;

      // Check WOT status
      const isWotDisabled = parser.getWOTThresholdStatus();

      setPatchStatus({
        mapOff: isMapOff, // True if OFF
        tempLimit: isTempHigh
      });

      // Auto-set toggle if file is already patched (Log Settings active)
      if (isMapOff && isTempHigh) {
        setApplyPatch(true);
      } else {
        setApplyPatch(false);
      }

      // Auto-set WOT toggle
      setApplyWotDisable(isWotDisabled);

      // Validating size/axes
      console.log('Parsed Map:', map);
    } catch (e: any) {
      alert('Error parsing binary: ' + e.message);
    }
  };

  const handleLogUpload = async (file: File) => {
    try {
      const text = await file.text();
      const rawData = parseLogFile(text);

      if (rawData.length === 0) {
        alert('No valid data found in CSV.');
        return;
      }

      setRawLogData(rawData); // Save raw data

      // Process with current config
      const processed = processLogData(rawData, file.name, filterConfig, interpolationTable);

      setLogFile(file);
      setProcessedLog(processed);

      // Auto-calculate if BIN is present
      if (currentMap) {
        runCalculation(currentMap, processed.data);
        setActiveTab('new');
      }
    } catch (e: any) {
      alert('Error parsing log: ' + e.message);
    }
  };

  const runCalculation = (map: VEMap, data: any[]) => {
    const calc = new VECalculator();
    const result = calc.calculateNewVEMap(map, data);

    setNewMap(result.newMap);
    setMapData(result.diffMap); // Use mapData for diffMap
    setHitMap(result.hitMap);
    setCorrectionMap(result.correctionMap);
    setWeightMap(result.weightMap); // [NEW]

    // [EXPERIMENTAL] Auto-gen Warmup Map for Visualization
    try {
      const wMap = calc.generateWarmupMap(result.newMap);
      setWarmupMap(wMap);
    } catch (e) {
      console.error("Failed to gen warmup map", e);
    }

    // Auto-switch view to Diff if logic runs successfully, and set sensible defaults if needed
    if (diffSubject === 'current' && diffReference === 'stock') {
      // If user was looking at Current vs Stock, maybe switch to Tuned vs Stock?
      // Or keep as is. Let's switch Subject to Tuned for convenience.
      setDiffSubject('tuned');
      setDiffReference('stock');
    } else {
      // Default Tuned vs Current
      setDiffSubject('tuned');
      setDiffReference('current');
    }
    setActiveTab('diff');
  };

  const handleConfigChange = (newConfig: LogFilterConfig) => {
    setFilterConfig(newConfig);

    // If we have raw data, re-process and re-calc
    if (rawLogData && logFile) {
      const processed = processLogData(rawLogData, logFile.name, newConfig, interpolationTable);
      setProcessedLog(processed);

      if (currentMap) {
        runCalculation(currentMap, processed.data);
      }
    }
  };

  const handleClearLog = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering file select
    if (confirm('Are you sure you want to remove the CSV file?')) {
      setLogFile(null);
      setRawLogData(null);
      setProcessedLog(null);
      setHitMap(null);
      setCorrectionMap(null);
      setNewMap(null);
      setNewMap(null);
      setWeightMap(null);
      setWarmupMap(null);
      setLogWindowStart(0);
      setSelectedLogIndex(null);
      // Reset diff comparison state if needed, or keep it
      if (activeTab === 'log' || activeTab === 'new' || activeTab === 'diff' || activeTab === 'lambda') {
        setActiveTab('current');
      }
    }
  };

  const handleTableChange = (newTable: InterpolationPoint[]) => {
    setInterpolationTable(newTable);
    if (rawLogData && logFile) {
      const processed = processLogData(rawLogData, logFile.name, filterConfig, newTable);
      setProcessedLog(processed);

      // Auto-recalculate
      if (currentMap && processed.validCount > 0) {
        runCalculation(currentMap, processed.data);
      }
    }
  };

  const getFormattedDate = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const H = String(now.getHours()).padStart(2, '0');
    const M = String(now.getMinutes()).padStart(2, '0');
    return `${y}${m}${d}${H}${M}`;
  };

  const handleDownloadBin = () => {
    if (!binaryBuffer) return;

    // working buffer
    const patcher = new BinaryPatcher(binaryBuffer);

    // Apply New Map if exists
    if (newMap) {
      patcher.setVETable(newMap);

      // [EXPERIMENTAL] Auto-gen derivative maps
      const calc = new VECalculator();

      if (writeWarmup) {
        const warmupMap = calc.generateWarmupMap(newMap);
        patcher.setWarmupTable(warmupMap);
      }

      if (writeWot) {
        const wotData = calc.generateWOTMap(newMap);
        patcher.setWOTMap(wotData);
      }
    }

    // Apply or Revert Logic Patch
    if (applyPatch) {
      patcher.disableMapCorrection();
      // Temp threshold handled in disableMapCorrection (User request: consistency)
    } else {
      // Revert to Stock/Enabled behavior if user explicitly turned it OFF
      // and we are generating a file.
      patcher.enableMapCorrection();
      // Temp threshold handled in enableMapCorrection (set to 69C)
    }

    // [EXPERIMENTAL] WOT Threshold Patch (Independent of Logic Patch)
    // If Checked (applyWotDisable = true) -> SET Threshold to 100% (Disable WOT Mode)
    // If Unchecked -> SET Threshold to Stock (Enable WOT Mode)
    patcher.setWOTThreshold(applyWotDisable);

    // Filename Generation
    const dateStr = getFormattedDate();
    let baseName = binaryFile?.name.replace(/\.bin$/i, '') || 'tune';

    // Clean up existing prefixes/suffixes to avoid duplication like "Tune_..._Tune_..."
    // Remove "Tune_YYYYMMDDHHMM_" prefix
    baseName = baseName.replace(/^Tune_\d{12}_/, '');
    // Remove known suffixes
    baseName = baseName.replace(/(_PatchON|_PatchOFF|_LTFT&MAPOFFPached)$/, '');

    const patchSuffix = applyPatch ? '_PatchON' : '_PatchOFF'; // Clear suffix indication
    const fileName = `Tune_${dateStr}_${baseName}${patchSuffix}.bin`;

    // Create Blob
    const blob = new Blob([patcher.getBuffer()], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Memoized diff map for visualization
  const diffMapForVisualization = useMemo(() => {
    // Resolve Data Maps
    const getMapData = (type: 'tuned' | 'current' | 'stock') => {
      switch (type) {
        case 'tuned': return newMap ? newMap.data : null;
        case 'current': return initialMapData; // Original loaded data
        case 'stock': return CSL_STOCK_MAP_DATA;
        default: return null;
      }
    };

    const subjectData = getMapData(diffSubject);
    const referenceData = getMapData(diffReference);

    if (!subjectData || !referenceData) return initialMapData.map(row => row.map(() => 0)); // Return zeros if data missing

    const diff = subjectData.map((row, rIdx) =>
      row.map((val, cIdx) => {
        const originalVal = referenceData[rIdx]?.[cIdx] || 0;
        // Percentage Difference: (Subject - Reference) / Reference * 100
        // Handle Divide by Zero
        return originalVal !== 0 ? ((val - originalVal) / originalVal) * 100 : 0;
      })
    );
    return diff;
  }, [newMap, initialMapData, diffSubject, diffReference]);

  // Helper for UI labels
  const getMapLabel = (type: 'tuned' | 'current' | 'stock') => {
    switch (type) {
      case 'tuned': return 'TUNED MAP';
      case 'current': return 'CURRENT MAP';
      case 'stock': return 'CSL STOCK';
      default: return type;
    }
  };

  return (
    <main className="h-screen flex flex-col bg-slate-950 font-sans text-slate-300 overflow-hidden selection:bg-blue-500/30">
      {/* App Header - Ultra Minimal */}
      <header className="px-6 py-3 flex justify-between items-center bg-slate-950/80 backdrop-blur-md border-b border-slate-900 z-10 shrink-0 h-[48px]">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
          <h1 className="text-sm font-bold tracking-widest text-slate-200 uppercase">
            MSS54HP CSL CONVERT <span className="text-slate-600">///</span> TUNER
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* GitHub Link */}
          <a
            href="https://github.com/mushitaro/mss54hp-csl-convert-tuner"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title="View on GitHub"
          >
            <Github className="w-5 h-5" />
          </a>

          {/* Forum Link */}
          <a
            href="https://nam3forum.com/forums/forum/special-interests/coding-tuning/242281-a-quick-and-easy-way-to-street-tune-your-csl-conversion-for-drivability"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-2 group"
            title="Methodology Source: NA M3 Forum"
          >
            <BookOpen className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider hidden sm:block opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">Tuning Guide</span>
          </a>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* === LEFT COLUMN (70%) === */}
        <div className="w-[70%] flex flex-col border-r border-slate-900 relative bg-slate-950/40">

          {/* Header Frame (Tabs) - Matches Right Column Header Height */}
          <div className="h-[40px] flex items-center px-4 border-b border-slate-900 bg-slate-900/50 backdrop-blur-sm flex-none z-50">
            <div className="flex space-x-6 h-full mr-auto">
              {[
                { id: 'current', label: 'CURRENT MAP' },
                { id: 'lambda', label: 'LAMBDA FEEDBACK' },
                { id: 'new', label: 'TUNED MAP' },
                { id: 'diff', label: 'DIFFERENCE %' },
                { id: 'log', label: 'CORRECTED ROG' },
                { id: 'warmup', label: 'WARMUP (DERIVED / EXP.)' },
                { id: 'wot', label: 'WOT (DERIVED / EXP.)' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  disabled={
                    (tab.id === 'log' && !processedLog) ||
                    (tab.id === 'warmup' && !warmupMap) ||
                    (tab.id === 'wot' && !wotMap) ||
                    (tab.id !== 'current' && tab.id !== 'log' && tab.id !== 'diff' && tab.id !== 'warmup' && tab.id !== 'wot' && !newMap) || // Allow Diff if currentMap exists (handled by activeTab check)
                    (tab.id === 'diff' && !currentMap) || // Enable Diff if Current Map is loaded (even if no Tuned Map)
                    (tab.id === 'lambda' && !correctionMap)
                  }
                  className={`relative h-full flex items-center text-[10px] font-bold tracking-widest transition-all ${activeTab === tab.id
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent disabled:opacity-20'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* [NEW] Log Window Slider (Only visible in Log View) */}
            {activeTab === 'log' && processedLog && (
              <div className="flex items-center gap-4 flex-1 max-w-md mx-8 animate-in fade-in duration-300">
                <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                  WIN: {logWindowStart} - {Math.min(processedLog.data.length, logWindowStart + LOG_WINDOW_SIZE)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, processedLog.data.length - LOG_WINDOW_SIZE)}
                  step={100}
                  value={logWindowStart}
                  onChange={(e) => setLogWindowStart(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-colors"
                />
                <span className="text-[9px] text-slate-600 font-mono whitespace-nowrap"> / {processedLog.validCount}</span>
              </div>
            )}

            {/* Log Stats & Filter */}
            <div className="h-full flex items-center border-l border-slate-800 pl-4 ml-4 gap-4">
              {processedLog && (
                <div className="flex flex-col items-end justify-center h-full">
                  <div className="flex items-center gap-2 text-[9px] font-mono leading-none mb-1">
                    <span className="text-slate-500">VALID</span>
                    <span className="text-blue-400 font-bold">{processedLog.validCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-mono leading-none">
                    <span className="text-slate-600">TOTAL</span>
                    <span className="text-slate-500">{(processedLog.validCount + processedLog.droppedCount).toLocaleString()}</span>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <InterpolationTableEditor
                  config={interpolationTable}
                  onSave={handleTableChange}
                  enabled={filterConfig.enableCorrection}
                  onToggle={(enabled) => handleConfigChange({ ...filterConfig, enableCorrection: enabled })}
                />
                <FilterConfigPanel config={filterConfig} onConfigChange={handleConfigChange} />
              </div>
            </div>
          </div>

          {/* Grid Container */}
          <div className="flex-1 overflow-auto relative">
            {/* Content */}
            <div className="absolute inset-0 pt-2 pb-2 px-4">
              {(activeTab === 'current' && currentMap) && <MapEditor mapData={currentMap} />}
              {(activeTab === 'new' && newMap) && (
                <MapEditor
                  mapData={newMap}
                  hitData={hitMap || undefined}
                  weightData={weightMap || undefined}
                />
              )}
              {(activeTab === 'diff' && mapData) && ( // Changed from diffMap
                <div className="h-full w-full flex flex-col">
                  {/* Diff Section Header with Selectors */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-400 mr-2">COMPARE</span>

                    <div className="flex items-center gap-2 flex-1">
                      {/* Subject Selector */}
                      <div className="flex items-center gap-1 bg-slate-800 rounded px-2 py-0.5">
                        <span className="text-[9px] text-slate-500 uppercase">Subject</span>
                        <select
                          value={diffSubject}
                          onChange={(e) => setDiffSubject(e.target.value as any)}
                          className="bg-transparent text-[10px] font-bold text-white outline-none cursor-pointer"
                        >
                          <option value="tuned" disabled={!newMap} className="bg-slate-900 text-slate-300">TUNED</option>
                          <option value="current" className="bg-slate-900 text-slate-300">CURRENT</option>
                          <option value="stock" className="bg-slate-900 text-slate-300">CSL STOCK</option>
                        </select>
                      </div>

                      <span className="text-xs text-slate-600 font-bold">vs</span>

                      {/* Reference Selector */}
                      <div className="flex items-center gap-1 bg-slate-800 rounded px-2 py-0.5">
                        <span className="text-[9px] text-slate-500 uppercase">Reference</span>
                        <select
                          value={diffReference}
                          onChange={(e) => setDiffReference(e.target.value as any)}
                          className="bg-transparent text-[10px] font-bold text-indigo-400 outline-none cursor-pointer"
                        >
                          <option value="tuned" disabled={!newMap} className="bg-slate-900 text-slate-300">TUNED</option>
                          <option value="current" className="bg-slate-900 text-slate-300">CURRENT</option>
                          <option value="stock" className="bg-slate-900 text-slate-300">CSL STOCK</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-hidden relative">
                    <MapEditor
                      mapData={{ ...(newMap || currentMap!), data: diffMapForVisualization || [] }} // Fallback to currentMap if newMap null
                      diffData={diffMapForVisualization || undefined}
                      hitData={hitMap || undefined}
                      weightData={weightMap || undefined}
                    />
                  </div>
                </div>
              )}
              {(activeTab === 'lambda' && correctionMap && newMap) && (
                <MapEditor
                  mapData={{ ...newMap, data: correctionMap }}
                  hitData={hitMap || undefined}
                  weightData={weightMap || undefined}
                />
              )}

              {(activeTab === 'warmup' && warmupMap) && (
                <MapEditor mapData={warmupMap} />
              )}

              {(activeTab === 'wot' && wotMap) && (
                <MapEditor mapData={wotMap} />
              )}

              {(activeTab === 'log' && processedLog) && (
                <div className="h-full w-full pb-0">
                  <LogDataTable
                    data={windowedLogData}
                    selectedIndex={selectedLogIndex}
                    onRowClick={setSelectedLogIndex}
                    totalCount={processedLog.data.length}
                  />
                </div>
              )}

              {!currentMap && activeTab !== 'log' && (
                <div className="h-full flex flex-col items-center justify-center text-slate-700">
                  <div className="w-16 h-16 border-2 border-dashed border-slate-800 rounded-full flex items-center justify-center mb-4 opacity-50">
                    <FileCode className="w-6 h-6 opacity-50" />
                  </div>
                  <p className="text-xs font-mono opacity-50">AWAITING BINARY FILE...</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* === RIGHT COLUMN (30%) === */}
        <div className="w-[30%] flex flex-col bg-slate-901/20 backdrop-blur-sm relative z-20 overflow-hidden">

          {/* Header Frame - Matches Left Column Height */}
          <div className="h-[40px] flex items-center justify-between px-4 border-b border-slate-900 bg-slate-900/50 backdrop-blur-sm flex-none">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Visualization & Inputs</span>
          </div>

          {/* CONTENT FLEX CONTAINER (6:4 Split) */}
          <div className="flex-1 flex flex-col min-h-0">

            {/* 3D Graph (Flex 7) */}
            <div className="flex-[7] min-h-0 relative overflow-hidden bg-gradient-to-b from-slate-900/10 to-transparent">
              {(activeTab === 'current' && currentMap) && <MapVisualizer mapData={currentMap} title="" zAxisLabel="RF %" />}
              {(activeTab === 'new' && newMap) && <MapVisualizer mapData={newMap} title="" zAxisLabel="RF %" />}
              {(activeTab === 'diff' && diffMapForVisualization && (newMap || currentMap)) && (
                <MapVisualizer mapData={{ ...(newMap || currentMap!), data: diffMapForVisualization }} title="" zAxisLabel="Diff %" />
              )}
              {(activeTab === 'lambda' && correctionMap && newMap) && (
                <MapVisualizer mapData={{ ...newMap, data: correctionMap }} title="" zAxisLabel="Lambda" />
              )}
              {(activeTab === 'warmup' && warmupMap) && <MapVisualizer mapData={warmupMap} title="" zAxisLabel="RF %" />}
              {(activeTab === 'wot' && wotMap) && <MapVisualizer mapData={wotMap} title="" zAxisLabel="RF %" />}
              {(activeTab === 'log' && processedLog) && (
                <div className="h-full w-full pb-0 relative">
                  {/* Chart Container - Absolute fill to ensure responsiveness */}
                  <div className="absolute inset-0">
                    <LogTimeSeriesChart
                      data={windowedLogData}
                      selectedIndex={selectedLogIndex}
                      onPointClick={setSelectedLogIndex}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Inputs & Controls (Flex 3) */}
            <div className="flex-[3] min-h-0 overflow-y-auto px-5 pt-4 pb-5 flex flex-col">

              {/* Minimal File Inputs - No Icons, Just Text, Hover for action */}
              <div className="space-y-1 mb-4">
                {/* BIN */}
                <div className="group relative rounded flex items-center justify-between overflow-hidden hover:bg-slate-900/50 transition-colors h-[32px] px-2 cursor-pointer border-b border-transparent hover:border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest group-hover:text-blue-400 transition-colors">BIN</span>
                  <span className="text-[10px] text-slate-600 font-mono truncate max-w-[140px] text-right">{binaryFile ? binaryFile.name : "Select File"}</span>
                  <DropZone
                    label=""
                    accept=".bin"
                    onFileSelect={handleBinaryUpload}
                    className="!absolute !inset-0 !opacity-0 !border-0 cursor-pointer"
                  />
                </div>

                {/* CSV */}
                <div className="group relative rounded flex items-center justify-between overflow-hidden hover:bg-slate-900/50 transition-colors h-[32px] px-2 cursor-pointer border-b border-transparent hover:border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest group-hover:text-green-400 transition-colors">TESTO CSV</span>
                  <div className="flex items-center gap-2 z-10">
                    <span className="text-[10px] text-slate-600 font-mono truncate max-w-[120px] text-right">{logFile ? logFile.name : "Select File"}</span>
                    {logFile && (
                      <button
                        onClick={handleClearLog}
                        className="p-1 text-slate-600 hover:text-red-400 transition-colors rounded hover:bg-slate-800"
                        title="Remove CSV"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <DropZone
                    label=""
                    accept=".csv"
                    onFileSelect={handleLogUpload}
                    className="!absolute !inset-0 !opacity-0 !border-0 cursor-pointer"
                  />
                </div>
              </div>

              {/* DASHBOARD CLUSTER (Harmonized Scale & Layout) */}
              {binaryFile && patchStatus && (
                <div className="relative fade-in-up mt-12 mb-12 select-none flex justify-center items-center">

                  {/* --- LEFT WING (Convex Arc) --- */}
                  <div className="flex flex-col items-end gap-[18px] mr-3">

                    {/* ROW 1: PATCH TOGGLE (Close to Ring) */}
                    <div className="h-7 flex items-center gap-3 mr-1 opacity-90 hover:opacity-100 transition-opacity">
                      <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${applyPatch ? 'text-blue-400' : 'text-slate-500'}`}>
                        PATCH
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer group">
                        <input type="checkbox" className="sr-only peer" checked={applyPatch} onChange={(e) => setApplyPatch(e.target.checked)} />
                        <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-900 peer-checked:after:bg-blue-400"></div>
                      </label>
                    </div>

                    {/* ROW 2: MAP STATUS (Pushed Away/Far) */}
                    <div className="h-7 flex items-center gap-4 mr-8 pr-1">
                      <span className="text-[10px] font-bold text-slate-600 tracking-widest uppercase">MAP</span>
                      <div className="flex items-center justify-end w-8">
                        <span className={`text-[11px] font-mono font-bold tracking-wider ${applyPatch ? 'text-amber-500' : 'text-slate-500'}`}>
                          {applyPatch ? 'OFF' : 'ON'}
                        </span>
                      </div>
                    </div>

                    {/* ROW 3: LTFT STATUS (Close to Ring) */}
                    <div className="h-7 flex items-center gap-3 mr-1 opacity-90 transition-opacity">
                      <span className="text-[10px] font-bold text-slate-600 tracking-widest uppercase">LTFT MIN</span>
                      <div className="flex items-center justify-end w-8">
                        <span className={`text-[11px] font-mono font-bold tracking-wider ${applyPatch ? 'text-amber-500' : 'text-slate-500'}`}>
                          {applyPatch ? '100' : 'OEM'}
                        </span>
                      </div>
                    </div>

                  </div>


                  {/* --- CENTRAL HUB: DOWNLOAD RING --- */}
                  <div className="relative group mx-2 z-10">
                    {/* Outer Glow/Border Ring */}
                    <div className={`absolute -inset-1 rounded-full border border-slate-800 opacity-100 transition-all duration-500 ${(newMap || (binaryBuffer && applyPatch)) ? 'border-blue-500/30' : ''}`}></div>

                    <button
                      onClick={() => handleDownloadBin()}
                      disabled={!binaryBuffer}
                      className={`
                            relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95
                            ${binaryBuffer
                          ? 'bg-slate-900 hover:bg-slate-800 text-blue-500 hover:text-blue-400 border border-slate-700 shadow-2xl cursor-pointer ring-1 ring-slate-800'
                          : 'bg-slate-900/50 border border-slate-800/50 text-slate-800 cursor-not-allowed'}
                        `}
                    >
                      <Download className={`w-7 h-7 transition-transform duration-300 stroke-[1.5] ${binaryBuffer ? 'group-hover:scale-110' : ''}`} />
                    </button>

                    {/* TUNE START Label */}
                    <div className="absolute -bottom-11 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      <span className={`text-[11px] tracking-[0.3em] font-medium transition-all duration-500 ${(newMap || (binaryBuffer && applyPatch)) ? 'text-blue-500' : 'text-transparent'} `}>
                        TUNE START
                      </span>
                    </div>
                  </div>


                  {/* --- RIGHT WING (Convex Arc) --- */}
                  <div className="flex flex-col items-start gap-[18px] ml-3">

                    {/* ROW 1: WOT TH 100 (Close to Ring) */}
                    <div className="h-7 flex items-center gap-3 ml-1 opacity-90 hover:opacity-100 transition-opacity">
                      <label className="relative inline-flex items-center cursor-pointer group">
                        <input type="checkbox" className="sr-only peer" checked={applyWotDisable} onChange={(e) => setApplyWotDisable(e.target.checked)} />
                        <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-900 peer-checked:after:bg-blue-400"></div>
                      </label>
                      <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${applyWotDisable ? 'text-blue-400' : 'text-slate-500'}`}>
                        WOT TH
                      </span>
                      <span className={`text-[11px] font-mono font-bold tracking-wider ml-1 ${applyWotDisable ? 'text-amber-500' : 'text-slate-500'}`}>
                        {applyWotDisable ? '102.3' : 'OEM'}
                      </span>
                    </div>

                    {/* ROW 2: WRITE WARMUP (Pushed Away/Far) */}
                    <div className="h-7 flex items-center gap-4 ml-8 pl-1">
                      <label className="relative inline-flex items-center cursor-pointer group">
                        <input type="checkbox" className="sr-only peer" checked={writeWarmup} onChange={(e) => setWriteWarmup(e.target.checked)} />
                        <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-900 peer-checked:after:bg-blue-400"></div>
                      </label>
                      <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${writeWarmup ? 'text-blue-400' : 'text-slate-500'}`}>
                        WRITE WARMUP
                      </span>
                    </div>

                    {/* ROW 3: WRITE WOT (Close to Ring) */}
                    <div className="h-7 flex items-center gap-3 ml-1 opacity-90 hover:opacity-100 transition-opacity">
                      <label className="relative inline-flex items-center cursor-pointer group">
                        <input type="checkbox" className="sr-only peer" checked={writeWot} onChange={(e) => setWriteWot(e.target.checked)} />
                        <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-900 peer-checked:after:bg-blue-400"></div>
                      </label>
                      <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${writeWot ? 'text-blue-400' : 'text-slate-500'}`}>
                        WRITE WOT
                      </span>
                    </div>

                  </div>

                </div>
              )}

              {
                !binaryFile && (
                  <div className="mt-auto text-center pb-10 opacity-20">
                    <div className="w-12 h-12 rounded-full border border-slate-700 mx-auto flex items-center justify-center">
                      <Download className="w-4 h-4 text-slate-700" />
                    </div>
                  </div>
                )
              }
            </div >
          </div >
        </div >
      </div >
    </main >
  );
}
