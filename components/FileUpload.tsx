
import React, { useRef, useState } from 'react';
import { UploadedFile } from '../types';
import { ICONS } from '../constants';
import { parseDocument } from '../services/fileService';
import { saveDocumentToFirebase } from '../services/firebaseService';

interface FileUploadProps {
  onFilesChange: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  files: UploadedFile[];
  onUploadSuccess?: () => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFilesChange, files, onUploadSuccess }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [isCognitiveOcr, setIsCognitiveOcr] = useState<boolean>(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const fileList = Array.from(e.target.files);
    
    // Add placeholders to UI immediately
    const placeholders: UploadedFile[] = fileList.map(f => ({ 
      name: f.name, 
      content: '', 
      type: f.type, 
      status: 'processing' 
    }));
    onFilesChange(prev => [...prev, ...placeholders]);

    for (const file of fileList) {
      try {
        const text = await parseDocument(file, {
          onProgress: (p) => setOcrProgress(p),
          onStatusChange: (isOcr) => setIsCognitiveOcr(isOcr)
        });

        // Push to Firebase for long-term memory
        await saveDocumentToFirebase(file.name, text, file.type);

        onFilesChange(prev => prev.map(f => 
          f.name === file.name ? { ...f, content: text, status: 'ready' } : f
        ));
        
        onUploadSuccess?.();
      } catch (err) {
        console.error(`Error parsing ${file.name}:`, err);
        onFilesChange(prev => prev.map(f => 
          f.name === file.name ? { ...f, status: 'error' } : f
        ));
      }
    }
    
    // Reset input so the same file can be uploaded again if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div 
        className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-400 cursor-pointer bg-white/50 transition-colors" 
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          multiple 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept=".pdf,.docx,.txt,.csv,.md,image/*" 
        />
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-3">
            <ICONS.Document />
          </div>
          <p className="text-slate-700 font-medium">Cognitive Intake Hub</p>
          <p className="text-slate-400 text-sm mt-1">High-Precision OCR & Firestore Auto-Sync</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {files.map((file, idx) => (
          <div key={idx} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className={`shrink-0 ${file.status === 'ready' ? 'text-indigo-500' : file.status === 'error' ? 'text-rose-500' : 'text-slate-400'}`}>
                  <ICONS.Document />
                </div>
                <span className="text-sm font-semibold text-slate-700 truncate">{file.name}</span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onFilesChange(prev => prev.filter((_, i) => i !== idx));
                }} 
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <ICONS.X />
              </button>
            </div>
            {file.status === 'processing' && (
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest animate-pulse">
                  {isCognitiveOcr ? `Neural Scan (${ocrProgress}%)` : 'Grounded Parsing...'}
                </span>
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 animate-[progress_1s_infinite] w-full origin-left"></div>
                </div>
              </div>
            )}
            {file.status === 'ready' && (
              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                <ICONS.Shield className="w-2 h-2" /> Context Loaded & Synced
              </span>
            )}
            {file.status === 'error' && (
              <span className="text-[9px] font-bold text-rose-500 uppercase tracking-widest">
                Parsing Failed
              </span>
            )}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes progress { 
          0% { transform: scaleX(0); } 
          50% { transform: scaleX(0.7); } 
          100% { transform: scaleX(1); } 
        }
      `}</style>
    </div>
  );
};
