
import React, { useState, useRef, useCallback } from 'react';
import { AnalysisResult, CustomerPersonaType } from '../types';
import { ICONS } from '../constants';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';

interface PracticeSessionProps {
  analysis: AnalysisResult;
}

const PERSONA_OPTIONS: { type: CustomerPersonaType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: 'Balanced', label: 'Balanced', icon: <ICONS.Document />, desc: 'Standard business profile, focused on utility.' },
  { type: 'Technical', label: 'Technical', icon: <ICONS.Brain />, desc: 'Focused on specs, architecture, and security.' },
  { type: 'Financial', label: 'Financial', icon: <ICONS.ROI />, desc: 'Hyper-focused on ROI, TCO, and budgets.' },
  { type: 'Business Executives', label: 'Executives', icon: <ICONS.Trophy />, desc: 'Focused on strategy, growth, and vision.' },
];

export const PracticeSession: React.FC<PracticeSessionProps> = ({ analysis }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [selectedPersona, setSelectedPersona] = useState<CustomerPersonaType>('Balanced');
  const [transcription, setTranscription] = useState<{ user: string; ai: string }[]>([]);
  const [currentTranscription, setCurrentTranscription] = useState({ user: '', ai: '' });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Using refs for transcriptions to avoid stale closures in callbacks
  const userTranscriptionRef = useRef('');
  const aiTranscriptionRef = useRef('');

  const encode = (bytes: Uint8Array) => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const stopPractice = useCallback(() => {
    setIsActive(false);
    setStatus('idle');
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    sourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    userTranscriptionRef.current = '';
    aiTranscriptionRef.current = '';
  }, []);

  const startPractice = async () => {
    setStatus('connecting');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;

      const personaDirectives = {
        'Technical': "Focus heavily on architecture, integration complexity, APIs, and technical reliability. Be skeptical of high-level marketing fluff.",
        'Financial': "Focus primarily on ROI, total cost of ownership, and budget cycles. Constantly ask for price-value justification and payback periods.",
        'Business Executives': "Focus on strategic impact, market positioning, and operational efficiency. You care about the 'big picture' and how this helps your organization beat competitors.",
        'Balanced': "Maintain a mix of technical feasibility, business value, and overall organizational fit."
      }[selectedPersona];

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('active');
            setIsActive(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const buffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              source.onended = () => sourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              userTranscriptionRef.current += text;
              setCurrentTranscription(prev => ({ ...prev, user: userTranscriptionRef.current }));
            } else if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              aiTranscriptionRef.current += text;
              setCurrentTranscription(prev => ({ ...prev, ai: aiTranscriptionRef.current }));
            }
            
            if (message.serverContent?.turnComplete) {
              const finalUserText = userTranscriptionRef.current;
              const finalAiText = aiTranscriptionRef.current;
              setTranscription(prev => [...prev, { user: finalUserText, ai: finalAiText }]);
              userTranscriptionRef.current = '';
              aiTranscriptionRef.current = '';
              setCurrentTranscription({ user: '', ai: '' });
            }

            if (message.serverContent?.interrupted) {
              for (const source of sourcesRef.current.values()) {
                try { source.stop(); } catch(e) {}
              }
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error("Live session error:", e);
            setStatus('error');
            stopPractice();
          },
          onclose: () => stopPractice(),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
          systemInstruction: `You are simulating a practice sales session. ACT AS THE BUYER defined in the following profile:
          SPECIFIC PERSONA ARCHETYPE: ${selectedPersona}
          PERSONA DIRECTIVES: ${personaDirectives}
          
          ROLE: ${analysis.snapshot.role}
          DECISION STYLE: ${analysis.snapshot.decisionStyle}
          RISK TOLERANCE: ${analysis.snapshot.riskTolerance}
          TONE: ${analysis.snapshot.tone}
          PRIORITIES: ${analysis.snapshot.priorities.map(p => p.text).join(', ')}
          
          Guidelines:
          1. React naturally to the salesperson. 
          2. Use objections like: ${analysis.objectionHandling.map(o => o.objection).join(', ')}.
          3. Challenge their points based on your specific ARCHETYPE's fears and priorities.
          4. If you are 'Financial', be very tough on pricing. If 'Technical', be very tough on APIs and security.
          5. Keep responses brief and human-like.`
        },
      });
      sessionRef.current = await sessionPromise;
    } catch (e) {
      console.error("Connection failed:", e);
      setStatus('error');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-xl overflow-hidden relative min-h-[600px] flex flex-col">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-600 text-white rounded-2xl shadow-lg"><ICONS.Chat /></div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Live Practice Simulation</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Real-time Conversational Roleplay</p>
          </div>
        </div>
        {isActive && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-full">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Simulation Running</span>
            </div>
            <button onClick={stopPractice} className="px-6 py-2 bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-rose-700 transition-all">End Session</button>
          </div>
        )}
      </div>

      {!isActive ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-12 max-w-4xl mx-auto py-10">
          <div className="space-y-4">
            <div className="w-20 h-20 bg-indigo-50 rounded-[2rem] flex items-center justify-center text-indigo-600 mx-auto mb-6"><ICONS.Brain /></div>
            <h4 className="text-3xl font-black text-slate-800 tracking-tight">Challenge the {analysis.snapshot.role}</h4>
            <p className="text-slate-500 leading-relaxed max-w-xl mx-auto">Prepare for the meeting by emulating a specific psychological archetype grounded in your document analysis.</p>
          </div>

          <div className="w-full space-y-6">
             <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Select Emulation Archetype</p>
             <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
               {PERSONA_OPTIONS.map((option) => (
                 <button
                   key={option.type}
                   onClick={() => setSelectedPersona(option.type)}
                   className={`p-6 rounded-[2rem] border-2 text-left transition-all relative group flex flex-col h-full ${selectedPersona === option.type ? 'bg-indigo-600 border-indigo-600 shadow-2xl scale-[1.02]' : 'bg-slate-50 border-slate-100 hover:border-indigo-300'}`}
                 >
                   <div className={`p-3 rounded-xl mb-4 inline-block w-fit ${selectedPersona === option.type ? 'bg-white/20 text-white' : 'bg-white text-indigo-500 shadow-sm'}`}>
                      {option.icon}
                   </div>
                   <h5 className={`font-black text-xs uppercase tracking-widest mb-2 ${selectedPersona === option.type ? 'text-white' : 'text-slate-800'}`}>{option.label}</h5>
                   <p className={`text-[10px] leading-snug font-medium ${selectedPersona === option.type ? 'text-indigo-100' : 'text-slate-500'}`}>{option.desc}</p>
                 </button>
               ))}
             </div>
          </div>

          <div className="space-y-4">
             <button onClick={startPractice} disabled={status === 'connecting'} className="inline-flex items-center gap-4 px-16 py-6 bg-indigo-600 text-white rounded-full font-black text-xl shadow-2xl hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all">
                {status === 'connecting' ? 'Calibrating Neural Buyer...' : <><ICONS.Play className="w-6 h-6" /> Initiate Practice Session</>}
             </button>
             {status === 'error' && <p className="text-rose-500 text-sm font-bold animate-pulse">Connection failed. Check your API key and microphone permissions.</p>}
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-hidden">
          <div className="lg:col-span-2 bg-slate-900 rounded-[2.5rem] p-10 flex flex-col items-center justify-center relative shadow-inner overflow-hidden border border-slate-800">
            {/* Ambient Background Glow based on Persona */}
            <div className={`absolute inset-0 opacity-10 blur-[100px] transition-colors duration-1000 ${selectedPersona === 'Technical' ? 'bg-blue-500' : selectedPersona === 'Financial' ? 'bg-emerald-500' : selectedPersona === 'Business Executives' ? 'bg-amber-500' : 'bg-indigo-500'}`}></div>
            
            <div className="relative w-64 h-64 mb-10 flex items-center justify-center">
               <div className="absolute inset-0 bg-white/5 rounded-full animate-pulse scale-125"></div>
               <div className="absolute inset-0 bg-white/5 rounded-full animate-pulse delay-700"></div>
               <div className="w-32 h-32 bg-indigo-600 rounded-full flex items-center justify-center text-white scale-150 shadow-2xl shadow-indigo-500/50 z-10 border-4 border-slate-900"><ICONS.Brain /></div>
            </div>
            
            <div className="text-center space-y-4 relative z-10">
               <div>
                 <span className="px-3 py-1 bg-white/10 text-white/60 text-[8px] font-black uppercase tracking-widest rounded-lg border border-white/5 mb-3 inline-block">Archetype: {selectedPersona}</span>
                 <h5 className="text-white text-3xl font-black tracking-tight">{analysis.snapshot.role}</h5>
               </div>
               <p className="text-indigo-300 text-sm italic font-medium">"I'm listening. Make it relevant to my priorities."</p>
            </div>

            <div className="absolute bottom-8 inset-x-8 h-24 overflow-y-auto no-scrollbar flex flex-col justify-end pointer-events-none">
              {currentTranscription.user && <div className="text-right mb-2"><span className="inline-block px-4 py-2 bg-indigo-600/20 text-indigo-100 text-xs italic rounded-2xl border border-indigo-500/30">You: {currentTranscription.user}</span></div>}
              {currentTranscription.ai && <div className="text-left"><span className="inline-block px-4 py-2 bg-white/10 text-white text-xs font-bold rounded-2xl border border-white/10">AI: {currentTranscription.ai}</span></div>}
            </div>
          </div>
          <div className="bg-slate-50 rounded-[2.5rem] p-8 flex flex-col border border-slate-100 overflow-hidden shadow-inner">
            <div className="flex items-center justify-between mb-6">
              <h6 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Interaction Log</h6>
              <span className="text-[9px] font-bold text-slate-300 uppercase">{transcription.length} Turns</span>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar">
              {transcription.length === 0 && <p className="text-[10px] text-slate-300 italic text-center py-20">The floor is yours. Start speaking...</p>}
              {transcription.map((turn, i) => (
                <div key={i} className="space-y-2 animate-in slide-in-from-bottom-2">
                  <div className="flex flex-col items-end">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Architect</p>
                    <p className="text-xs text-slate-700 bg-white p-4 rounded-2xl rounded-tr-none border border-slate-100 shadow-sm w-full leading-relaxed italic">"{turn.user}"</p>
                  </div>
                  <div className="flex flex-col items-start">
                    <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-1">Buyer ({selectedPersona})</p>
                    <p className="text-xs text-indigo-900 bg-indigo-50/50 p-4 rounded-2xl rounded-tl-none border border-indigo-100 font-bold leading-relaxed">"{turn.ai}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
};
