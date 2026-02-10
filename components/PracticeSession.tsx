
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AnalysisResult, CustomerPersonaType, GroomingEvaluation } from '../types';
import { ICONS } from '../constants';
import { GoogleGenAI, Modality, LiveServerMessage, Type } from '@google/genai';
import { generatePitchAudio, decodeAudioData } from '../services/geminiService';

interface PracticeSessionProps {
  analysis: AnalysisResult;
}

type SessionMode = 'roleplay' | 'grooming';

const PERSONA_OPTIONS: { type: CustomerPersonaType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: 'Balanced', label: 'Balanced', icon: <ICONS.Document />, desc: 'Standard business profile, focused on utility.' },
  { type: 'Technical', label: 'Technical', icon: <ICONS.Brain />, desc: 'Focused on specs, architecture, and security.' },
  { type: 'Financial', label: 'Financial', icon: <ICONS.ROI />, desc: 'Hyper-focused on ROI, TCO, and budgets.' },
  { type: 'Business Executives', label: 'Executives', icon: <ICONS.Trophy />, desc: 'Focused on strategy, growth, and vision.' },
];

export const PracticeSession: React.FC<PracticeSessionProps> = ({ analysis }) => {
  const [sessionMode, setSessionMode] = useState<SessionMode>('roleplay');
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error' | 'analyzing'>('idle');
  const [selectedPersona, setSelectedPersona] = useState<CustomerPersonaType>('Balanced');
  const [transcription, setTranscription] = useState<{ user: string; ai: string }[]>([]);
  const [currentTranscription, setCurrentTranscription] = useState({ user: '', ai: '' });
  
  // Grooming specific state
  const [groomingTarget, setGroomingTarget] = useState(analysis.objectionHandling[0]?.objection || "How do you define value?");
  const [evaluation, setEvaluation] = useState<GroomingEvaluation | null>(null);
  const [isPlayingIdeal, setIsPlayingIdeal] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const idealSourceRef = useRef<AudioBufferSourceNode | null>(null);

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

  const stopPractice = useCallback(() => {
    setIsActive(false);
    if (status !== 'analyzing') setStatus('idle');
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
  }, [status]);

  const startGroomingSession = async () => {
    setEvaluation(null);
    userTranscriptionRef.current = '';
    aiTranscriptionRef.current = '';
    setTranscription([]);
    await startPractice();
  };

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
        'Technical': "Focus heavily on architecture and security.",
        'Financial': "Focus primarily on ROI and TCO.",
        'Business Executives': "Focus on strategy and growth.",
        'Balanced': "Maintain a mix of technical and business value."
      }[selectedPersona];

      const systemInstruction = sessionMode === 'roleplay' 
        ? `Act as the buyer: ${analysis.snapshot.role}. Persona: ${selectedPersona}. ${personaDirectives}. Objection context: ${analysis.objectionHandling.map(o => o.objection).join(', ')}.`
        : `Act as an interviewer or prospect asking ONLY this question: "${groomingTarget}". Once the user finishes their answer, do not engage in conversation. Just let them finish. You are facilitating their self-grooming recording.`;

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
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
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
              userTranscriptionRef.current += message.serverContent.inputTranscription.text;
              setCurrentTranscription(prev => ({ ...prev, user: userTranscriptionRef.current }));
            }
            if (message.serverContent?.outputTranscription) {
              aiTranscriptionRef.current += message.serverContent.outputTranscription.text;
              setCurrentTranscription(prev => ({ ...prev, ai: aiTranscriptionRef.current }));
            }
            if (message.serverContent?.turnComplete) {
              setTranscription(prev => [...prev, { user: userTranscriptionRef.current, ai: aiTranscriptionRef.current }]);
              // Don't clear userTranscriptionRef if in grooming mode until finished
              if (sessionMode === 'roleplay') {
                userTranscriptionRef.current = '';
                aiTranscriptionRef.current = '';
                setCurrentTranscription({ user: '', ai: '' });
              }
            }
          },
          onerror: (e) => { setStatus('error'); stopPractice(); },
          onclose: () => stopPractice(),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
          systemInstruction
        },
      });
      sessionRef.current = await sessionPromise;
    } catch (e) { setStatus('error'); }
  };

  const runGroomingAudit = async () => {
    setStatus('analyzing');
    const finalTranscript = userTranscriptionRef.current;
    stopPractice();

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Analyze this salesperson's answer to the question: "${groomingTarget}".
        USER TRANSCRIPT: "${finalTranscript}"
        
        Provide a detailed speech audit in JSON format.
        Include:
        - transcription: The cleaned up transcript.
        - grammarScore: 1-100 score.
        - toneAnalysis: Warmth, authority, and professional vibe.
        - grammarFeedback: Specific corrections to sentence formation.
        - breathPacingGuide: Instructions on where to pause for breath/impact using [Pause - 1s] markers.
        - strategicAlignment: How well they addressed the buyer's persona (${selectedPersona}).
        - idealWording: A perfectly rewritten version of their answer for maximum impact.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcription: { type: Type.STRING },
              grammarScore: { type: Type.NUMBER },
              toneAnalysis: { type: Type.STRING },
              grammarFeedback: { type: Type.STRING },
              breathPacingGuide: { type: Type.STRING },
              strategicAlignment: { type: Type.STRING },
              idealWording: { type: Type.STRING }
            },
            required: ["transcription", "grammarScore", "toneAnalysis", "grammarFeedback", "breathPacingGuide", "strategicAlignment", "idealWording"]
          }
        }
      });
      setEvaluation(JSON.parse(response.text || "{}"));
      setStatus('idle');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  const playIdealVersion = async () => {
    if (!evaluation || isPlayingIdeal) return;
    setIsPlayingIdeal(true);
    try {
      const bytes = await generatePitchAudio(evaluation.idealWording, 'Zephyr');
      if (bytes) {
        if (!audioContextRef.current) audioContextRef.current = new AudioContext();
        const buffer = await decodeAudioData(bytes, audioContextRef.current, 24000, 1);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsPlayingIdeal(false);
        idealSourceRef.current = source;
        source.start();
      }
    } catch (e) { setIsPlayingIdeal(false); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-xl overflow-hidden relative min-h-[700px] flex flex-col">
      {/* Header & Mode Toggle */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-600 text-white rounded-2xl shadow-lg"><ICONS.Chat /></div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Practice & Grooming Studio</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Master Your Delivery Interface</p>
          </div>
        </div>
        
        <div className="flex gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-2xl">
          <button 
            onClick={() => { stopPractice(); setSessionMode('roleplay'); setEvaluation(null); }}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sessionMode === 'roleplay' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Neural Roleplay
          </button>
          <button 
            onClick={() => { stopPractice(); setSessionMode('grooming'); }}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sessionMode === 'grooming' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Self-Grooming Lab
          </button>
        </div>
      </div>

      {!isActive && status !== 'analyzing' && !evaluation ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-12 max-w-4xl mx-auto py-10">
          <div className="space-y-4">
            <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl ${sessionMode === 'roleplay' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
               {sessionMode === 'roleplay' ? <ICONS.Brain /> : <ICONS.Trophy />}
            </div>
            <h4 className="text-3xl font-black text-slate-800 tracking-tight">
              {sessionMode === 'roleplay' ? `Challenge the ${analysis.snapshot.role}` : 'Perfect Your Delivery'}
            </h4>
            <p className="text-slate-500 leading-relaxed max-w-xl mx-auto">
              {sessionMode === 'roleplay' 
                ? 'Engage in a live, real-time conversation to test your ability to handle complex objections.'
                : 'Select a high-impact question, record your response, and receive a cognitive audit of your speech.'}
            </p>
          </div>

          <div className="w-full space-y-8">
             {sessionMode === 'grooming' ? (
               <div className="space-y-4 max-w-2xl mx-auto">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Target Objection / Question</p>
                  <select 
                    value={groomingTarget}
                    onChange={(e) => setGroomingTarget(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                  >
                    {analysis.objectionHandling.map((o, i) => <option key={i} value={o.objection}>{o.objection}</option>)}
                    {analysis.predictedQuestions.map((q, i) => <option key={i} value={q.customerAsks}>{q.customerAsks}</option>)}
                    <option value="Tell me about your product.">Standard Intro</option>
                  </select>
               </div>
             ) : (
               <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                 {PERSONA_OPTIONS.map((option) => (
                   <button
                     key={option.type}
                     onClick={() => setSelectedPersona(option.type)}
                     className={`p-6 rounded-[2rem] border-2 text-left transition-all relative group flex flex-col h-full ${selectedPersona === option.type ? 'bg-indigo-600 border-indigo-600 shadow-2xl scale-[1.02]' : 'bg-slate-50 border-slate-100 hover:border-indigo-300'}`}
                   >
                     <div className={`p-3 rounded-xl mb-4 inline-block w-fit ${selectedPersona === option.type ? 'bg-white/20 text-white' : 'bg-white text-indigo-500 shadow-sm'}`}>{option.icon}</div>
                     <h5 className={`font-black text-xs uppercase tracking-widest mb-2 ${selectedPersona === option.type ? 'text-white' : 'text-slate-800'}`}>{option.label}</h5>
                     <p className={`text-[10px] leading-snug font-medium ${selectedPersona === option.type ? 'text-indigo-100' : 'text-slate-500'}`}>{option.desc}</p>
                   </button>
                 ))}
               </div>
             )}
          </div>

          <button 
            onClick={sessionMode === 'roleplay' ? startPractice : startGroomingSession} 
            disabled={status === 'connecting'} 
            className={`inline-flex items-center gap-4 px-16 py-6 rounded-full font-black text-xl shadow-2xl transition-all hover:scale-105 active:scale-95 ${sessionMode === 'roleplay' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
          >
            {status === 'connecting' ? 'Initiating Link...' : <><ICONS.Play className="w-6 h-6" /> {sessionMode === 'roleplay' ? 'Start Roleplay' : 'Start Grooming'}</>}
          </button>
        </div>
      ) : status === 'analyzing' ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
           <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
           <p className="text-xl font-black text-slate-800">Performing Cognitive Speech Audit...</p>
           <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Analyzing Grammar, Tone, and Strategic Pacing</p>
        </div>
      ) : evaluation ? (
        <div className="flex-1 space-y-12 animate-in slide-in-from-bottom-6 duration-700">
          <div className="flex items-center justify-between">
             <button onClick={() => setEvaluation(null)} className="text-[10px] font-black uppercase text-indigo-500 tracking-widest flex items-center gap-2 hover:text-indigo-700">
               <ICONS.X /> Start New Evaluation
             </button>
             <div className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
               Grammar Score: {evaluation.grammarScore}/100
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-8">
               <div className="p-8 bg-slate-50 border border-slate-100 rounded-[3rem] shadow-inner">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Original Performance Transcript</h4>
                  <p className="text-sm font-medium leading-relaxed italic text-slate-600">"{evaluation.transcription}"</p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-8 bg-indigo-50 border border-indigo-100 rounded-[2.5rem]">
                     <h4 className="text-[10px] font-black uppercase text-indigo-600 tracking-widest mb-3">Tone Analysis</h4>
                     <p className="text-xs font-bold text-slate-700 leading-relaxed">{evaluation.toneAnalysis}</p>
                  </div>
                  <div className="p-8 bg-emerald-50 border border-emerald-100 rounded-[2.5rem]">
                     <h4 className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-3">Strategic Alignment</h4>
                     <p className="text-xs font-bold text-slate-700 leading-relaxed">{evaluation.strategicAlignment}</p>
                  </div>
               </div>

               <div className="p-8 bg-slate-900 text-white rounded-[3rem]">
                  <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-4 flex items-center gap-2">
                    <ICONS.Efficiency /> Breathing & Pacing Protocol
                  </h4>
                  <p className="text-sm font-medium leading-loose text-indigo-100">
                    {evaluation.breathPacingGuide.split(/(\[Pause - \d+s\])/g).map((part, i) => (
                      part.startsWith('[Pause') 
                      ? <span key={i} className="bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-md mx-1 font-black text-[9px] uppercase tracking-widest">{part}</span>
                      : part
                    ))}
                  </p>
               </div>
            </div>

            <div className="space-y-8">
               <div className="p-10 bg-white border-2 border-indigo-100 rounded-[3.5rem] shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] rotate-12"><ICONS.Trophy className="w-40 h-40" /></div>
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-8">
                       <h4 className="text-[12px] font-black uppercase text-indigo-500 tracking-[0.3em]">Mastered Delivery Script</h4>
                       <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                          <span className="text-[9px] font-black text-emerald-600 uppercase">Optimized for Conversion</span>
                       </div>
                    </div>
                    
                    <p className="text-2xl font-black text-slate-900 leading-tight mb-10">“{evaluation.idealWording}”</p>
                    
                    <div className="space-y-6 mt-auto">
                       <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl">
                          <h5 className="text-[9px] font-black uppercase text-slate-400 mb-2">Grammar Fixes</h5>
                          <p className="text-[11px] font-bold text-slate-600 italic">"{evaluation.grammarFeedback}"</p>
                       </div>
                       
                       <button 
                         onClick={playIdealVersion}
                         disabled={isPlayingIdeal}
                         className="w-full flex items-center justify-center gap-4 py-6 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
                       >
                         {isPlayingIdeal ? (
                            <div className="flex items-center gap-2">
                               <span className="flex gap-1">
                                 <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></span>
                                 <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                 <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:0.4s]"></span>
                               </span>
                               Playing Master Performance
                            </div>
                         ) : (
                            <><ICONS.Speaker /> Listen to Ideal Delivery</>
                         )}
                       </button>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-hidden">
          <div className="lg:col-span-2 bg-slate-900 rounded-[2.5rem] p-10 flex flex-col items-center justify-center relative shadow-inner overflow-hidden border border-slate-800">
            <div className={`absolute inset-0 opacity-10 blur-[100px] transition-colors duration-1000 ${selectedPersona === 'Technical' ? 'bg-blue-500' : selectedPersona === 'Financial' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div>
            
            <div className="relative w-64 h-64 mb-10 flex items-center justify-center">
               <div className="absolute inset-0 bg-white/5 rounded-full animate-pulse scale-125"></div>
               <div className="w-32 h-32 bg-indigo-600 rounded-full flex items-center justify-center text-white scale-150 shadow-2xl z-10 border-4 border-slate-900"><ICONS.Brain /></div>
            </div>
            
            <div className="text-center space-y-4 relative z-10">
               <span className="px-3 py-1 bg-white/10 text-white/60 text-[8px] font-black uppercase tracking-widest rounded-lg border border-white/5 mb-3 inline-block">
                 {sessionMode === 'roleplay' ? `Archetype: ${selectedPersona}` : 'Self-Grooming Mode'}
               </span>
               <h5 className="text-white text-3xl font-black tracking-tight">
                 {sessionMode === 'roleplay' ? analysis.snapshot.role : 'Training Avatar'}
               </h5>
               <p className="text-indigo-300 text-sm italic font-medium">
                 {sessionMode === 'roleplay' ? '"I\'m listening. Make it relevant."' : `Q: "${groomingTarget}"`}
               </p>
            </div>

            <div className="absolute bottom-8 inset-x-8 h-24 flex flex-col justify-end pointer-events-none">
              {currentTranscription.user && <div className="text-right mb-2"><span className="inline-block px-4 py-2 bg-indigo-600 text-white text-xs italic rounded-2xl">You: {currentTranscription.user}</span></div>}
              {currentTranscription.ai && <div className="text-left"><span className="inline-block px-4 py-2 bg-white/10 text-white text-xs font-bold rounded-2xl">AI: {currentTranscription.ai}</span></div>}
            </div>

            {sessionMode === 'grooming' && (
              <button 
                onClick={runGroomingAudit}
                className="absolute bottom-8 right-8 px-8 py-3 bg-emerald-600 text-white rounded-full font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-emerald-700 transition-all animate-in slide-in-from-right-4"
              >
                Finish & Audit Speech
              </button>
            )}
          </div>
          
          <div className="bg-slate-50 rounded-[2.5rem] p-8 flex flex-col border border-slate-100 overflow-hidden shadow-inner">
            <h6 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-6">Live Interaction Log</h6>
            <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar">
              {transcription.length === 0 && <p className="text-[10px] text-slate-300 italic text-center py-20">The floor is yours...</p>}
              {transcription.map((turn, i) => (
                <div key={i} className="space-y-2 animate-in slide-in-from-bottom-2">
                  <div className="flex flex-col items-end">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Architect</p>
                    <p className="text-xs text-slate-700 bg-white p-4 rounded-2xl rounded-tr-none border border-slate-100 shadow-sm w-full leading-relaxed italic">"{turn.user}"</p>
                  </div>
                  {turn.ai && (
                    <div className="flex flex-col items-start">
                      <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-1">Response</p>
                      <p className="text-xs text-indigo-900 bg-indigo-50 p-4 rounded-2xl rounded-tl-none border border-indigo-100 font-bold leading-relaxed">"{turn.ai}"</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
