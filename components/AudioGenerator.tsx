import React, { useState, useRef, useMemo } from 'react';
import { AnalysisResult } from '../types';
import { ICONS } from '../constants';
import { generatePitchAudio, decodeAudioData, generateExplanation } from '../services/geminiService';

interface AudioGeneratorProps {
  analysis: AnalysisResult;
}

const VOICES = [
  { name: 'Kore', label: 'Pro Male', desc: 'Direct, authoritative, business-first.' },
  { name: 'Puck', label: 'High Energy', desc: 'Enthusiastic, engaging, persuasive.' },
  { name: 'Charon', label: 'Deep Authority', desc: 'Serious, steady, risk-conscious.' },
  { name: 'Zephyr', label: 'Calm Strategist', desc: 'Consultative, soft, trusted advisor.' },
];

type BriefingTrack = 'psychology' | 'conversation' | 'objections' | 'custom';

export const AudioGenerator: React.FC<AudioGeneratorProps> = ({ analysis }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrack, setActiveTrack] = useState<BriefingTrack>('psychology');
  const [customQuestion, setCustomQuestion] = useState("");
  const [customResponse, setCustomResponse] = useState("");
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const tracks = useMemo(() => ({
    psychology: {
      title: "Psychological Breakdown",
      description: "Understand the hidden drivers and risk profiles of your buyer.",
      script: `This briefing covers the psychological profile of the ${analysis.snapshot.role}. 
               They prioritize ${(analysis.snapshot.priorities || []).map(p => p.text).join(', ')}. 
               Their decision style is ${analysis.snapshot.decisionStyle}, suggesting they need ${(analysis.snapshot.decisionStyle || "").toLowerCase().includes('analytical') ? 'heavy data validation' : 'strong vision-driven proof'}. 
               Watch for their risk tolerance, which we've identified as ${analysis.snapshot.riskTolerance}.`
    },
    conversation: {
      title: "Conversation Rehearsal",
      description: "Exact wording for your opening hooks and discovery phase.",
      script: `Let's rehearse the conversation. I recommend opening with: ${(analysis.openingLines || [])[0]?.text || "a professional introduction"}. 
               This sets a tone of ${(analysis.openingLines || [])[0]?.label || "professionalism"}. 
               Transition into these strategic discovery questions: ${(analysis.strategicQuestionsToAsk || []).slice(0, 2).map(q => q.question).join('. ')}.`
    },
    objections: {
      title: "Objection Battle-Drill",
      description: "Quick-fire responses for likely barriers grounded in data.",
      script: `Be prepared for resistance. The primary objection we expect is: ${(analysis.objectionHandling || [])[0]?.objection || "none yet identified"}. 
               When they say this, they likely mean: ${(analysis.objectionHandling || [])[0]?.realMeaning || "something else"}. 
               Respond with: ${(analysis.objectionHandling || [])[0]?.exactWording || "a clarifying question"}. 
               Stay focused on ${(analysis.snapshot.priorities || [])[0]?.text || "the primary value proposition"} throughout your defense.`
    },
    custom: {
      title: "Dynamic Strategy Inquiry",
      description: "Ask a specific question about the strategy and hear a verbal response.",
      script: customResponse || "Awaiting your specific question..."
    }
  }), [analysis, customResponse]);

  const playAudio = async (bytes: Uint8Array) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    const buffer = await decodeAudioData(bytes, audioContextRef.current, 24000, 1);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => setIsPlaying(false);
    
    sourceRef.current?.stop();
    sourceRef.current = source;
    source.start();
    setIsPlaying(true);
  };

  const handleCustomQuestion = async () => {
    if (!customQuestion.trim() || isGenerating) return;
    
    setIsGenerating(true);
    sourceRef.current?.stop();
    setIsPlaying(false);
    
    try {
      const explanation = await generateExplanation(customQuestion, analysis);
      setCustomResponse(explanation);
      
      const audioBytes = await generatePitchAudio(explanation, selectedVoice);
      if (audioBytes) {
        await playAudio(audioBytes);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAndPlay = async () => {
    if (isPlaying) {
      sourceRef.current?.stop();
      setIsPlaying(false);
      return;
    }

    if (activeTrack === 'custom') {
      handleCustomQuestion();
      return;
    }

    setIsGenerating(true);
    const audioBytes = await generatePitchAudio(tracks[activeTrack].script, selectedVoice);
    setIsGenerating(false);

    if (audioBytes) {
      playAudio(audioBytes);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-xl overflow-hidden relative">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg">
            <ICONS.Speaker />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Cognitive Coaching Studio</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Auditory Strategic Briefings</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column: Track Selection & Voices */}
        <div className="lg:col-span-4 space-y-10">
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Strategy Modules</h4>
            <div className="space-y-3">
              {(Object.keys(tracks) as BriefingTrack[]).map((key) => (
                <button
                  key={key}
                  onClick={() => { 
                    if (isPlaying) sourceRef.current?.stop(); 
                    setIsPlaying(false); 
                    setActiveTrack(key); 
                    if (key !== 'custom') setCustomResponse("");
                  }}
                  className={`w-full p-5 rounded-2xl border text-left transition-all relative group ${activeTrack === key ? 'bg-indigo-600 border-indigo-600 shadow-lg' : 'bg-slate-50 border-slate-100 hover:border-indigo-300'}`}
                >
                  <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${activeTrack === key ? 'text-indigo-200' : 'text-indigo-500'}`}>Track {key === 'psychology' ? '01' : key === 'conversation' ? '02' : key === 'objections' ? '03' : 'QUERY'}</div>
                  <p className={`font-black text-sm mb-1 ${activeTrack === key ? 'text-white' : 'text-slate-800'}`}>{tracks[key].title}</p>
                  <p className={`text-[10px] leading-tight ${activeTrack === key ? 'text-indigo-100' : 'text-slate-500'}`}>{tracks[key].description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Persona Selection</h4>
            <div className="grid grid-cols-1 gap-2">
              {VOICES.map((v) => (
                <button
                  key={v.name}
                  onClick={() => setSelectedVoice(v.name)}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${selectedVoice === v.name ? 'bg-indigo-50 border-indigo-400' : 'hover:bg-slate-50 border-transparent'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${selectedVoice === v.name ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{v.name[0]}</div>
                  <div className="text-left">
                    <p className={`text-xs font-black uppercase tracking-widest ${selectedVoice === v.name ? 'text-indigo-600' : 'text-slate-600'}`}>{v.label}</p>
                    <p className="text-[9px] text-slate-400 font-medium">{v.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Player & Visualizer */}
        <div className="lg:col-span-8 flex flex-col items-center justify-center p-12 bg-slate-50 rounded-[3rem] border border-slate-100 relative overflow-hidden">
          {/* Animated Waveform Background */}
          <div className={`absolute bottom-0 left-0 right-0 h-40 flex items-end justify-center gap-1.5 px-10 transition-opacity duration-1000 ${isPlaying ? 'opacity-100' : 'opacity-20'}`}>
            {[...Array(40)].map((_, i) => (
              <div 
                key={i} 
                className={`w-1 rounded-full bg-indigo-500/30 ${isPlaying ? 'animate-waveform' : ''}`}
                style={{ 
                  height: `${20 + Math.random() * 80}%`, 
                  animationDelay: `${i * 0.05}s`,
                  animationDuration: `${0.4 + Math.random() * 0.4}s`
                }}
              ></div>
            ))}
          </div>

          <div className="relative z-10 w-full max-w-md text-center space-y-10">
            <div className={`w-40 h-40 mx-auto rounded-full bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] flex items-center justify-center transition-transform duration-700 ${isPlaying ? 'scale-110 shadow-indigo-200' : 'hover:scale-105'}`}>
               <div className={`w-32 h-32 rounded-full border-4 ${isPlaying ? 'border-indigo-500 border-t-transparent animate-spin' : 'border-slate-100'} flex items-center justify-center`}>
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-inner transition-colors ${isPlaying ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300'}`}>
                    {isPlaying ? <ICONS.Speaker /> : <ICONS.Brain />}
                  </div>
               </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">{tracks[activeTrack].title}</h2>
              
              {activeTrack === 'custom' ? (
                <div className="space-y-4">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={customQuestion}
                      onChange={(e) => setCustomQuestion(e.target.value)}
                      placeholder="e.g. How do I handle a CEO focused on EBITDA?"
                      className="w-full bg-white border-2 border-slate-200 rounded-2xl px-6 py-4 text-sm focus:border-indigo-500 outline-none transition-all shadow-sm pr-12"
                      onKeyDown={(e) => e.key === 'Enter' && handleCustomQuestion()}
                    />
                    <button 
                      onClick={handleCustomQuestion}
                      className="absolute right-3 top-3 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    >
                      <ICONS.Play />
                    </button>
                  </div>
                  {customResponse && (
                    <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl border border-white/80 shadow-sm animate-in fade-in slide-in-from-top-2 italic text-slate-500 text-xs leading-relaxed text-left">
                      "{customResponse}"
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl border border-white/80 shadow-sm max-h-[120px] overflow-y-auto no-scrollbar italic text-slate-500 text-xs leading-relaxed">
                  "{tracks[activeTrack].script}"
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-6">
              <button
                onClick={generateAndPlay}
                disabled={isGenerating || (activeTrack === 'custom' && !customQuestion)}
                className={`group relative px-12 py-5 rounded-full font-black text-lg transition-all shadow-2xl overflow-hidden ${isGenerating ? 'bg-slate-200 text-slate-400' : isPlaying ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'}`}
              >
                <div className="relative z-10 flex items-center gap-3">
                  {isGenerating ? (
                    <><div className="w-5 h-5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"></div> Synthesizing Coaching...</>
                  ) : isPlaying ? (
                    <><ICONS.X /> Terminate Briefing</>
                  ) : (
                    <><ICONS.Play /> {activeTrack === 'custom' ? 'Ask Coach' : 'Execute Strategy Brief'}</>
                  )}
                </div>
                {!isGenerating && !isPlaying && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>}
              </button>
              
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'}`}></span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPlaying ? 'Streaming Intelligence' : 'Ready to Synthesize'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes waveform {
          0%, 100% { transform: scaleY(0.4); opacity: 0.3; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        .animate-waveform {
          animation: waveform 0.5s ease-in-out infinite;
          transform-origin: bottom;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};