
import React, { useState, useRef, useCallback } from 'react';
import { AnalysisResult } from '../types';
import { ICONS } from '../constants';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';

interface PracticeSessionProps {
  analysis: AnalysisResult;
}

export const PracticeSession: React.FC<PracticeSessionProps> = ({ analysis }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
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
              // Follow guidelines: Send data only after sessionPromise resolves
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Process audio data from model turn
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

            // Correctly handle transcription using serverContent flags
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
              // Copy ref values to local variables before clearing, per guidelines
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
          ROLE: ${analysis.snapshot.role}
          DECISION STYLE: ${analysis.snapshot.decisionStyle}
          RISK TOLERANCE: ${analysis.snapshot.riskTolerance}
          TONE: ${analysis.snapshot.tone}
          PRIORITIES: ${analysis.snapshot.priorities.map(p => p.text).join(', ')}
          
          Guidelines:
          1. React naturally to the salesperson. 
          2. Use objections like: ${analysis.objectionHandling.map(o => o.objection).join(', ')}.
          3. Challenge their points based on your role's fears and priorities.
          4. Keep responses brief to keep the flow alive.`
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
            <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Live Practise Simulation</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Real-time Conversational Roleplay</p>
          </div>
        </div>
        {isActive && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-full">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Live</span>
            </div>
            <button onClick={stopPractice} className="px-6 py-2 bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-rose-700 transition-all">End Simulation</button>
          </div>
        )}
      </div>

      {!isActive ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 max-w-2xl mx-auto py-10">
          <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center text-indigo-600"><ICONS.Brain /></div>
          <div className="space-y-4">
            <h4 className="text-2xl font-black text-slate-800">Roleplay with the {analysis.snapshot.role}</h4>
            <p className="text-slate-500 leading-relaxed">Prepare for the real deal. Our AI will assume the psychological profile inferred from your documents. Speak into your microphone and handle the heat.</p>
          </div>
          <button onClick={startPractice} disabled={status === 'connecting'} className="inline-flex items-center gap-4 px-12 py-6 bg-indigo-600 text-white rounded-full font-black text-xl shadow-2xl hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all">
            {status === 'connecting' ? 'Connecting Neural Buyer...' : <><ICONS.Play /> Start Simulation</>}
          </button>
          {status === 'error' && <p className="text-rose-500 text-sm font-bold">Connection failed. Ensure microphone access and valid key.</p>}
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-hidden">
          <div className="lg:col-span-2 bg-slate-900 rounded-[2.5rem] p-10 flex flex-col items-center justify-center relative shadow-inner overflow-hidden">
            <div className="relative w-64 h-64 mb-10 flex items-center justify-center">
               <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-pulse"></div>
               <div className="w-32 h-32 bg-indigo-600 rounded-full flex items-center justify-center text-white scale-150 shadow-2xl shadow-indigo-500/50"><ICONS.Brain /></div>
            </div>
            <div className="text-center space-y-2">
               <h5 className="text-white text-xl font-bold">{analysis.snapshot.role}</h5>
               <p className="text-slate-400 text-sm italic">"I'm listening. Show me the value."</p>
            </div>
            <div className="absolute bottom-8 inset-x-8 h-24 overflow-y-auto no-scrollbar flex flex-col justify-end">
              {currentTranscription.user && <p className="text-right text-indigo-300 text-xs italic mb-2">You: {currentTranscription.user}</p>}
              {currentTranscription.ai && <p className="text-left text-emerald-300 text-xs font-bold">AI: {currentTranscription.ai}</p>}
            </div>
          </div>
          <div className="bg-slate-50 rounded-[2.5rem] p-6 flex flex-col border border-slate-100 overflow-hidden">
            <h6 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4">Conversation History</h6>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
              {transcription.map((turn, i) => (
                <div key={i} className="space-y-1 animate-in slide-in-from-bottom-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">You</p>
                  <p className="text-xs text-slate-700 bg-white p-2 rounded-lg border border-slate-100">"{turn.user}"</p>
                  <p className="text-[9px] font-bold text-indigo-500 uppercase mt-2">Buyer</p>
                  <p className="text-xs text-indigo-900 bg-indigo-50 p-2 rounded-lg border border-indigo-100 italic">"{turn.ai}"</p>
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
