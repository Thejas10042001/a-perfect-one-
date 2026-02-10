
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

interface SavedGrooming {
  id: string;
  question: string;
  evaluation: GroomingEvaluation;
  userNotes?: string;
  timestamp: number;
}

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
  const [isPlayingExplanation, setIsPlayingExplanation] = useState(false);
  const [savedGroomings, setSavedGroomings] = useState<SavedGrooming[]>([]);
  const [showGroomingJournal, setShowGroomingJournal] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const idealSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const explanationSourceRef = useRef<AudioBufferSourceNode | null>(null);

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
        : `Act as a world-class speech and sales coach. Start by stating: "I'm going to ask you a critical question. Take a breath, and give me your best structured response." Then ask exactly this question: "${groomingTarget}". Once the user provides a full answer, remain silent until the session is ended manually. You are observing their performance for a later audit focusing on voice tone, grammar, and pacing.`;

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
        contents: `Act as a world-class communication, linguistics, and sales coach. 
        Perform a comprehensive "Grooming Audit" for a salesperson.
        
        QUESTION POSED: "${groomingTarget}"
        SALESPERSON PERFORMANCE: "${finalTranscript}"
        TARGET AUDIENCE PERSONA: ${selectedPersona}
        
        Your task is to provide a detailed, critical, yet encouraging audit in JSON format.
        
        CRITICAL AUDIT DIMENSIONS:
        1. Grammar & Sentence Formation: Identify specific weak phrasing, filler words, or run-on sentences.
        2. Voice Tone: Evaluate if the tone was authoritative, empathetic, or nervous based on syntax and pauses.
        3. Tactical Pacing & Breathing: Provide a script where you insert EXACT markers like [Take Breath], [Pause - 2s], or [Slow Down] to show them how to deliver for impact.
        4. Strategic Alignment: How well does this satisfy a ${selectedPersona} buyer?
        
        REQUIRED JSON SCHEMA:
        {
          "transcription": "Cleaned up version of their answer.",
          "grammarScore": 0-100,
          "toneAnalysis": "Detailed paragraph about vocal energy and authority.",
          "grammarFeedback": "Detailed bullet points about grammar improvements.",
          "sentenceFormation": "Detailed analysis of sentence structure, variety, and impact.",
          "breathPacingGuide": "The text with [Take Breath] and [Pause - Xs] markers inserted strategically.",
          "strategicAlignment": "Strategic score and rationale.",
          "idealWording": "A 'Master Performance' version of the answer, rewritten for elite delivery.",
          "correctionExplanation": "3-4 paragraphs explaining EXACTLY WHY the user's structure was sub-optimal and why the new version wins."
        }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcription: { type: Type.STRING },
              grammarScore: { type: Type.NUMBER },
              toneAnalysis: { type: Type.STRING },
              grammarFeedback: { type: Type.STRING },
              sentenceFormation: { type: Type.STRING },
              breathPacingGuide: { type: Type.STRING },
              strategicAlignment: { type: Type.STRING },
              idealWording: { type: Type.STRING },
              correctionExplanation: { type: Type.STRING }
            },
            required: ["transcription", "grammarScore", "toneAnalysis", "grammarFeedback", "sentenceFormation", "breathPacingGuide", "strategicAlignment", "idealWording", "correctionExplanation"]
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
    if (!evaluation || isPlayingIdeal || isPlayingExplanation) return;
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

  const playCorrectionExplanation = async () => {
    if (!evaluation || isPlayingExplanation || isPlayingIdeal) return;
    setIsPlayingExplanation(true);
    try {
      const bytes = await generatePitchAudio(evaluation.correctionExplanation, 'Charon');
      if (bytes) {
        if (!audioContextRef.current) audioContextRef.current = new AudioContext();
        const buffer = await decodeAudioData(bytes, audioContextRef.current, 24000, 1);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsPlayingExplanation(false);
        explanationSourceRef.current = source;
        source.start();
      }
    } catch (e) { setIsPlayingExplanation(false); }
  };

  const addToGroomingJournal = () => {
    if (!evaluation) return;
    const newGrooming: SavedGrooming = {
      id: Date.now().toString(),
      question: groomingTarget,
      evaluation: evaluation,
      timestamp: Date.now()
    };
    setSavedGroomings(prev => [newGrooming, ...prev]);
    alert("Response added to your Self-Grooming Journal for correction and practice.");
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-2xl overflow-hidden relative min-h-[750px] flex flex-col">
      {/* Header & Mode Toggle */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-rose-600 text-white rounded-2xl shadow-xl shadow-rose-100"><ICONS.Speaker /></div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Performance Grooming Lab</h3>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Master Your Verbal Architecture</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowGroomingJournal(!showGroomingJournal)}
            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${showGroomingJournal ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border-indigo-100'}`}
          >
            {showGroomingJournal ? 'Close Journal' : 'Self-Grooming Journal'}
          </button>
          <div className="flex gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-2xl">
            <button 
              onClick={() => { stopPractice(); setSessionMode('roleplay'); setEvaluation(null); }}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sessionMode === 'roleplay' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Buyer Roleplay
            </button>
            <button 
              onClick={() => { stopPractice(); setSessionMode('grooming'); }}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sessionMode === 'grooming' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Bot-Led Grooming
            </button>
          </div>
        </div>
      </div>

      {showGroomingJournal ? (
        <div className="flex-1 space-y-8 animate-in fade-in zoom-in-95 duration-500 overflow-y-auto max-h-[600px] no-scrollbar pb-12">
           <div className="flex items-center justify-between border-b border-slate-100 pb-6">
              <h4 className="text-xl font-black text-slate-900 tracking-tight">Your Self-Grooming Journal</h4>
              <span className="text-[9px] font-black uppercase text-indigo-500 tracking-widest bg-indigo-50 px-3 py-1 rounded-lg">{savedGroomings.length} Saved Protocols</span>
           </div>
           {savedGroomings.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-24 opacity-30 text-center space-y-4">
                <ICONS.Document className="w-16 h-16" />
                <p className="text-sm font-bold uppercase tracking-widest">Journal Empty. Add your first audit for self-grooming.</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {savedGroomings.map(saved => (
                  <div key={saved.id} className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] relative group hover:bg-white hover:border-indigo-200 transition-all hover:shadow-2xl">
                     <div className="flex items-center justify-between mb-4">
                        <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">{new Date(saved.timestamp).toLocaleDateString()}</span>
                        <button 
                          onClick={() => setSavedGroomings(prev => prev.filter(p => p.id !== saved.id))}
                          className="text-slate-300 hover:text-rose-500"
                        ><ICONS.X className="w-4 h-4" /></button>
                     </div>
                     <p className="text-sm font-black text-slate-900 mb-2 truncate">Q: {saved.question}</p>
                     <p className="text-[11px] font-bold text-slate-500 italic mb-6 line-clamp-2">"{(saved.evaluation as any).idealWording}"</p>
                     <button 
                       onClick={() => { setEvaluation(saved.evaluation); setShowGroomingJournal(false); }}
                       className="text-[10px] font-black uppercase text-indigo-600 tracking-widest flex items-center gap-2 hover:translate-x-1 transition-transform"
                     >
                       Rehearse & Correct <ICONS.Play className="w-3 h-3" />
                     </button>
                  </div>
                ))}
             </div>
           )}
        </div>
      ) : !isActive && status !== 'analyzing' && !evaluation ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-12 max-w-4xl mx-auto py-12">
          <div className="space-y-4">
            <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-2xl transition-transform hover:scale-105 duration-500 ${sessionMode === 'roleplay' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
               {sessionMode === 'roleplay' ? <ICONS.Brain className="w-10 h-10" /> : <ICONS.Trophy className="w-10 h-10" />}
            </div>
            <h4 className="text-4xl font-black text-slate-900 tracking-tight">
              {sessionMode === 'roleplay' ? `Simulate a Live ${analysis.snapshot.role} Meeting` : 'Initiate Speech Mastery Protocol'}
            </h4>
            <p className="text-slate-500 text-lg leading-relaxed max-w-2xl mx-auto font-medium">
              {sessionMode === 'roleplay' 
                ? 'Test your strategic reflexes in a real-time, low-latency dialogue with a persona-grounded buyer.'
                : 'Our Bot-Coach will ask you a high-stakes question. Give your best answer, and receive an elite audit of your tone, grammar, sentence structure, and tactical pacing.'}
            </p>
          </div>

          <div className="w-full space-y-10">
             {sessionMode === 'grooming' ? (
               <div className="space-y-4 max-w-2xl mx-auto text-left">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 ml-2">Target Objection / Question</label>
                  <select 
                    value={groomingTarget}
                    onChange={(e) => setGroomingTarget(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-8 py-5 text-base font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-inner"
                  >
                    <optgroup label="Critical Objections">
                      {analysis.objectionHandling.map((o, i) => <option key={i} value={o.objection}>{o.objection}</option>)}
                    </optgroup>
                    <optgroup label="Anticipated Questions">
                      {analysis.predictedQuestions.map((q, i) => <option key={i} value={q.customerAsks}>{q.customerAsks}</option>)}
                    </optgroup>
                  </select>
               </div>
             ) : (
               <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                 {PERSONA_OPTIONS.map((option) => (
                   <button
                     key={option.type}
                     onClick={() => setSelectedPersona(option.type)}
                     className={`p-8 rounded-[2.5rem] border-2 text-left transition-all relative overflow-hidden group flex flex-col h-full ${selectedPersona === option.type ? 'bg-indigo-600 border-indigo-600 shadow-2xl scale-[1.03]' : 'bg-white border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/10'}`}
                   >
                     <div className={`p-4 rounded-2xl mb-6 inline-block w-fit ${selectedPersona === option.type ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600 shadow-sm'}`}>{option.icon}</div>
                     <h5 className={`font-black text-xs uppercase tracking-widest mb-2 ${selectedPersona === option.type ? 'text-white' : 'text-slate-900'}`}>{option.label}</h5>
                     <p className={`text-[11px] leading-relaxed font-semibold ${selectedPersona === option.type ? 'text-indigo-100' : 'text-slate-500'}`}>{option.desc}</p>
                   </button>
                 ))}
               </div>
             )}
          </div>

          <button 
            onClick={sessionMode === 'roleplay' ? startPractice : startGroomingSession} 
            disabled={status === 'connecting'} 
            className={`group relative overflow-hidden inline-flex items-center gap-6 px-20 py-7 rounded-full font-black text-2xl shadow-2xl transition-all hover:scale-105 active:scale-95 ${sessionMode === 'roleplay' ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200' : 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-200'}`}
          >
            {status === 'connecting' ? (
              <><div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div> Connecting...</>
            ) : (
              <><ICONS.Play className="w-8 h-8" /> {sessionMode === 'roleplay' ? 'Commence Interaction' : 'Activate Bot-Coach'}</>
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
          </button>
        </div>
      ) : status === 'analyzing' ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-700">
           <div className="relative">
              <div className="w-24 h-24 border-8 border-indigo-50 border-t-indigo-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-indigo-600 scale-125"><ICONS.Brain /></div>
           </div>
           <div className="text-center">
              <p className="text-3xl font-black text-slate-900 tracking-tight mb-2">Cognitive Mastery Audit In Progress</p>
              <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.4em] animate-pulse">Analyzing Grammar • Tone • Structure • Pacing</p>
           </div>
        </div>
      ) : evaluation ? (
        <div className="flex-1 space-y-12 animate-in slide-in-from-bottom-8 duration-1000 pb-20">
          <div className="flex items-center justify-between">
             <button onClick={() => setEvaluation(null)} className="text-[11px] font-black uppercase text-indigo-600 tracking-widest flex items-center gap-2 hover:translate-x-[-4px] transition-transform">
               <ICONS.X /> Close Mastery Review
             </button>
             <div className="flex items-center gap-4">
                <button 
                  onClick={addToGroomingJournal}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-100 flex items-center gap-2"
                >
                  <ICONS.Efficiency className="w-4 h-4" /> Add to here (Journal)
                </button>
                <div className="px-6 py-2.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  Grooming Score: {evaluation.grammarScore}%
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Left: Feedback Cards */}
            <div className="space-y-8">
               <div className="p-10 bg-slate-50 border border-slate-100 rounded-[3rem] shadow-inner relative overflow-hidden group">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Recorded Performance</h4>
                  <p className="text-lg font-medium leading-relaxed italic text-slate-700">“{evaluation.transcription}”</p>
               </div>

               <div className="p-10 bg-slate-900 text-white rounded-[3rem] shadow-2xl relative overflow-hidden group">
                  <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-6 flex items-center gap-2">
                    <ICONS.Sparkles className="w-4 h-4" /> Tactical Breathing & Pacing Guide
                  </h4>
                  <p className="text-xl font-medium leading-[2.2] text-indigo-50 font-serif italic">
                    {evaluation.breathPacingGuide.split(/(\[Take Breath\]|\[Pause - \d+s\]|\[Slow Down\])/g).map((part, i) => (
                      (part.startsWith('[Take Breath]') || part.startsWith('[Pause') || part.startsWith('[Slow'))
                      ? <span key={i} className="bg-indigo-600/50 text-indigo-300 px-3 py-1 rounded-xl mx-1 font-black text-[10px] uppercase tracking-widest not-italic border border-white/10 shadow-sm">{part}</span>
                      : part
                    ))}
                  </p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="p-8 bg-indigo-50 border border-indigo-100 rounded-[2.5rem] space-y-4">
                    <h5 className="text-[9px] font-black uppercase text-indigo-600 tracking-widest">Sentence Formation Audit</h5>
                    <p className="text-[11px] font-bold text-slate-700 leading-relaxed italic">{evaluation.sentenceFormation}</p>
                 </div>
                 <div className="p-8 bg-rose-50 border border-rose-100 rounded-[2.5rem] space-y-4">
                    <h5 className="text-[9px] font-black uppercase text-rose-600 tracking-widest">Vocal Tone & Pace Audit</h5>
                    <p className="text-[11px] font-bold text-slate-700 leading-relaxed italic">{evaluation.toneAnalysis}</p>
                 </div>
               </div>
            </div>

            {/* Right: Ideal & Explanations */}
            <div className="space-y-8">
               <div className="p-12 bg-white border-4 border-indigo-50 rounded-[4rem] shadow-2xl relative overflow-hidden group/master">
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-12">
                       <h4 className="text-[13px] font-black uppercase text-indigo-600 tracking-[0.4em]">Optimized Ideal wording</h4>
                       <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full uppercase border border-emerald-100">Validated Logic</span>
                    </div>
                    
                    <p className="text-3xl font-black text-slate-900 leading-tight mb-12 tracking-tight">“{evaluation.idealWording}”</p>
                    
                    <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] mb-12">
                       <h5 className="text-[10px] font-black uppercase text-slate-500 mb-4">Linguistic Corrections</h5>
                       <p className="text-sm font-bold text-slate-700 leading-relaxed whitespace-pre-wrap">{evaluation.grammarFeedback}</p>
                    </div>

                    <div className="flex flex-col gap-4">
                       <button 
                         onClick={playIdealVersion}
                         disabled={isPlayingIdeal || isPlayingExplanation}
                         className={`w-full flex items-center justify-center gap-5 py-7 rounded-[2rem] font-black text-base uppercase tracking-widest shadow-2xl transition-all active:scale-95 ${isPlayingIdeal ? 'bg-indigo-400 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100'}`}
                       >
                         {isPlayingIdeal ? 'Synthesizing Audio...' : <><ICONS.Speaker className="w-6 h-6" /> Rehearse Ideal wording</>}
                       </button>

                       <button 
                         onClick={playCorrectionExplanation}
                         disabled={isPlayingIdeal || isPlayingExplanation}
                         className={`w-full flex items-center justify-center gap-5 py-7 rounded-[2rem] font-black text-[11px] uppercase tracking-widest border-2 transition-all active:scale-95 ${isPlayingExplanation ? 'text-slate-400' : 'text-slate-700 hover:text-indigo-600 border-slate-200 hover:border-indigo-200 shadow-lg'}`}
                       >
                         {isPlayingExplanation ? 'Coach Explaining...' : <><ICONS.Brain className="w-5 h-5" /> Detailed Improvement rationale</>}
                       </button>
                    </div>
                  </div>
               </div>

               <div className="p-10 bg-emerald-50 border border-emerald-100 rounded-[3.5rem] animate-in fade-in zoom-in-95 duration-1000 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                     <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-100"><ICONS.Brain /></div>
                     <h4 className="text-[11px] font-black uppercase text-emerald-600 tracking-[0.3em]">Self-Grooming Explanation</h4>
                  </div>
                  <p className="text-base font-medium text-emerald-950 leading-relaxed whitespace-pre-wrap italic">
                    {evaluation.correctionExplanation}
                  </p>
               </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-10 overflow-hidden">
          {/* Main Visualizer Area */}
          <div className="lg:col-span-2 bg-slate-900 rounded-[3.5rem] p-12 flex flex-col items-center justify-center relative shadow-2xl overflow-hidden border-2 border-slate-800">
            <div className={`absolute inset-0 opacity-10 blur-[150px] transition-colors duration-2000 ${selectedPersona === 'Technical' ? 'bg-blue-600' : selectedPersona === 'Financial' ? 'bg-emerald-600' : 'bg-indigo-600'}`}></div>
            
            <div className="relative w-80 h-80 mb-12 flex items-center justify-center">
               <div className={`absolute inset-0 bg-white/5 rounded-full ${isActive ? 'animate-ping' : 'animate-pulse'} scale-[1.4]`}></div>
               <div className={`w-40 h-40 bg-indigo-600 rounded-full flex items-center justify-center text-white scale-[1.7] shadow-[0_0_80px_rgba(79,70,229,0.5)] z-10 border-8 border-slate-900 transition-transform ${isActive ? 'animate-pulse' : ''}`}>
                  {sessionMode === 'roleplay' ? <ICONS.Brain className="w-16 h-16" /> : <ICONS.Speaker className="w-16 h-16" />}
               </div>
               {isActive && (
                 <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-2 bg-rose-600 rounded-full shadow-2xl animate-bounce">
                    <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"></div>
                    <span className="text-[11px] font-black uppercase text-white tracking-widest">Active Audit Trace</span>
                 </div>
               )}
            </div>
            
            <div className="text-center space-y-6 relative z-10 max-w-xl">
               <span className="px-5 py-2 bg-white/10 text-white/70 text-[10px] font-black uppercase tracking-[0.3em] rounded-xl border border-white/5 mb-4 inline-block">
                 {sessionMode === 'roleplay' ? `Interacting with ${selectedPersona}` : 'Bot-Led Grooming Active'}
               </span>
               <h5 className="text-white text-4xl font-black tracking-tight leading-tight">
                 {sessionMode === 'roleplay' ? analysis.snapshot.role : 'Neural Bot-Coach'}
               </h5>
               <p className="text-indigo-200/60 text-lg italic font-medium leading-relaxed">
                 {sessionMode === 'roleplay' 
                   ? '"Speak directly to our business value drivers."' 
                   : `Bot Question: "${groomingTarget}"`}
               </p>
            </div>

            {isActive && (
              <div className="absolute bottom-12 right-12 flex gap-4">
                 {sessionMode === 'grooming' && (
                    <button 
                      onClick={runGroomingAudit}
                      className="px-12 py-5 bg-emerald-600 text-white rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-2xl hover:bg-emerald-700 transition-all border border-emerald-500/50"
                    >
                      Audit My Performance
                    </button>
                 )}
                 <button 
                   onClick={stopPractice}
                   className="px-10 py-5 bg-rose-600 text-white rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-2xl hover:bg-rose-700 transition-all active:scale-95 border border-rose-500/50"
                 >
                   End Interaction
                 </button>
              </div>
            )}
          </div>
          
          {/* Interaction Log Sidebar */}
          <div className="bg-slate-50 rounded-[3.5rem] p-10 flex flex-col border border-slate-100 overflow-hidden shadow-inner relative">
            <h6 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-8 flex items-center gap-3">
               <ICONS.Efficiency className="w-4 h-4" /> Mastery Log
            </h6>
            <div className="flex-1 overflow-y-auto space-y-8 custom-scrollbar pr-6">
              {transcription.length === 0 && (
                <div className="py-24 text-center space-y-6 opacity-20">
                   <ICONS.Speaker className="mx-auto w-14 h-14" />
                   <p className="text-[11px] font-black uppercase tracking-[0.4em]">Establishing Voice Link...</p>
                </div>
              )}
              {transcription.map((turn, i) => (
                <div key={i} className="space-y-3 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="flex flex-col items-end text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Your response</p>
                    <p className="text-sm text-slate-700 bg-white p-6 rounded-[2rem] rounded-tr-none border border-slate-100 shadow-sm leading-relaxed italic w-full">“{turn.user}”</p>
                  </div>
                  {turn.ai && (
                    <div className="flex flex-col items-start text-left">
                      <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1.5">Coach input</p>
                      <p className="text-sm text-indigo-950 bg-indigo-50/80 p-6 rounded-[2rem] rounded-tl-none border border-indigo-100 font-bold leading-relaxed w-full">“{turn.ai}”</p>
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
