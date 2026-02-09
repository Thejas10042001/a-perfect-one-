import React, { useState, useEffect, useMemo, FC, FormEvent, useRef } from 'react';
import { ICONS } from '../constants';
import { performCognitiveSearchStream, generateDynamicSuggestions, CognitiveSearchResult } from '../services/geminiService';
import { UploadedFile, MeetingContext } from '../types';

const FormattedText: FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  return (
    <div className="space-y-6 text-slate-700 leading-relaxed text-lg font-serif">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-4" />;

        if (trimmed.startsWith('### ')) {
          const title = trimmed.replace('### ', '');
          return (
            <div key={idx} className="pt-8 pb-4 border-b-2 border-slate-100 mb-4 animate-in fade-in slide-in-from-left-4 first:pt-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-6 bg-indigo-600 rounded-full shadow-sm"></div>
                <h4 className="text-[13px] font-black uppercase tracking-[0.3em] text-slate-900 drop-shadow-sm">{title}</h4>
              </div>
            </div>
          );
        }

        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ');
        return (
          <div key={idx} className={isBullet ? "flex gap-4 pl-6 border-l-4 border-indigo-50 py-2 bg-slate-50/40 rounded-r-xl" : "py-1"}>
            {isBullet && <div className="mt-2.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-sm shrink-0"></div>}
            <div className="flex-1">
              {trimmed.split(/(\*\*.*?\*\*|\*.*?\*)/g).map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  const inner = part.slice(2, -2);
                  return <strong key={i} className="font-extrabold text-slate-900 bg-indigo-100/50 px-2 py-0.5 rounded">{inner}</strong>;
                }
                if (part.startsWith('*') && part.endsWith('*')) {
                  return <em key={i} className="italic text-indigo-800 font-semibold">{part.slice(1, -1)}</em>;
                }
                return part;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface CognitiveSearchProps {
  files: UploadedFile[];
  context: MeetingContext;
}

export const CognitiveSearch: FC<CognitiveSearchProps> = ({ files, context }) => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<CognitiveSearchResult | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isFromCache, setIsFromCache] = useState(false);

  // Deterministic cache keyed by query + content fingerprint
  const searchCache = useRef<Map<string, CognitiveSearchResult>>(new Map());

  const readyFiles = useMemo(() => files.filter(f => f.status === 'ready'), [files]);
  
  // Fingerprint for cache invalidation if context changes
  const contextFingerprint = useMemo(() => {
    return JSON.stringify({
      files: readyFiles.map(f => f.name + f.content.length),
      styles: context.answerStyles,
      persona: context.persona
    });
  }, [readyFiles, context.answerStyles, context.persona]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (readyFiles.length > 0) {
        try {
          const combinedContent = readyFiles.map(f => f.content).join('\n');
          const res = await generateDynamicSuggestions(combinedContent, context);
          setSuggestions(res);
        } catch (e) { console.error(e); }
      }
    };
    fetchSuggestions();
  }, [readyFiles, context]);

  /**
   * Optimized Partial JSON text extractor.
   */
  const extractFieldFromPartialJson = (json: string, field: string): string => {
    try {
      const fieldMarker = `"${field}": "`;
      const startIdx = json.indexOf(fieldMarker);
      if (startIdx === -1) return "";
      
      const contentStart = startIdx + fieldMarker.length;
      let content = "";
      
      for (let i = contentStart; i < json.length; i++) {
        if (json[i] === '"' && (i === 0 || json[i-1] !== '\\')) {
          break;
        }
        content += json[i];
      }
      
      return content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } catch (e) {
      return "";
    }
  };

  const robustParse = (str: string) => {
    let trimmed = str.trim();
    if (!trimmed) return null;

    const tryParse = (input: string) => {
      try {
        return JSON.parse(input);
      } catch (e: any) {
        const posMatch = e.message.match(/at position (\d+)/);
        if (posMatch) {
          const pos = parseInt(posMatch[1], 10);
          try {
            return JSON.parse(input.substring(0, pos));
          } catch (innerE) {
            return null;
          }
        }
        return null;
      }
    };

    let res = tryParse(trimmed);
    if (res) return res;

    if (trimmed.includes("```")) {
      const clean = trimmed.replace(/```(?:json)?([\s\S]*?)```/g, '$1').trim();
      res = tryParse(clean);
      if (res) return res;
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      res = tryParse(trimmed.substring(firstBrace, lastBrace + 1));
      if (res) return res;
    }

    return null;
  }

  const handleSearch = async (e?: FormEvent, customQuery?: string) => {
    e?.preventDefault();
    const activeQuery = (customQuery || query).trim().toLowerCase();
    if (!activeQuery || isSearching) return;

    const cacheKey = `${activeQuery}-${contextFingerprint}`;
    if (searchCache.current.has(cacheKey)) {
      setIsSearching(true);
      setIsFromCache(true);
      setResult(null);
      setStreamingText("");
      
      const cachedResult = searchCache.current.get(cacheKey)!;
      setTimeout(() => {
        setResult(cachedResult);
        setStreamingText(cachedResult.answer);
        setIsSearching(false);
      }, 300);
      return;
    }

    setIsSearching(true);
    setIsFromCache(false);
    setError(null);
    setResult(null);
    setStreamingText("");

    try {
      const combinedContent = readyFiles.map(f => `FILE: ${f.name}\n${f.content}`).join('\n\n');
      const stream = performCognitiveSearchStream(activeQuery, combinedContent, context);
      
      let fullBuffer = "";
      for await (const chunk of stream) {
        fullBuffer += chunk;
        
        const partialAnswer = extractFieldFromPartialJson(fullBuffer, "answer");
        const partialSoundbite = extractFieldFromPartialJson(fullBuffer, "articularSoundbite");
        const partialBrief = extractFieldFromPartialJson(fullBuffer, "briefExplanation");
        
        if (partialAnswer || partialSoundbite || partialBrief) {
          setStreamingText(partialAnswer);
          setResult(prev => ({
            ...(prev || {}),
            answer: partialAnswer,
            articularSoundbite: partialSoundbite || (prev?.articularSoundbite || ""),
            briefExplanation: partialBrief || (prev?.briefExplanation || ""),
            psychologicalProjection: prev?.psychologicalProjection || { 
              buyerFear: extractFieldFromPartialJson(fullBuffer, "buyerFear") || "...", 
              buyerIncentive: extractFieldFromPartialJson(fullBuffer, "buyerIncentive") || "...", 
              strategicLever: extractFieldFromPartialJson(fullBuffer, "strategicLever") || "..." 
            },
            citations: prev?.citations || [],
            reasoningChain: prev?.reasoningChain || { painPoint: "...", capability: "...", strategicValue: "..." }
          } as CognitiveSearchResult));
        }
      }
      
      const finalResult = robustParse(fullBuffer);
      if (finalResult) {
        setResult(finalResult);
        setStreamingText(finalResult.answer);
        searchCache.current.set(cacheKey, finalResult);
      }
      
    } catch (err: any) {
      setError(err.message || "Cognitive Engine encountered a reasoning stall.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100"><ICONS.Search className="w-5 h-5" /></div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Cognitive Answering Hub</h2>
              <p className="text-xs text-slate-500 font-medium">Verified intelligence from <strong className="text-indigo-600">Pro Reasoning Core</strong></p>
            </div>
          </div>
          <div className="flex flex-col items-end">
             <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-[9px] font-black text-indigo-600 uppercase tracking-widest">
                <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse"></div>
                Intelligence Active
             </div>
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative group">
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Ask about ${context.persona} drivers, gaps, or ROI targets...`}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.8rem] px-8 py-6 text-lg focus:border-indigo-500 focus:bg-white outline-none transition-all pr-40 font-medium shadow-inner"
          />
          <button 
            type="submit"
            disabled={isSearching || !query.trim()}
            className="absolute right-3 top-3 bottom-3 px-10 rounded-[1.4rem] bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl flex items-center gap-2"
          >
            {isSearching ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Thinking
              </>
            ) : 'Analyze'}
          </button>
        </form>
      </div>

      {(result || isSearching) && (
        <div className="space-y-10 animate-in slide-in-from-top-6 duration-700">
          
          <div className="bg-indigo-950 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden group border border-indigo-900">
             <div className="absolute -top-10 -right-10 p-12 opacity-5 rotate-12 transition-transform group-hover:rotate-0 duration-1000"><ICONS.Brain className="w-56 h-56 text-white" /></div>
             <div className="relative z-10 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                       <div className={`w-2 h-5 bg-indigo-500 rounded-full ${isSearching ? 'animate-pulse' : ''}`}></div>
                       <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Executive Verbatim Hook</h4>
                    </div>
                    <p className="text-3xl md:text-4xl font-black text-white leading-tight italic tracking-tight drop-shadow-lg">
                       {result?.articularSoundbite ? `“${result.articularSoundbite}”` : isSearching ? "Synthesizing Core Strategy..." : ""}
                    </p>
                  </div>
                  {isFromCache && !isSearching && (
                    <div className="px-4 py-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-2 shrink-0">
                       <ICONS.Shield className="w-2.5 h-2.5" /> Deterministic
                    </div>
                  )}
                </div>
                
                <div className="pt-6 border-t border-white/10">
                  <h5 className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-3">Strategic Context</h5>
                  <div className="text-indigo-100/90 text-lg font-medium leading-relaxed max-w-4xl italic border-l-4 border-indigo-500/30 pl-6">
                     {result?.briefExplanation || (isSearching ? "Calculating complex non-obvious strategic links..." : "")}
                  </div>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ProjectionCard label="What Drives Them" content={result?.psychologicalProjection?.buyerIncentive || "..."} color="emerald" icon={<ICONS.Growth />} isSearching={isSearching} />
            <ProjectionCard label="What Stops Them" content={result?.psychologicalProjection?.buyerFear || "..."} color="rose" icon={<ICONS.Security />} isSearching={isSearching} />
            <ProjectionCard label="Our Winning Angle" content={result?.psychologicalProjection?.strategicLever || "..."} color="indigo" icon={<ICONS.Trophy />} isSearching={isSearching} />
          </div>

          <div className="bg-white rounded-[3.5rem] p-12 md:p-20 shadow-2xl border border-slate-200 relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-16 border-b border-slate-100 pb-12">
               <div className="flex items-center gap-5">
                  <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-200 rotate-2 transition-transform hover:rotate-0"><ICONS.Brain className="w-6 h-6" /></div>
                  <div>
                    <h3 className="text-[14px] font-black uppercase tracking-[0.3em] text-slate-900">Intelligence Synthesis</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 flex items-center gap-2">
                       <span className="w-1 h-1 rounded-full bg-indigo-500 animate-ping"></span>
                       Persona: {context.persona} Psychology
                    </p>
                  </div>
               </div>
               
               <div className="flex flex-wrap gap-2 justify-end max-w-lg">
                  {context.answerStyles.map((style, i) => (
                    <span key={i} className="px-4 py-2 bg-indigo-50/50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-indigo-100/60 shadow-sm">
                      {style}
                    </span>
                  ))}
               </div>
            </div>
            
            <FormattedText text={streamingText || result?.answer || (isSearching ? "Synthesizing exhaustive reasoning..." : "")} />

            {result?.citations && result.citations.length > 0 && (
              <div className="mt-24 pt-16 border-t border-slate-100 space-y-12">
                 <div className="flex items-center justify-between">
                   <h5 className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <ICONS.Shield className="w-4 h-4 text-indigo-500" /> Verified Evidence
                   </h5>
                   <div className="px-4 py-1.5 bg-slate-100 rounded-full text-[9px] font-black text-slate-500 tracking-widest uppercase">
                     {result.citations.length} Document Links
                   </div>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {result.citations.map((cit, i) => (
                     <div key={i} className="p-8 bg-slate-50/50 border border-slate-100 rounded-[2rem] group hover:bg-white hover:border-indigo-300 hover:shadow-2xl transition-all duration-500">
                        <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <ICONS.Document className="w-3.5 h-3.5" /> {cit.source || 'Intelligence Store'}
                        </p>
                        <p className="text-md text-slate-600 leading-relaxed font-serif italic relative">
                           {cit.snippet}
                        </p>
                     </div>
                   ))}
                 </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!result && !isSearching && suggestions.length > 0 && (
        <div className="space-y-8 py-6">
          <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 text-center">Reasoning Suggestions</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {suggestions.map((text, i) => (
              <button key={i} onClick={() => {setQuery(text); handleSearch(undefined, text);}} className="p-10 bg-white border border-slate-100 rounded-[2.5rem] text-left hover:border-indigo-500 hover:shadow-2xl transition-all shadow-xl group border-b-4 border-b-indigo-50 hover:border-b-indigo-600 active:scale-95 duration-300">
                <p className="text-indigo-400 text-[9px] font-black uppercase tracking-widest mb-4 group-hover:translate-x-1 transition-transform">Suggested Node {i + 1}</p>
                <p className="text-lg font-bold text-slate-800 leading-tight">“{text}”</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ProjectionCard: FC<{ label: string; content: string; color: string; icon: React.ReactNode, isSearching?: boolean }> = ({ label, content, color, icon, isSearching }) => (
  <div className={`p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-xl border-t-4 border-t-${color}-500 hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden`}>
    {isSearching && <div className="absolute top-0 left-0 w-full h-1 bg-slate-100 overflow-hidden"><div className={`h-full bg-${color}-500 animate-[progress_1.5s_infinite] w-full origin-left`}></div></div>}
    <div className="flex items-center gap-4 mb-6">
       <div className={`p-4 bg-${color}-50 text-${color}-600 rounded-2xl group-hover:scale-105 transition-transform shadow-sm`}>{icon}</div>
       <h4 className={`text-[11px] font-black uppercase tracking-[0.2em] text-${color}-600`}>{label}</h4>
    </div>
    <p className="text-xl font-bold text-slate-800 leading-relaxed italic tracking-tight relative z-10">
      {content === "..." ? (
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce"></span>
          <span className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce [animation-delay:0.2s] font-serif"></span>
          <span className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce [animation-delay:0.4s]"></span>
        </span>
      ) : `“${content}”`}
    </p>
  </div>
);
