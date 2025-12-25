import React, { useMemo } from 'react';
import { LogDataPoint } from '@/lib/types';
import { AlertCircle } from 'lucide-react';

interface Props {
    data: LogDataPoint[];
    selectedIndex?: number | null;
    onRowClick?: (index: number) => void;
    totalCount?: number;
}

export const LogDataTable: React.FC<Props> = ({ data, selectedIndex, onRowClick, totalCount }) => {
    const limit = 2000;
    const displayData = data.slice(0, limit);
    const truncated = data.length > limit;

    // Use passed totalCount or fallback to data.length (for backward compatibility or when not windowed)
    const effectiveTotal = totalCount ?? data.length;

    // Check if we have data (based on first row usually sufficient for homogeneous CSV)
    const hasTemp = displayData.length > 0 && displayData[0].coolantTemp !== undefined;
    const hasLambda1 = displayData.length > 0 && displayData[0].lambda1 !== undefined;
    const hasLambda2 = displayData.length > 0 && displayData[0].lambda2 !== undefined;

    // Scroll to selected row
    React.useEffect(() => {
        if (selectedIndex !== undefined && selectedIndex !== null) {
            const row = document.getElementById(`log-row-${selectedIndex}`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [selectedIndex]);

    return (
        <div className="h-full flex flex-col bg-slate-900/50">
            <div className="flex px-4 py-2 border-b border-slate-800 justify-between items-center text-xs text-slate-400">
                <span>Displaying {displayData.length.toLocaleString()} of {effectiveTotal.toLocaleString()} records</span>
                {truncated && <span className="text-orange-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Truncated for performance</span>}
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar relative">
                <table className="w-full text-right border-collapse text-[10px] font-mono">
                    <thead className="sticky top-0 bg-slate-950 z-10 text-slate-500 font-bold uppercase tracking-wider">
                        <tr>
                            <th className="py-2 px-3 text-left border-b border-slate-800">Time</th>
                            <th className="py-2 px-3 border-b border-slate-800">RPM</th>
                            <th className="py-2 px-3 border-b border-slate-800 text-slate-400">Raw RO %</th>
                            <th className="py-2 px-3 border-b border-slate-800 text-purple-400">Factor</th>
                            <th className="py-2 px-3 border-b border-slate-800 text-blue-400">Corr. RO %</th>
                            {hasTemp && <th className="py-2 px-3 border-b border-slate-800">Temp</th>}
                            {hasLambda1 && <th className="py-2 px-3 border-b border-slate-800 text-green-400">Lambda 1</th>}
                            {hasLambda2 && <th className="py-2 px-3 border-b border-slate-800 text-green-400">Lambda 2</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {displayData.map((row, index) => (
                            <tr
                                key={index}
                                id={`log-row-${index}`}
                                onClick={() => onRowClick && onRowClick(index)}
                                className={`cursor-pointer transition-colors ${selectedIndex === index
                                    ? 'bg-blue-900/40 hover:bg-blue-900/50'
                                    : 'hover:bg-slate-800/50'
                                    }`}
                            >
                                <td className={`py-1 px-3 text-left ${selectedIndex === index ? 'text-blue-200' : 'text-slate-500'}`}>{row.time.toFixed(0)}</td>
                                <td className="py-1 px-3 text-slate-300">{row.rpm.toFixed(0)}</td>
                                <td className="py-1 px-3 text-slate-400">{row.rawLoad.toFixed(2)}</td>
                                <td className="py-1 px-3 text-purple-400">{row.correctionFactor?.toFixed(2) ?? '1.00'}</td>
                                <td className="py-1 px-3 text-blue-400 font-bold">{row.correctedLoad?.toFixed(2) ?? '-'}</td>
                                {hasTemp && <td className="py-1 px-3 text-slate-300">{row.coolantTemp?.toFixed(1) ?? '-'}</td>}
                                {hasLambda1 && <td className="py-1 px-3 text-green-400">{row.lambda1?.toFixed(3) ?? '-'}</td>}
                                {hasLambda2 && <td className="py-1 px-3 text-green-400">{row.lambda2?.toFixed(3) ?? '-'}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
