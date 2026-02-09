
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { Auth } from './components/Auth';
import { FileUpload } from './components/FileUpload';
import { AnalysisView } from './components/AnalysisView';
import { AudioGenerator } from './components/AudioGenerator';
import { PracticeSession } from './components/PracticeSession';
import { CognitiveSearch } from './components/CognitiveSearch';
import { SalesGPT } from './components/SalesGPT';
import { MeetingContextConfig } from './components/MeetingContextConfig';
import { DocumentGallery } from './components/DocumentGallery';
import { VideoGenerator } from './components/VideoGenerator';
import { analyzeSalesContext } from './services/geminiService';
import { fetchDocumentsFromFirebase, isFirebaseActive, getFirebasePermissionError, subscribeToAuth } from './services/firebaseService';
import { AnalysisResult, UploadedFile, MeetingContext, StoredDocument } from './types';
import { ICONS } from './constants';
import { User } from 'firebase/auth';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [history, setHistory] = useState<StoredDocument[]>([]);
  const [selectedLibraryDocIds, setSelectedLibraryDocIds] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [activeTab, setActiveTab] = useState<'context' | 'strategy' | 'search' | 'practice' | 'audio' | 'gpt' | 'video'>('context');

  const lastAnalyzedHash = useRef<string | null>(null);

  const [meetingContext, setMeetingContext] = useState<MeetingContext>({
    sellerCompany: "",
    sellerNames: "",
    clientCompany: "",
    clientNames: "",
    targetProducts: "",
    productDomain: "",
    meetingFocus: "",
    persona: "Balanced",
    thinkingLevel: "Medium",
    temperature: 1.0,
    answerStyles: [
      "Executive Summary",
      "Data-Driven Insights",
      "Concise Answer", 
      "Sales Points", 
      "Anticipated Customer Questions"
    ],
    executiveSnapshot: "",
    strategicKeywords: [],
    baseSystemPrompt: ""
  });

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const docs = await fetchDocumentsFromFirebase();
    setHistory(docs);
  }, [user]);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((u) => {
      setUser(u);
      setAuthLoading(false);
      if (!u) {
        // Reset state on logout
        setHistory([]);
        setFiles([]);
        setAnalysis(null);
        setSelectedLibraryDocIds([]);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user) {
      loadHistory();
    }
  }, [user, loadHistory]);

  const toggleLibraryDoc = (id: string) => {
    setSelectedLibraryDocIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const isAnyFileProcessing = useMemo(() => files.some(f => f.status === 'processing'), [files]);
  const readyFilesCount = useMemo(() => files.filter(f => f.status === 'ready').length, [files]);
  const readyLibraryCount = useMemo(() => selectedLibraryDocIds.length, [selectedLibraryDocIds]);

  const generateStateHash = useCallback(() => {
    const fileIds = files.map(f => `${f.name}-${f.content.length}`).join('|');
    const libIds = selectedLibraryDocIds.sort().join('|');
    const ctxString = JSON.stringify(meetingContext);
    return `${fileIds}-${libIds}-${ctxString}`;
  }, [files, selectedLibraryDocIds, meetingContext]);

  const runAnalysis = useCallback(async () => {
    const readySessionFiles = files.filter(f => f.status === 'ready');
    const selectedHistoryDocs = history.filter(doc => selectedLibraryDocIds.includes(doc.id));
    
    if (readySessionFiles.length === 0 && selectedHistoryDocs.length === 0) {
      setError("Please ensure at least one document (from library or upload) is ready for analysis.");
      return;
    }

    const currentHash = generateStateHash();
    
    if (analysis && currentHash === lastAnalyzedHash.current) {
      setActiveTab('strategy');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setStatusMessage("Synthesizing Intelligence Core...");

    try {
      const sessionContent = readySessionFiles.map(f => `FILE: ${f.name}\n${f.content}`);
      const libraryContent = selectedHistoryDocs.map(d => `LIBRARY DOC: ${d.name}\n${d.content}`);
      const combinedContent = [...sessionContent, ...libraryContent].join('\n\n');
      
      const result = await analyzeSalesContext(combinedContent, meetingContext);
      
      setAnalysis(result);
      lastAnalyzedHash.current = currentHash;
      setActiveTab('strategy');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during analysis.");
    } finally {
      setIsAnalyzing(false);
      setStatusMessage("");
    }
  }, [files, history, selectedLibraryDocIds, meetingContext, analysis, generateStateHash]);

  const reset = () => {
    setFiles([]);
    setSelectedLibraryDocIds([]);
    setAnalysis(null);
    lastAnalyzedHash.current = null;
    setError(null);
    setActiveTab('context');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="mt-6 text-[10px] font-black uppercase text-slate-400 tracking-widest animate-pulse">Establishing Secure Neural Link...</p>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const hasPermissionError = getFirebasePermissionError();

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Header user={user} />
      
      <main className="max-w-6xl mx-auto px-4 pt-28">
        {!analysis && !isAnalyzing ? (
          <div className="space-y-12 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="text-center space-y-4">
              <h1 className="text-5xl font-extrabold text-slate-900 tracking-tight">
                Cognitive Sales Strategy Hub
              </h1>
              <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
                Configure strategic parameters and leverage the cognitive library for grounded AI synthesis.
              </p>
            </div>

            <div className="bg-white rounded-[3rem] shadow-2xl p-10 border border-slate-200">
               <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <ICONS.Research /> Cognitive Library Hub
                  </h3>
                  {(!isFirebaseActive() || hasPermissionError) && (
                    <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border ${hasPermissionError ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                      {hasPermissionError ? 'Permission Interrupted' : 'Firebase Offline'}
                    </span>
                  )}
               </div>
               <DocumentGallery 
                 documents={history} 
                 onRefresh={loadHistory} 
                 selectedIds={selectedLibraryDocIds}
                 onToggleSelect={toggleLibraryDoc}
                 onSynthesize={runAnalysis}
                 isAnalyzing={isAnalyzing}
               />
            </div>

            <MeetingContextConfig context={meetingContext} onContextChange={setMeetingContext} />

            <div className="bg-white rounded-[3rem] shadow-2xl p-10 border border-slate-200">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-8">
                <ICONS.Document /> Documentary Memory Store
              </h3>
              <FileUpload files={files} onFilesChange={setFiles} onUploadSuccess={loadHistory} />
              
              <div className="mt-12 flex flex-col items-center gap-6">
                {error && (
                  <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 mb-8 max-w-xl text-center">
                    <p className="text-rose-600 font-bold mb-2">⚠️ Analysis Interrupted</p>
                    <p className="text-rose-500 text-sm">{error}</p>
                  </div>
                )}
                <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={runAnalysis}
                    disabled={(readyFilesCount === 0 && readyLibraryCount === 0) || isAnyFileProcessing}
                    className={`
                      flex items-center gap-3 px-16 py-6 rounded-full font-black text-xl shadow-2xl transition-all
                      ${((readyFilesCount > 0 || readyLibraryCount > 0) && !isAnyFileProcessing)
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95 cursor-pointer shadow-indigo-200' 
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}
                    `}
                  >
                    <ICONS.Brain />
                    {isAnyFileProcessing ? 'Retaining Documents...' : 'Synthesize Strategy Core'}
                  </button>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest italic text-center max-w-md">
                    Synthesizing {readyFilesCount + readyLibraryCount} documents for {meetingContext.clientCompany || 'prospect'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : isAnalyzing ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-8">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-indigo-600 scale-125">
                <ICONS.Brain />
              </div>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-800 animate-pulse tracking-tight">{statusMessage}</p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-4">Cross-referencing {readyFilesCount + readyLibraryCount} document nodes...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white px-8 py-4 rounded-[2.5rem] shadow-xl border border-slate-100">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
                <TabBtn active={activeTab === 'strategy'} onClick={() => setActiveTab('strategy')} icon={<ICONS.Document />} label="Brief" />
                <TabBtn active={activeTab === 'gpt'} onClick={() => setActiveTab('gpt')} icon={<ICONS.Sparkles />} label="Fast Answering" />
                <TabBtn active={activeTab === 'search'} onClick={() => setActiveTab('search')} icon={<ICONS.Search />} label="Cognitive Answering" />
                <TabBtn active={activeTab === 'video'} onClick={() => setActiveTab('video')} icon={<ICONS.Play />} label="Visuals" />
                <TabBtn active={activeTab === 'audio'} onClick={() => setActiveTab('audio')} icon={<ICONS.Speaker />} label="Audio" />
                <TabBtn active={activeTab === 'practice'} onClick={() => setActiveTab('practice')} icon={<ICONS.Chat />} label="Live" />
                <TabBtn active={activeTab === 'context'} onClick={() => setActiveTab('context')} icon={<ICONS.Efficiency />} label="Config" />
              </div>
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Strategy Retained</span>
                 </div>
                 <button onClick={reset} className="px-5 py-2.5 bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all border border-slate-200">Wipe Context</button>
              </div>
            </div>

            {activeTab === 'context' && <MeetingContextConfig context={meetingContext} onContextChange={setMeetingContext} />}
            {activeTab === 'strategy' && <AnalysisView result={analysis!} files={files} context={meetingContext} />}
            {activeTab === 'search' && <CognitiveSearch files={files} context={meetingContext} />}
            {activeTab === 'gpt' && <SalesGPT files={files} />}
            {activeTab === 'video' && <VideoGenerator clientCompany={meetingContext.clientCompany || "Client"} />}
            {activeTab === 'audio' && <AudioGenerator analysis={analysis!} />}
            {activeTab === 'practice' && <PracticeSession analysis={analysis!} />}
          </div>
        )}
      </main>
    </div>
  );
};

const TabBtn = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl font-bold transition-all whitespace-nowrap text-xs ${active ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
  >
    {icon}
    {label}
  </button>
);

export default App;
