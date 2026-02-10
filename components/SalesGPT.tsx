
import React, { useState, useRef, useEffect, FC } from 'react';
import { ICONS } from '../constants';
import { streamSalesGPT, generatePineappleImage, streamDeepStudy, performCognitiveSearchStream } from '../services/geminiService';
import { GPTMessage, GPTToolMode, MeetingContext } from '../types';

interface SalesGPTProps {
  activeDocuments: { name: string; content: string }[];
  meetingContext: MeetingContext;
}

export const SalesGPT: FC<SalesGPTProps> = ({ activeDocuments, meetingContext }) => {
  const [messages, setMessages] = useState<GPTMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<GPTToolMode>('standard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const currentHistory = [...messages];
    const userMessage: GPTMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      mode: mode,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsProcessing(true);

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: GPTMessage = {
      id: assistantId,
      role: 'assistant',
      content: mode === 'pineapple' ? "Neural Creative Engine Primed. Synthesizing visual strategic asset..." : mode === 'deep-study' ? "Initiating Deep Study sequence. Engaging full documentary context and high-fidelity reasoning budget..." : mode === 'cognitive' ? "Engaging Cognitive Search Core. Synthesizing deep grounded insights..." : "",
      mode: mode,
      isStreaming: mode !== 'pineapple'
    };

    setMessages(prev => [...prev, assistantMessage]);

    // Construct Grounding Context
    const docContext = activeDocuments.map(d => `FILE [${d.name}]:\n${d.content}`).join('\n\n');
    let contextStr = docContext;
    
    if (includeContext) {
      const meetingDetails = `
--- STRATEGIC MEETING CONTEXT ---
Seller: ${meetingContext.sellerCompany} (${meetingContext.sellerNames})
Prospect: ${meetingContext.clientCompany} (${meetingContext.clientNames})
Product: ${meetingContext.targetProducts} (${meetingContext.productDomain})
Meeting Focus: ${meetingContext.meetingFocus}
Persona Target: ${meetingContext.persona}
Strategic Keywords: ${meetingContext.strategicKeywords.join(', ')}
Executive Snapshot: ${meetingContext.executiveSnapshot}
---------------------------------
`;
      contextStr = meetingDetails + docContext;
    }

    try {
      if (mode === 'pineapple') {
        const imageUrl = await generatePineappleImage(input);
        setMessages(prev => prev.map(m => 
          m.id === assistantId ? { ...m, content: imageUrl ? "Your strategic visual asset has been synthesized and grounded in neural logic:" : "Strategic visualization engine encountered a rendering stall.", imageUrl: imageUrl || undefined, isStreaming: false } : m
        ));
      } else if (mode === 'deep-study') {
        const stream = streamDeepStudy(input, currentHistory, contextStr);
        let fullText = "";
        for await (const chunk of stream) {
          fullText += chunk;
          setMessages(prev => prev.map(m => 
            m.id === assistantId ? { ...m, content: fullText } : m
          ));
        }
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, isStreaming: false } : m));
      } else if (mode === 'cognitive') {
        const stream = performCognitiveSearchStream(input, docContext, meetingContext);
        let fullBuffer = "";
        for await (const chunk of stream) {
          fullBuffer += chunk;
          // Cognitive mode outputs JSON; extract the main answer for the chat bubble
          const partialAnswer = extractFieldFromPartialJson(fullBuffer, "answer");
          const partialShot = extractFieldFromPartialJson(fullBuffer, "cognitiveShot");
          
          if (partialAnswer || partialShot) {
            let displayContent = "";
            if (partialShot) displayContent += `**Strategic Shot:** ${partialShot}\n\n`;
            displayContent += partialAnswer;
            
            setMessages(prev => prev.map(m => 
              m.id === assistantId ? { ...m, content: displayContent } : m
            ));
          }
        }
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, isStreaming: false } : m));
      } else {
        const stream = streamSalesGPT(input, currentHistory, contextStr);
        let fullText = "";
        for await (const chunk of stream) {
          fullText += chunk;
          setMessages(prev => prev.map(m => 
            m.id === assistantId ? { ...m, content: fullText } : m
          ));
        }
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, isStreaming: false } : m));
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => prev.map(m => 
        m.id === assistantId ? { ...m, content: "Neural link severed. Please try again.", isStreaming: false } : m
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `StrategicAsset-${filename.replace(/\s+/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[3rem] shadow-2xl h-[800px] flex flex-col overflow-hidden relative">
      {/* GPT Header */}
      <div className="p-8 border-b border-slate-100 flex flex-col gap-4 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg animate-pulse">
              <ICONS.Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Intelligence Studio <span className="text-indigo-600 text-[10px] font-black uppercase ml-2 tracking-widest bg-indigo-50 px-2 py-1 rounded-lg">Multi-Model</span></h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Grounded Sales Synthesis Core</p>
            </div>
          </div>
          <div className="flex gap-3">
             <button onClick={clearChat} className="px-4 py-2 bg-white text-slate-400 hover:text-rose-500 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
               Clear Memory
             </button>
             <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 text-[10px] font-black uppercase tracking-widest">
                Online
             </div>
          </div>
        </div>

        {/* Grounding HUD */}
        <div className="flex items-center gap-4 py-2 px-4 bg-white/50 border border-slate-100 rounded-2xl">
           <div className="flex items-center gap-2 text-indigo-600 shrink-0">
              <ICONS.Shield className="w-4 h-4" />
              <span className="text-[9px] font-black uppercase tracking-widest">Document Memory</span>
           </div>
           <div className="h-4 w-px bg-slate-200 shrink-0"></div>
           <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 flex-1">
              {activeDocuments.length > 0 ? activeDocuments.map((doc, i) => (
                <div key={i} className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase tracking-widest rounded-lg border border-indigo-100 whitespace-nowrap">
                   {doc.name}
                </div>
              )) : (
                <span className="text-[8px] font-bold text-slate-300 uppercase italic">No documents currently uploaded to memory.</span>
              )}
           </div>
           <div className="h-4 w-px bg-slate-200 shrink-0"></div>
           <button 
             onClick={() => setIncludeContext(!includeContext)}
             className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${includeContext ? 'bg-indigo-600 text-white border-indigo-700 shadow-lg' : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-300'}`}
             title="Synchronize meeting context for more relevant answers"
           >
             <div className={`w-2 h-2 rounded-full ${includeContext ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`}></div>
             <span className="text-[9px] font-black uppercase tracking-widest">Context Sync</span>
           </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-10 space-y-8 no-scrollbar bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed opacity-95">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
            <div className="p-10 bg-indigo-50 rounded-[3rem] text-indigo-200">
               <ICONS.Brain className="w-20 h-20" />
            </div>
            <div className="max-w-md">
              <h4 className="text-2xl font-black text-slate-800">Ready for Interaction</h4>
              <p className="text-slate-500 mt-2 font-medium">
                Select a processing mode below and ask me anything about your active documents or the {meetingContext.clientCompany || 'prospect'}'s strategic landscape.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
               <StarterCard label="Strategic Wedge" onClick={() => setInput("Based on the docs, what is our best competitive wedge?")} />
               <StarterCard label="Technical Audit" onClick={() => setInput("Identify all technical requirements mentioned in these files.")} />
            </div>
          </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-300`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-[2rem] rounded-tr-none' : msg.mode === 'deep-study' ? 'bg-slate-50 border-2 border-amber-200/50 shadow-2xl rounded-[2.5rem] rounded-tl-none text-slate-800' : msg.mode === 'cognitive' ? 'bg-white border-2 border-indigo-200 shadow-2xl rounded-[2rem] rounded-tl-none text-slate-800' : 'bg-white border border-slate-100 shadow-xl rounded-[2rem] rounded-tl-none text-slate-800'} p-8 relative group`}>
              <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-3">
                   <span className={`text-[9px] font-black uppercase tracking-widest ${msg.role === 'user' ? 'text-indigo-400' : 'text-indigo-600'}`}>
                      {msg.role === 'user' ? 'Architect' : msg.mode === 'deep-study' ? 'Research Core' : msg.mode === 'cognitive' ? 'Cognitive Reasoning Core' : 'Fast Pulse Core'}
                   </span>
                   {msg.mode === 'deep-study' && msg.role === 'assistant' && (
                     <span className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-[8px] font-black uppercase tracking-widest border border-amber-200">
                       <ICONS.Research className="w-2.5 h-2.5" /> High-Fidelity Study
                     </span>
                   )}
                   {msg.mode === 'cognitive' && msg.role === 'assistant' && (
                     <span className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-[8px] font-black uppercase tracking-widest border border-indigo-200">
                       <ICONS.Search className="w-2.5 h-2.5" /> Pro Logic
                     </span>
                   )}
                 </div>
                 {msg.mode === 'pineapple' && (
                   <span className="px-2 py-0.5 bg-emerald-50 text-emerald-500 rounded-md text-[8px] font-black uppercase tracking-widest border border-emerald-100">
                     Visual Asset
                   </span>
                 )}
              </div>
              
              <div className={`text-sm font-medium leading-relaxed whitespace-pre-wrap markdown-content ${msg.mode === 'deep-study' || msg.mode === 'cognitive' ? 'font-serif text-slate-700' : ''}`}>
                {msg.content}
              </div>

              {msg.imageUrl && (
                <div className="mt-6 rounded-3xl overflow-hidden border-4 border-slate-50 shadow-2xl relative group/img">
                  <img src={msg.imageUrl} alt="Generated asset" className="w-full h-auto object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                     <button 
                       onClick={() => downloadImage(msg.imageUrl!, messages.find(m => messages.indexOf(m) === messages.indexOf(msg) - 1)?.content || 'Asset')}
                       className="px-6 py-3 bg-white text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-2xl hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2"
                     >
                       <ICONS.Efficiency className="w-4 h-4" /> Download Strategic Asset
                     </button>
                  </div>
                </div>
              )}

              {msg.isStreaming && (
                <div className="mt-6 flex flex-col gap-3">
                   <div className="flex items-center gap-3">
                      <div className={`flex gap-1 ${msg.mode === 'deep-study' ? 'text-amber-500' : msg.mode === 'cognitive' ? 'text-indigo-600' : 'text-indigo-500'}`}>
                         <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div>
                         <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.2s]"></div>
                         <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.4s]"></div>
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${msg.mode === 'deep-study' ? 'text-amber-600' : msg.mode === 'cognitive' ? 'text-indigo-600' : 'text-slate-400'}`}>
                         {msg.mode === 'deep-study' ? 'Synthesizing Layers...' : msg.mode === 'cognitive' ? 'Performing Cognitive Search...' : 'Streaming Intelligence...'}
                      </span>
                   </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-10 bg-slate-50/50 border-t border-slate-100">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Tool HUD */}
          <div className="flex flex-wrap gap-4">
             <ToolToggle 
               active={mode === 'standard'} 
               onClick={() => setMode('standard')} 
               icon={<ICONS.Chat className="w-4 h-4" />} 
               label="Fast Pulse" 
             />
             <ToolToggle 
               active={mode === 'cognitive'} 
               onClick={() => setMode('cognitive')} 
               icon={<ICONS.Search className="w-4 h-4" />} 
               label="Cognitive Pulse" 
             />
             <ToolToggle 
               active={mode === 'deep-study'} 
               onClick={() => setMode('deep-study')} 
               icon={<ICONS.Research className="w-4 h-4" />} 
               label="Deep Study" 
               color="amber"
             />
             <ToolToggle 
               active={mode === 'pineapple'} 
               onClick={() => setMode('pineapple')} 
               icon={<ICONS.Pineapple className="w-4 h-4" />} 
               label="Visual Logic" 
               color="emerald"
             />
          </div>

          <div className={`relative group transition-all duration-500 ${mode === 'pineapple' ? 'ring-4 ring-emerald-500/20 rounded-[2.8rem]' : mode === 'deep-study' ? 'ring-4 ring-amber-500/20 rounded-[2.8rem]' : mode === 'cognitive' ? 'ring-4 ring-indigo-500/20 rounded-[2.8rem]' : ''}`}>
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={mode === 'pineapple' ? "Describe the strategic visual or presentation asset..." : mode === 'deep-study' ? "Target a specific domain for exhaustive multi-layer analysis..." : mode === 'cognitive' ? "Ask a grounded question for high-precision extraction..." : "Inquire for fast sales intelligence pulse..."}
              className={`w-full bg-white border-2 rounded-[2.5rem] px-10 py-6 text-lg outline-none transition-all pr-32 font-medium shadow-2xl ${mode === 'pineapple' ? 'border-emerald-500/30 focus:border-emerald-500' : mode === 'deep-study' ? 'border-amber-500/30 focus:border-amber-500' : mode === 'cognitive' ? 'border-indigo-500/30 focus:border-indigo-500' : 'border-slate-200 focus:border-indigo-500'}`}
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              className={`absolute right-4 top-4 bottom-4 px-10 rounded-[2rem] font-black uppercase tracking-widest text-[11px] shadow-xl flex items-center gap-2 transition-all active:scale-95 ${isProcessing ? 'bg-slate-200 text-slate-400' : mode === 'pineapple' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : mode === 'deep-study' ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-amber-200/50' : mode === 'cognitive' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <ICONS.Play className="w-4 h-4" />
              )}
              {isProcessing ? 'Thinking' : mode === 'pineapple' ? 'Render' : mode === 'deep-study' ? 'Study' : mode === 'cognitive' ? 'Grounded' : 'Execute'}
            </button>
          </div>
          
          <div className="flex items-center justify-center gap-6">
             <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
               {mode === 'deep-study' ? 'Advanced Reasoning Core Active • Intensive Logic Applied' : mode === 'cognitive' ? 'Pro Reasoning Core • Strictly Grounded Analysis' : 'Fast Answering Mode • Active Conversation History'}
             </p>
             {includeContext && (
               <div className="flex items-center gap-2">
                 <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div>
                 <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">Meeting Context Linked</span>
               </div>
             )}
          </div>
        </div>
      </div>
      <style>{`
        .markdown-content strong { font-weight: 800; color: #1e1b4b; }
        .markdown-content code { background: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
        .markdown-content ul { list-style-type: disc; margin-left: 20px; margin-top: 10px; }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 { font-weight: 900; margin-top: 20px; text-transform: uppercase; letter-spacing: 0.1em; color: #1e1b4b; font-size: 0.9rem; }
      `}</style>
    </div>
  );
};

const ToolToggle = ({ active, onClick, icon, label, color = 'indigo' }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; color?: string }) => {
  const activeClasses = {
    indigo: 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-100',
    emerald: 'bg-emerald-600 border-emerald-600 text-white shadow-emerald-100',
    amber: 'bg-amber-600 border-amber-600 text-white shadow-amber-100',
  }[color];

  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl border-2 transition-all font-black uppercase tracking-widest text-[9px] shadow-xl ${active ? activeClasses : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'}`}
    >
      {icon}
      {label}
    </button>
  );
};

const StarterCard = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button 
    onClick={onClick}
    className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm text-left hover:border-indigo-400 hover:shadow-lg transition-all active:scale-95 group"
  >
    <div className="flex items-center justify-between">
      <span className="text-xs font-black text-slate-800 tracking-tight">{label}</span>
      <ICONS.Sparkles className="w-3 h-3 text-indigo-300 group-hover:text-indigo-600 transition-colors" />
    </div>
  </button>
);
