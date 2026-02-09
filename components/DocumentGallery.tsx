
import React, { useState, useEffect } from 'react';
import { StoredDocument } from '../types';
import { ICONS } from '../constants';
import { deleteDocumentFromFirebase, getFirebasePermissionError, updateDocumentInFirebase } from '../services/firebaseService';

interface DocumentGalleryProps {
  documents: StoredDocument[];
  onRefresh: () => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSynthesize: () => void;
  isAnalyzing: boolean;
}

export const DocumentGallery: React.FC<DocumentGalleryProps> = ({ 
  documents, 
  onRefresh, 
  selectedIds, 
  onToggleSelect,
  onSynthesize,
  isAnalyzing
}) => {
  const [viewingDoc, setViewingDoc] = useState<StoredDocument | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  const hasError = getFirebasePermissionError();

  useEffect(() => {
    if (viewingDoc) {
      setEditContent(viewingDoc.content);
    } else {
      setIsEditing(false);
      setEditContent("");
    }
  }, [viewingDoc]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Delete this document from the cognitive library?")) {
      const success = await deleteDocumentFromFirebase(id);
      if (success) onRefresh();
    }
  };

  const handleSaveEdit = async () => {
    if (!viewingDoc) return;
    setIsSaving(true);
    const success = await updateDocumentInFirebase(viewingDoc.id, editContent);
    if (success) {
      setIsEditing(false);
      onRefresh();
      // Optional: Refresh the local view data or re-fetch from list
      const updatedDoc = { ...viewingDoc, content: editContent, updatedAt: Date.now() };
      setViewingDoc(updatedDoc);
    }
    setIsSaving(false);
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (hasError) {
    return (
      <div className="p-8 bg-rose-50 border-2 border-rose-100 rounded-[2rem] space-y-4 animate-in fade-in zoom-in-95">
        <div className="flex items-center gap-3 text-rose-600">
          <ICONS.Shield className="w-6 h-6" />
          <h4 className="font-black uppercase tracking-widest text-xs">Awaiting Rule Update...</h4>
        </div>
        <p className="text-sm text-rose-700 leading-relaxed">
          The cloud memory is locked. If you've updated your <strong>Firebase Rules</strong>, click the button below to establish the connection.
        </p>
        <div className="bg-slate-900 text-indigo-300 p-4 rounded-xl font-mono text-[10px] shadow-inner overflow-x-auto">
          <code>{`match /cognitive_documents/{doc=**} { allow read, write: if true; }`}</code>
        </div>
        <button 
          onClick={onRefresh}
          className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9" />
          </svg>
          Re-validate Cloud Memory
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Cognitive Library History</h4>
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-indigo-600 text-white rounded-full animate-in slide-in-from-left-2">
              <span className="text-[9px] font-black uppercase tracking-widest">{selectedIds.length} Selected</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <button 
              onClick={onSynthesize}
              disabled={isAnalyzing}
              className="px-6 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50"
            >
              {isAnalyzing ? "Analyzing..." : `Synthesize ${selectedIds.length} Docs`}
            </button>
          )}
          
          <div className="flex items-center gap-1 border border-slate-200 rounded-xl p-1 bg-slate-50">
            <button 
              onClick={() => documents.forEach(d => !selectedIds.includes(d.id) && onToggleSelect(d.id))}
              className="px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
            >
              Select All
            </button>
            <div className="w-px h-3 bg-slate-200"></div>
            <button 
              onClick={() => selectedIds.forEach(id => onToggleSelect(id))}
              className="px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-600 hover:bg-white rounded-lg transition-all"
            >
              Clear
            </button>
          </div>

          <button 
            onClick={onRefresh}
            className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 border border-slate-100"
            title="Refresh Library"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="py-12 border-2 border-dashed border-slate-100 rounded-[2rem] text-center bg-slate-50/50">
          <p className="text-slate-300 text-xs italic">The global cognitive library is currently empty.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => {
            const isSelected = selectedIds.includes(doc.id);
            return (
              <div 
                key={doc.id}
                onClick={() => onToggleSelect(doc.id)}
                className={`
                  bg-white border p-5 rounded-[2rem] transition-all cursor-pointer group relative h-full flex flex-col
                  ${isSelected ? 'border-indigo-600 ring-4 ring-indigo-50 shadow-2xl' : 'border-slate-100 hover:border-indigo-300'}
                `}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-2xl transition-colors ${isSelected ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-500'}`}>
                    <ICONS.Document className="w-4 h-4" />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setViewingDoc(doc); }}
                      className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                      title="View & Edit Content"
                    >
                      <ICONS.Search className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => handleDelete(e, doc.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                      title="Delete"
                    >
                      <ICONS.X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 space-y-1">
                  <h5 className="text-sm font-black text-slate-800 pr-6 leading-snug line-clamp-2">{doc.name}</h5>
                  <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    <span>{formatDate(doc.timestamp)}</span>
                    <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                    <span>{formatTime(doc.timestamp)}</span>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-50 flex items-center justify-between">
                  {isSelected ? (
                    <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                      Ready for Strategy
                    </span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                       <span className="text-[8px] font-black uppercase text-slate-400 px-3 py-1 bg-slate-50 rounded-lg">Stored In Cloud</span>
                       {doc.updatedAt && doc.updatedAt !== doc.timestamp && (
                         <span className="text-[7px] font-bold text-indigo-400 px-1">Modified: {formatDate(doc.updatedAt)}</span>
                       )}
                    </div>
                  )}
                  <span className="text-[8px] font-bold text-slate-300 uppercase">{doc.type.split('/')[1] || 'DOC'}</span>
                </div>

                {/* Selection Overlay Indicator */}
                <div className={`
                  absolute top-5 right-5 w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center
                  ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200 bg-white group-hover:border-indigo-400'}
                `}>
                  {isSelected && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* OCR Result Viewer & Editor Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
                  <ICONS.Search className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">
                    {isEditing ? 'Neural Intelligence Editor' : 'Neural Scan Review'}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      Captured: {formatDate(viewingDoc.timestamp)} at {formatTime(viewingDoc.timestamp)}
                    </p>
                    {viewingDoc.updatedAt && viewingDoc.updatedAt !== viewingDoc.timestamp && (
                      <>
                        <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                        <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">
                          Updated: {formatDate(viewingDoc.updatedAt)} at {formatTime(viewingDoc.updatedAt)}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {!isEditing ? (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-2.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all shadow-sm"
                  >
                    Edit Intelligence
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => { setIsEditing(false); setEditContent(viewingDoc.content); }}
                      className="px-4 py-2.5 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-rose-500"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                      className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSaving ? (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      Commit Changes
                    </button>
                  </div>
                )}
                <button 
                  onClick={() => setViewingDoc(null)}
                  className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-rose-500 hover:border-rose-100 transition-all shadow-sm"
                >
                  <ICONS.X />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
              <div className="mb-10 p-6 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
                 <h4 className="text-[10px] font-black uppercase text-indigo-600 tracking-widest mb-2">Cognitive Source Meta</h4>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">File Name</p>
                       <p className="text-xs font-bold text-slate-800 line-clamp-1">{viewingDoc.name}</p>
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Database ID</p>
                       <p className="text-xs font-mono text-slate-500">#{viewingDoc.id.substring(0, 12)}</p>
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Format</p>
                       <p className="text-xs font-bold text-slate-800 uppercase">{viewingDoc.type.split('/')[1] || 'DOCUMENT'}</p>
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Memory Integrity</p>
                       <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                         <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> Verified
                       </p>
                    </div>
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="flex items-center justify-between mb-4">
                   <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                     {isEditing ? 'Editing OCR Extracted Payload' : 'Extracted Intelligence Core'}
                   </h4>
                   {isEditing && (
                     <span className="text-[9px] font-bold text-indigo-400 animate-pulse uppercase tracking-widest">Manual Override Active</span>
                   )}
                 </div>
                 
                 {isEditing ? (
                   <textarea
                     value={editContent}
                     onChange={(e) => setEditContent(e.target.value)}
                     className="w-full h-[500px] bg-slate-50 border-2 border-indigo-100 rounded-[2rem] p-10 font-mono text-sm leading-relaxed text-slate-700 shadow-inner focus:border-indigo-500 outline-none transition-all resize-none"
                     placeholder="Edit document intelligence content here..."
                   />
                 ) : (
                   <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-10 font-mono text-sm leading-relaxed text-slate-700 whitespace-pre-wrap shadow-inner min-h-[500px]">
                      {viewingDoc.content || "Neural scan empty or content missing from database index."}
                   </div>
                 )}
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-white flex justify-between items-center">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                Grounded Knowledge Base v3.1 • Cross-Referencing Active
              </p>
              <button 
                onClick={() => setViewingDoc(null)}
                className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
