'use client';

import React, { useCallback } from 'react';
import { UploadCloud } from 'lucide-react';

interface Props {
    onFileSelect: (file: File) => void;
    accept: string;
    label: string;
    className?: string;
}

export const DropZone: React.FC<Props> = ({ onFileSelect, accept, label, className = '' }) => {
    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                onFileSelect(e.dataTransfer.files[0]);
                e.dataTransfer.clearData();
            }
        },
        [onFileSelect]
    );

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFileSelect(e.target.files[0]);
        }
    };

    return (
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`relative border-2 border-dashed border-slate-600 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:border-blue-400 hover:bg-slate-800 transition-colors cursor-pointer ${className}`}
        >
            <input
                type="file"
                accept={accept}
                onChange={handleChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <UploadCloud className="w-10 h-10 text-slate-400 mb-2" />
            <span className="text-slate-300 font-medium">{label}</span>
            <span className="text-xs text-slate-500 mt-1">Drag & drop or click to browse</span>
        </div>
    );
};
