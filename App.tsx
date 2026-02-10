
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

  // Combined list of all documents that are "active" (session uploads + selected library docs)
  const activeDocuments = useMemo(() => {
    const sessionDocs = files.filter(f => f.status === 'ready').map(f => ({ name: f.name, content: f.content }));
    const libDocs = history.filter(d => selectedLibraryDocIds.includes(d.id)).map(d => ({ name: d.name, content: d.content }));
    return [...sessionDocs, ...libDocs];
  }, [files, history, selectedLibraryDocIds]);

  const generateStateHash = useCallback(() => {
    const fileIds = files.map(f => `${f.name}-${f.content.length}`).join('|');
    const libIds = selectedLibraryDocIds.sort().join('|');
    const ctxString = JSON.stringify(meetingContext);
    return `${fileIds}-${libIds}-${ctxString}`;
  }, [files, selectedLibraryDocIds, meetingContext]);

  const runAnalysis = useCallback(async () => {
    if (activeDocuments.length === 0) {
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
      const combinedContent = activeDocuments.map(d => `DOC NAME: ${d.name}\n${d.content}`).join('\n\n');
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
  }, [activeDocuments, meetingContext, analysis, generateStateHash]);

  const reset = () => {
    if(confirm("Are you sure you want to wipe current strategy context?")) {
      setFiles([]);
      setSelectedLibraryDocIds([]);
      setAnalysis(null);
      lastAnalyzedHash.current = null;
      setError(null);
      setActiveTab('context');
    }
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
    <div className="min-h-screen bg-slate-50">
      <Header user={user} />
      
      <div className="pt-16 flex min-h-screen">
        {/* Persistent Sidebar Navigation */}
        {analysis && !isAnalyzing && (
          <aside className="w-72 bg-white border-r border-slate-200 flex flex-col fixed h-[calc(100vh-64px)] overflow-y-auto no-scrollbar z-30">
            <div className="p-6 space-y-8 flex flex-col h-full">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-2">Intelligence Nodes</p>
                <div className="flex flex-col gap-1">
                  <SidebarBtn active={activeTab === 'strategy'} onClick={() => setActiveTab('strategy')} icon={<ICONS.Document />} label="Brief" />
                  <SidebarBtn active={activeTab === 'gpt'} onClick={() => setActiveTab('gpt')} icon={<ICONS.Sparkles />} label="Fast Answering" />
                  <SidebarBtn active={activeTab === 'search'} onClick={() => setActiveTab('search')} icon={<ICONS.Search />} label="Cognitive Answering" />
                  <SidebarBtn active={activeTab === 'video'} onClick={() => setActiveTab('video')} icon={<ICONS.Play />} label="Video Synthesis" />
                  <SidebarBtn active={activeTab === 'audio'} onClick={() => setActiveTab('audio')} icon={<ICONS.Speaker />} label="Audio" />
                  <SidebarBtn active={activeTab === 'practice'} onClick={() => setActiveTab('practice')} icon={<ICONS.Chat />} label="Live Simulation" />
                  <SidebarBtn active={activeTab === 'context'} onClick={() => setActiveTab('context')} icon={<ICONS.Efficiency />} label="Config" />
                </div>
              </div>

              <div className="mt-auto pt-6 border-t border-slate-100 space-y-4">
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black uppercase text-emerald-700 tracking-widest">Strategy Sync</span>
                  </div>
                  <p className="text-[10px] font-bold text-emerald-600/80 leading-tight">
                    Context retained for {meetingContext.clientCompany || 'Prospect'}.
                  </p>
                </div>
                
                <button 
                  onClick={reset} 
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all border border-slate-200"
                >
                  <ICONS.X className="w-3 h-3" /> Wipe Context
                </button>
              </div>
            </div>
          </aside>
        )}

        <main className={`flex-1 transition-all duration-300 ${analysis && !isAnalyzing ? 'ml-72' : ''}`}>
          <div className="max-w-6xl mx-auto px-4 py-12">
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
                        disabled={activeDocuments.length === 0 || isAnyFileProcessing}
                        className={`
                          flex items-center gap-3 px-16 py-6 rounded-full font-black text-xl shadow-2xl transition-all
                          ${(activeDocuments.length > 0 && !isAnyFileProcessing)
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95 cursor-pointer shadow-indigo-200' 
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}
                        `}
                      >
                        <ICONS.Brain />
                        {isAnyFileProcessing ? 'Retaining Documents...' : 'Synthesize Strategy Core'}
                      </button>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest italic text-center max-w-md">
                        Synthesizing {activeDocuments.length} documents for {meetingContext.clientCompany || 'prospect'}
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
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-4">Cross-referencing {activeDocuments.length} document nodes...</p>
                </div>
              </div>
            ) : (
              <div className="animate-in fade-in duration-500">
                {activeTab === 'context' && (
                  <div className="space-y-12">
                    <div className="bg-white rounded-[3rem] shadow-2xl p-10 border border-slate-200">
                      <div className="flex items-center justify-between mb-8">
                          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <ICONS.Research /> Cognitive Library Management
                          </h3>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Manage grounded intelligence nodes</p>
                      </div>
                      <DocumentGallery 
                        documents={history} 
                        onRefresh={loadHistory} 
                        selectedIds={selectedLibraryDocIds}
                        onToggleSelect={toggleLibraryDoc}
                        onSynthesize={runAnalysis}
                        isAnalyzing={isAnalyzing}
                      />
                      <div className="mt-10 pt-8 border-t border-slate-100">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Ingest New Intelligence</h4>
                         <FileUpload files={files} onFilesChange={setFiles} onUploadSuccess={loadHistory} />
                      </div>
                    </div>
                    <MeetingContextConfig context={meetingContext} onContextChange={setMeetingContext} />
                    <div className="flex justify-center pb-10">
                      <button 
                        onClick={runAnalysis}
                        disabled={isAnalyzing}
                        className="px-12 py-5 bg-indigo-600 text-white rounded-full font-black text-lg shadow-2xl hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95 flex items-center gap-3"
                      >
                        <ICONS.Brain />
                        {isAnalyzing ? 'Re-Synthesizing...' : 'Update & Re-Synthesize Strategy'}
                      </button>
                    </div>
                  </div>
                )}
                {activeTab === 'strategy' && <AnalysisView result={analysis!} files={files} context={meetingContext} />}
                {activeTab === 'search' && <CognitiveSearch activeDocuments={activeDocuments} context={meetingContext} />}
                {activeTab === 'gpt' && <SalesGPT activeDocuments={activeDocuments} meetingContext={meetingContext} />}
                {activeTab === 'video' && <VideoGenerator clientCompany={meetingContext.clientCompany || "Client"} />}
                {activeTab === 'audio' && <AudioGenerator analysis={analysis!} />}
                {activeTab === 'practice' && <PracticeSession analysis={analysis!} />}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const SidebarBtn = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3.5 px-5 py-4 rounded-2xl font-bold transition-all text-sm group ${
      active 
      ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' 
      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
    }`}
  >
    <div className={`${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'} transition-colors`}>
      {icon}
    </div>
    <span className="tracking-tight">{label}</span>
  </button>
);

export default App;
