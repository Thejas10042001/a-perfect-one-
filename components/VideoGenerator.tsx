
import React, { useState, useRef } from 'react';
import { ICONS } from '../constants';
import { GoogleGenAI, Type } from '@google/genai';

interface VideoGeneratorProps {
  clientCompany: string;
}

type SynthesisMode = 'text-to-video' | 'delivery-coach' | 'extension';

interface CoachingAdvice {
  voiceTone: string;
  startingStrategy: string;
  answerStructure: string;
  handMovements: string;
  bodyLanguage: string;
  eyeExpression: string;
  keyTakeaway: string;
}

export const VideoGenerator: React.FC<VideoGeneratorProps> = ({ clientCompany }) => {
  const [prompt, setPrompt] = useState(`A cinematic 3D animation showcasing enterprise scalability and digital transformation for ${clientCompany}, futuristic aesthetic, professional lighting, 4k.`);
  const [coachingQuestion, setCoachingQuestion] = useState("The prospect is concerned about the implementation timeline. How should I structure my response to build trust and mitigate risk?");
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [lastOperation, setLastOperation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [mode, setMode] = useState<SynthesisMode>('delivery-coach');
  const [coachingAdvice, setCoachingAdvice] = useState<CoachingAdvice | null>(null);

  const handleGenerateVideo = async () => {
    if (!(await window.aistudio.hasSelectedApiKey())) {
      await window.aistudio.openSelectKey();
    }

    setIsGenerating(true);
    setError(null);
    setVideoUrl(null);
    setCoachingAdvice(null);
    setStatusMessage("Initializing Neural Pipeline...");

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Step 1: If in coaching mode, generate the strategic text content first
      if (mode === 'delivery-coach') {
        setStatusMessage("Analyzing Strategic Delivery Logistics...");
        const textResponse = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: `ACT AS A WORLD-CLASS SALES DELIVERY COACH. 
          The user is preparing to answer this specific question for ${clientCompany}: "${coachingQuestion}"
          
          Provide detailed coaching in JSON format. 
          Include exactly: 
          - voiceTone: How the voice should sound (pacing, inflection).
          - startingStrategy: How to open the answer.
          - answerStructure: A 3-part framework for the response.
          - handMovements: Specific gestures to use.
          - bodyLanguage: Posture and movement guidance.
          - eyeExpression: Where to look and what emotion to convey.
          - keyTakeaway: The core message that must land.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                voiceTone: { type: Type.STRING },
                startingStrategy: { type: Type.STRING },
                answerStructure: { type: Type.STRING },
                handMovements: { type: Type.STRING },
                bodyLanguage: { type: Type.STRING },
                eyeExpression: { type: Type.STRING },
                keyTakeaway: { type: Type.STRING }
              },
              required: ["voiceTone", "startingStrategy", "answerStructure", "handMovements", "bodyLanguage", "eyeExpression", "keyTakeaway"]
            }
          }
        });
        
        const advice = JSON.parse(textResponse.text || "{}");
        setCoachingAdvice(advice);
      }

      // Step 2: Prepare Veo Prompt
      let veoPrompt = prompt;
      if (mode === 'delivery-coach') {
        veoPrompt = `A high-fidelity cinematic 3D animation of a professional, charismatic human sales coach (charismatic male avatar in a modern minimalist studio) gesturing masterfully while explaining strategic communication for ${clientCompany}. Soft key lighting, ultra-realistic skin and fabric textures, 4k. Direct eye contact with the camera.`;
      }

      const generationConfig: any = {
        numberOfVideos: 1,
        resolution: resolution,
        aspectRatio: aspectRatio
      };

      const params: any = {
        model: 'veo-3.1-fast-generate-preview',
        prompt: veoPrompt,
        config: generationConfig
      };

      if (mode === 'extension' && lastOperation?.response?.generatedVideos?.[0]?.video) {
        params.video = lastOperation.response.generatedVideos[0].video;
        params.config.resolution = '720p';
      }

      setStatusMessage("Synthesizing Temporal Latent Space...");
      
      let operation;
      try {
        operation = await ai.models.generateVideos(params);
      } catch (genErr: any) {
        if (genErr.message?.includes("429") || genErr.message?.includes("RESOURCE_EXHAUSTED")) {
          throw new Error("Quota exhausted. Check AI Studio billing.");
        }
        if (genErr.message?.includes("Requested entity was not found")) {
          await window.aistudio.openSelectKey();
          throw new Error("API configuration reset. Please re-select your key.");
        }
        throw genErr;
      }

      const loadingMessages = [
        "Synthesizing Strategic Delivery Face...",
        "Rendering Professional Avatar...",
        "Simulating Masterful Gestures...",
        "Encoding High-Fidelity Master...",
        "Optimizing Narrative Fluidity...",
        "Finalizing Visual Coaching Asset..."
      ];
      
      let msgIdx = 0;
      while (!operation.done) {
        setStatusMessage(loadingMessages[msgIdx % loadingMessages.length]);
        msgIdx++;
        await new Promise(resolve => setTimeout(resolve, 10000));
        const pollingAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        operation = await pollingAi.operations.getVideosOperation({ operation: operation });
      }

      setLastOperation(operation);
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      
      if (downloadLink) {
        setStatusMessage("Fetching Coaching Payload...");
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!response.ok) throw new Error("Fetch failed.");
        const blob = await response.blob();
        setVideoUrl(URL.createObjectURL(blob));
      } else {
        throw new Error("Generation completed but no URI returned.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Synthesis failed.");
    } finally {
      setIsGenerating(false);
      setStatusMessage("");
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-12 shadow-2xl overflow-hidden relative min-h-[800px] flex flex-col text-white">
      <div className="absolute top-0 right-0 p-24 opacity-[0.03] pointer-events-none">
         <ICONS.Play className="w-96 h-96" />
      </div>

      <div className="flex items-center justify-between mb-12 relative z-10">
        <div className="flex items-center gap-6">
          <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-2xl shadow-indigo-500/20">
            <ICONS.Efficiency className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-3xl font-black tracking-tight">Video Synthesis Studio</h3>
            <div className="flex items-center gap-3 mt-1.5">
               <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
               <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Masterclass Delivery Engine</p>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
           <button 
             onClick={() => window.aistudio.openSelectKey()}
             className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-400 rounded-xl transition-all"
           >
             Project Settings
           </button>
           {videoUrl && (
             <button 
               onClick={() => { setVideoUrl(null); setCoachingAdvice(null); }}
               className="px-5 py-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-[9px] font-black uppercase tracking-widest text-indigo-400 rounded-xl transition-all"
             >
               New Briefing
             </button>
           )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col relative z-10">
        {!videoUrl ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 flex-1">
            <div className="lg:col-span-8 space-y-8 flex flex-col">
               <div className="flex gap-2 p-1.5 bg-slate-800/50 rounded-2xl border border-slate-700 w-fit">
                  <button onClick={() => setMode('delivery-coach')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'delivery-coach' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Strategic Delivery Coach</button>
                  <button onClick={() => setMode('text-to-video')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'text-to-video' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Standard Text-to-Video</button>
                  {lastOperation && (
                    <button onClick={() => setMode('extension')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'extension' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Extend Previous</button>
                  )}
               </div>

               <div className="p-1 bg-slate-800/50 rounded-[3rem] border border-slate-700/50 flex-1 flex flex-col min-h-[400px] group focus-within:border-indigo-500/50 transition-all">
                  <div className="p-10 pb-4 flex items-center justify-between">
                     <label className="text-[11px] font-black uppercase text-indigo-400 tracking-[0.3em]">
                       {mode === 'delivery-coach' ? 'Sales Question to Rehearse' : 'Cinematic Directive'}
                     </label>
                     <span className="text-[9px] font-bold text-slate-500 uppercase">Analysis Level: High Fidelity</span>
                  </div>
                  
                  {mode === 'delivery-coach' ? (
                    <textarea 
                      value={coachingQuestion}
                      onChange={(e) => setCoachingQuestion(e.target.value)}
                      disabled={isGenerating}
                      className="flex-1 w-full bg-transparent px-10 py-6 text-2xl outline-none transition-all resize-none leading-relaxed font-bold placeholder:text-slate-700"
                      placeholder="Enter the customer question or objection you want to master..."
                    />
                  ) : (
                    <textarea 
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      disabled={isGenerating}
                      className="flex-1 w-full bg-transparent px-10 py-6 text-2xl outline-none transition-all resize-none leading-relaxed font-bold placeholder:text-slate-700"
                      placeholder="Describe the visual narrative, lighting, and camera movement..."
                    />
                  )}
                  
                  {mode === 'delivery-coach' && (
                    <div className="px-10 pb-10">
                      <div className="p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center gap-4">
                         <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                            <ICONS.Brain className="w-5 h-5" />
                         </div>
                         <p className="text-xs text-indigo-200/80 font-medium">
                           The Delivery Coach will analyze your question to provide exact voice, hand, and eye guidance while generating a cinematic training visual.
                         </p>
                      </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="lg:col-span-4 space-y-8 flex flex-col">
               <div className="p-8 bg-slate-800/30 border border-white/5 rounded-[2.5rem] space-y-10">
                  <div className="space-y-5">
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                       <ICONS.Efficiency className="w-3.5 h-3.5" /> Output Ratio
                     </label>
                     <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setAspectRatio('16:9')} className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${aspectRatio === '16:9' ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}>Landscape</button>
                        <button onClick={() => setAspectRatio('9:16')} className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${aspectRatio === '9:16' ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}>Portrait</button>
                     </div>
                  </div>

                  <div className="space-y-5">
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                       <ICONS.Trophy className="w-3.5 h-3.5" /> Resolution
                     </label>
                     <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setResolution('720p')} className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${resolution === '720p' ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}>HD (720p)</button>
                        <button onClick={() => setResolution('1080p')} className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${resolution === '1080p' ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}>UHD (1080p)</button>
                     </div>
                  </div>
               </div>

               {error && (
                 <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl animate-in slide-in-from-top-2">
                   <p className="text-xs font-bold text-rose-400">{error}</p>
                 </div>
               )}

               <div className="mt-auto pt-6 flex flex-col gap-4">
                  <button
                    onClick={handleGenerateVideo}
                    disabled={isGenerating || (mode === 'delivery-coach' ? !coachingQuestion.trim() : !prompt.trim())}
                    className={`group relative overflow-hidden flex items-center justify-center gap-4 py-8 rounded-[2rem] font-black text-xl shadow-2xl transition-all active:scale-95 ${!isGenerating && (mode === 'delivery-coach' ? coachingQuestion.trim() : prompt.trim()) ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                  >
                    {isGenerating ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                        <span className="text-[10px] font-black tracking-widest uppercase animate-pulse">{statusMessage}</span>
                      </div>
                    ) : (
                      <>
                        <ICONS.Play className="w-6 h-6" />
                        {mode === 'delivery-coach' ? 'Initiate Coaching Session' : 'Synthesize Master'}
                      </>
                    )}
                    {!isGenerating && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>}
                  </button>
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.4em] text-center">Synthesis: ~3-8 Minutes</p>
               </div>
            </div>
          </div>
        ) : (
          <div className="space-y-12 animate-in zoom-in-95 duration-700 flex-1 flex flex-col pb-20">
            <div className="flex flex-col lg:flex-row gap-12 items-start">
               {/* Video Section */}
               <div className={`flex-1 rounded-[3.5rem] overflow-hidden border-[12px] border-slate-800 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.6)] bg-black relative group ${aspectRatio === '9:16' ? 'max-w-md mx-auto aspect-[9/16]' : 'aspect-video'}`}>
                  <video 
                    src={videoUrl} 
                    controls 
                    autoPlay 
                    loop 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-10 left-10 flex items-center gap-4 px-6 py-3 bg-black/60 backdrop-blur-2xl rounded-2xl border border-white/10">
                     <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.8)]"></div>
                     <span className="text-[11px] font-black text-white uppercase tracking-widest">Visual Coaching Synchronized</span>
                  </div>
               </div>

               {/* Coaching Advice Panel (Only in Coach Mode) */}
               {mode === 'delivery-coach' && coachingAdvice && (
                 <div className="w-full lg:w-[450px] space-y-6">
                    <div className="p-8 bg-indigo-600 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                       <div className="absolute top-0 right-0 p-6 opacity-10"><ICONS.Speaker className="w-12 h-12" /></div>
                       <h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-3">Vocal Protocol</h5>
                       <p className="text-xl font-bold leading-tight">{coachingAdvice.voiceTone}</p>
                    </div>

                    <div className="bg-slate-800/40 rounded-[2.5rem] border border-white/5 p-8 space-y-8">
                       <div>
                          <h5 className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Starting Maneuver
                          </h5>
                          <p className="text-sm font-medium leading-relaxed italic text-slate-200">"{coachingAdvice.startingStrategy}"</p>
                       </div>

                       <div className="grid grid-cols-2 gap-6">
                          <div>
                             <h5 className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Hands & Gestures</h5>
                             <p className="text-[11px] font-bold text-indigo-300 leading-snug">{coachingAdvice.handMovements}</p>
                          </div>
                          <div>
                             <h5 className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Eye Contact</h5>
                             <p className="text-[11px] font-bold text-indigo-300 leading-snug">{coachingAdvice.eyeExpression}</p>
                          </div>
                       </div>

                       <div className="pt-6 border-t border-white/5">
                          <h5 className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Answer Structure</h5>
                          <p className="text-xs font-semibold text-slate-300 leading-relaxed whitespace-pre-line">{coachingAdvice.answerStructure}</p>
                       </div>
                    </div>
                 </div>
               )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
               <div className="lg:col-span-2 p-12 bg-slate-800/40 rounded-[3rem] border border-white/5 backdrop-blur-md">
                  <div className="flex items-center gap-4 mb-6">
                     <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl"><ICONS.Chat className="w-5 h-5" /></div>
                     <h4 className="text-[12px] font-black uppercase text-indigo-400 tracking-widest">Coaching Brief</h4>
                  </div>
                  <p className="text-xl font-bold text-slate-200 leading-relaxed italic border-l-4 border-indigo-600 pl-8">
                    {mode === 'delivery-coach' ? coachingQuestion : prompt}
                  </p>
                  
                  {coachingAdvice && (
                    <div className="mt-10 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
                       <div className="flex items-center gap-4">
                          <ICONS.Trophy className="text-emerald-400 w-5 h-5" />
                          <div>
                             <p className="text-[9px] font-black uppercase text-emerald-500 tracking-widest">Core Winning Takeaway</p>
                             <p className="text-sm font-bold text-slate-100">{coachingAdvice.keyTakeaway}</p>
                          </div>
                       </div>
                    </div>
                  )}
               </div>

               <div className="p-12 bg-white text-slate-900 rounded-[3rem] flex flex-col justify-center items-center text-center shadow-2xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-indigo-50 scale-0 group-hover:scale-100 transition-transform duration-700 origin-center rounded-full opacity-50"></div>
                  <div className="relative z-10">
                    <div className="p-5 bg-indigo-600 text-white rounded-2xl mb-8 inline-block shadow-xl shadow-indigo-100">
                       <ICONS.Play className="w-8 h-8" />
                    </div>
                    <h4 className="text-[12px] font-black uppercase text-slate-400 tracking-widest mb-2">Training Asset</h4>
                    <p className="text-2xl font-black mb-10 leading-tight">Download Delivery Performance Module</p>
                    <a 
                      href={videoUrl} 
                      download={`Strategic-Coaching-${clientCompany.replace(/\s+/g, '-')}.mp4`}
                      className="w-full inline-block py-6 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-indigo-700 transition-all hover:-translate-y-1 active:translate-y-0"
                    >
                      Export MP4 Master
                    </a>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
