
import React, { useState, useRef } from 'react';
import { ICONS } from '../constants';
import { GoogleGenAI, Type } from '@google/genai';
import { MeetingContext } from '../types';

interface VideoGeneratorProps {
  context: MeetingContext;
}

type SynthesisMode = 'delivery-coach' | 'text-to-video' | 'extension';

interface CoachingAdvice {
  voiceTone: string;
  openingManeuver: string;
  answerStrategy: string;
  handMovements: string;
  bodyLanguage: string;
  eyeExpression: string;
  tacticalClosing: string;
}

export const VideoGenerator: React.FC<VideoGeneratorProps> = ({ context }) => {
  const [coachingQuestion, setCoachingQuestion] = useState("A prospect just told me our solution is 'too complex' for their mid-market team. How should I deliver a response that simplifies the value?");
  const [prompt, setPrompt] = useState(`A professional corporate executive delivering a high-stakes keynote, cinematic lighting, 8k resolution.`);
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
    setStatusMessage("Initializing Performance Studio...");

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let finalVeoPrompt = prompt;

      if (mode === 'delivery-coach') {
        setStatusMessage("Architecting Strategic Delivery Logic...");
        const coachResponse = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: `Act as an elite Speech, Body Language, and Sales Performance Coach. 
          
          STRATEGIC CONTEXT:
          - Seller: ${context.sellerNames} (${context.sellerCompany})
          - Prospect Stakeholders: ${context.clientNames} at ${context.clientCompany}
          - Target Persona: ${context.persona} (High priority on tailoring advice to this archetype)
          - Product/Solution: ${context.targetProducts} (${context.productDomain})
          - Meeting Focus: ${context.meetingFocus}
          
          USER INPUT (Question or Objection to Master): "${coachingQuestion}"
          
          Analyze the question's strategic weight within this specific context and provide a comprehensive delivery guide in JSON.
          
          SPECIFIC REQUIREMENTS:
          - voiceTone: Provide precise instructions for PACING (e.g., rhythmic vs steady), PITCH (e.g., lower register for gravitas), and VOCAL AUTHORITY (how to project confidence and certainty, especially for a ${context.persona} audience).
          - openingManeuver: Provide the exact first 5-10 words to seize the narrative, specifically mentioning a value driver relevant to ${context.clientCompany}.
          - answerStrategy: The psychological arc of the core response, designed to mitigate fears typical for a ${context.persona}.
          - handMovements: Suggest 2-3 specific SALES-CONTEXTUAL GESTURES (e.g., 'steeple for wisdom', 'open palms for transparency', 'counting on fingers for structure') that align with the required tone.
          - bodyLanguage: Provide highly actionable instructions on POSTURE (e.g., 'axial extension'), SHOULDER POSITIONING (e.g., 'broad but relaxed'), and LEANING (e.g., 'the tactical 5-degree forward lean') to project a commanding yet accessible professional presence.
          - eyeExpression: Gaze intensity and blinking rate to project honesty and focus.
          - tacticalClosing: How to wrap up the answer effectively to drive the next logical step (e.g., confirming understanding, a tactical micro-ask, or a pivot to a positive value statement), specifically tailored to the ${context.meetingFocus} objective.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                voiceTone: { type: Type.STRING },
                openingManeuver: { type: Type.STRING },
                answerStrategy: { type: Type.STRING },
                handMovements: { type: Type.STRING },
                bodyLanguage: { type: Type.STRING },
                eyeExpression: { type: Type.STRING },
                tacticalClosing: { type: Type.STRING }
              },
              required: ["voiceTone", "openingManeuver", "answerStrategy", "handMovements", "bodyLanguage", "eyeExpression", "tacticalClosing"]
            }
          }
        });

        const advice = JSON.parse(coachResponse.text || "{}");
        setCoachingAdvice(advice);
        
        finalVeoPrompt = `A high-fidelity cinematic 3D animation of a charismatic, professional human sales executive in a minimalist modern studio. 
        The coach is looking directly into the lens, actively explaining a strategy. 
        They are demonstrating mastered sales-specific hand gestures: ${advice.handMovements}. 
        Their body language is professional: ${advice.bodyLanguage}. 
        Their facial expression and eye focus are intense: ${advice.eyeExpression}. 
        Professional soft-box lighting, 4k ultra-detailed textures, realistic facial micro-expressions, 24fps.`;
      }

      setStatusMessage("Synthesizing Master Delivery Asset...");
      
      const generationConfig: any = {
        numberOfVideos: 1,
        resolution: resolution,
        aspectRatio: aspectRatio
      };

      const params: any = {
        model: 'veo-3.1-fast-generate-preview',
        prompt: finalVeoPrompt,
        config: generationConfig
      };

      if (mode === 'extension' && lastOperation?.response?.generatedVideos?.[0]?.video) {
        params.video = lastOperation.response.generatedVideos[0].video;
        params.config.resolution = '720p';
      }

      let operation = await ai.models.generateVideos(params);

      const loadingMessages = [
        "Simulating Vocal Resonance...",
        "Synthesizing Non-Verbal Gestures...",
        "Rendering Professional Persona...",
        "Applying Executive Aesthetic...",
        "Encoding High-Fidelity Performance...",
        "Finalizing Cognitive Masterclass..."
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
        setStatusMessage("Fetching Visual Payload...");
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!response.ok) throw new Error("Video asset fetch failed.");
        const blob = await response.blob();
        setVideoUrl(URL.createObjectURL(blob));
      } else {
        throw new Error("Synthesis completed but no video data was found.");
      }
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("entity was not found")) {
        await window.aistudio.openSelectKey();
        setError("API Session Reset. Please re-initiate synthesis.");
      } else {
        setError(err.message || "Synthesis process interrupted.");
      }
    } finally {
      setIsGenerating(false);
      setStatusMessage("");
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-[3rem] p-12 shadow-2xl overflow-hidden relative min-h-[850px] flex flex-col text-white">
      {/* Background Ambience */}
      <div className="absolute top-0 right-0 p-32 opacity-[0.02] pointer-events-none">
         <ICONS.Play className="w-96 h-96" />
      </div>

      <div className="flex items-center justify-between mb-12 relative z-10">
        <div className="flex items-center gap-6">
          <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-2xl shadow-indigo-500/20">
            <ICONS.Efficiency className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-3xl font-black tracking-tight">Performance Synthesis Studio</h3>
            <div className="flex items-center gap-3 mt-1.5">
               <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
               <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Master Delivery Engine • Powered by Veo</p>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
           <button 
             onClick={() => window.aistudio.openSelectKey()}
             className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-400 rounded-2xl transition-all"
           >
             API Project Settings
           </button>
           {videoUrl && (
             <button 
               onClick={() => { setVideoUrl(null); setCoachingAdvice(null); }}
               className="px-6 py-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-[9px] font-black uppercase tracking-widest text-indigo-400 rounded-2xl transition-all"
             >
               New Briefing
             </button>
           )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col relative z-10">
        {!videoUrl ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 flex-1">
            {/* Left Column: Configuration */}
            <div className="lg:col-span-8 space-y-8 flex flex-col">
               {/* Mode Selection */}
               <div className="flex gap-2 p-1.5 bg-slate-900 rounded-2xl border border-slate-800 w-fit">
                  <button onClick={() => setMode('delivery-coach')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'delivery-coach' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>Strategic Delivery Coach</button>
                  <button onClick={() => setMode('text-to-video')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'text-to-video' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>Standard Scenario</button>
                  {lastOperation && (
                    <button onClick={() => setMode('extension')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'extension' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>Extend Previous</button>
                  )}
               </div>

               <div className="p-1 bg-slate-900 rounded-[3rem] border border-slate-800/50 flex-1 flex flex-col min-h-[450px] group focus-within:border-indigo-500/50 transition-all shadow-inner">
                  <div className="p-10 pb-4 flex items-center justify-between">
                     <label className="text-[11px] font-black uppercase text-indigo-400 tracking-[0.4em]">
                        {mode === 'delivery-coach' ? 'Input Question / Objection to Master' : 'Scenario Description'}
                     </label>
                     <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-slate-600 uppercase">Analysis Engine: Gemini 3 Pro</span>
                     </div>
                  </div>
                  
                  {mode === 'delivery-coach' ? (
                    <textarea 
                      value={coachingQuestion}
                      onChange={(e) => setCoachingQuestion(e.target.value)}
                      disabled={isGenerating}
                      className="flex-1 w-full bg-transparent px-10 py-6 text-2xl outline-none transition-all resize-none leading-relaxed font-bold placeholder:text-slate-800"
                      placeholder="Enter the complex question or objection you are facing..."
                    />
                  ) : (
                    <textarea 
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      disabled={isGenerating}
                      className="flex-1 w-full bg-transparent px-10 py-6 text-2xl outline-none transition-all resize-none leading-relaxed font-bold placeholder:text-slate-800"
                      placeholder="Describe the cinematic scenario..."
                    />
                  )}
                  
                  <div className="px-10 pb-10">
                     <div className="p-8 bg-indigo-500/5 border border-indigo-500/10 rounded-[2rem] flex items-center gap-6">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg">
                           <ICONS.Brain className="w-6 h-6" />
                        </div>
                        <p className="text-xs text-indigo-200/60 font-medium leading-relaxed">
                           {mode === 'delivery-coach' 
                             ? "Our AI will analyze the strategic nuances of this question and synthesize an animated human coach to demonstrate the perfect delivery of the response, focusing on vocal authority and sales-specific gestures."
                             : "Synthesize a professional scenario to visualize your sales environment with high-fidelity cinematic detail."}
                        </p>
                     </div>
                  </div>
               </div>
            </div>

            {/* Right Column: Controls & Execution */}
            <div className="lg:col-span-4 space-y-8 flex flex-col">
               <div className="p-10 bg-slate-900 border border-white/5 rounded-[3rem] space-y-12">
                  <div className="space-y-6">
                     <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                       <ICONS.Efficiency className="w-3.5 h-3.5" /> Frame Aspect Ratio
                     </label>
                     <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setAspectRatio('16:9')} className={`py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${aspectRatio === '16:9' ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500'}`}>Landscape</button>
                        <button onClick={() => setAspectRatio('9:16')} className={`py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${aspectRatio === '9:16' ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500'}`}>Portrait</button>
                     </div>
                  </div>

                  <div className="space-y-6">
                     <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                       <ICONS.Trophy className="w-3.5 h-3.5" /> Output Resolution
                     </label>
                     <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setResolution('720p')} className={`py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${resolution === '720p' ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500'}`}>HD (720p)</button>
                        <button onClick={() => setResolution('1080p')} className={`py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${resolution === '1080p' ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500'}`}>UHD (1080p)</button>
                     </div>
                  </div>
               </div>

               {error && (
                 <div className="p-8 bg-rose-500/10 border border-rose-500/20 rounded-[2rem] animate-in slide-in-from-top-4">
                   <p className="text-xs font-bold text-rose-400">{error}</p>
                 </div>
               )}

               <div className="mt-auto pt-6 flex flex-col gap-4">
                  <button
                    onClick={handleGenerateVideo}
                    disabled={isGenerating || (mode === 'delivery-coach' ? !coachingQuestion.trim() : !prompt.trim())}
                    className={`group relative overflow-hidden flex flex-col items-center justify-center gap-2 py-10 rounded-[2.5rem] font-black text-xl shadow-2xl transition-all active:scale-95 ${!isGenerating && (mode === 'delivery-coach' ? coachingQuestion.trim() : prompt.trim()) ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20' : 'bg-slate-900 text-slate-700 cursor-not-allowed border border-white/5'}`}
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-2"></div>
                        <span className="text-[10px] font-black tracking-widest uppercase animate-pulse">{statusMessage}</span>
                      </>
                    ) : (
                      <>
                        <ICONS.Play className="w-8 h-8 mb-2" />
                        <span className="uppercase tracking-widest text-sm">
                           {mode === 'delivery-coach' ? 'Synthesize Coach' : 'Synthesize Scene'}
                        </span>
                      </>
                    )}
                    {!isGenerating && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>}
                  </button>
                  <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.4em] text-center">Neural Synth Window: 3-8 Minutes</p>
               </div>
            </div>
          </div>
        ) : (
          <div className="space-y-12 animate-in zoom-in-95 duration-1000 flex-1 flex flex-col pb-24">
            <div className="flex flex-col lg:flex-row gap-16 items-start">
              {/* Video Interface */}
              <div className={`flex-1 rounded-[4rem] overflow-hidden border-[16px] border-slate-900 shadow-[0_60px_120px_-30px_rgba(0,0,0,0.8)] bg-black relative group ${aspectRatio === '9:16' ? 'max-w-md mx-auto aspect-[9/16]' : 'aspect-video'}`}>
                <video 
                  src={videoUrl} 
                  controls 
                  autoPlay 
                  loop 
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-12 left-12 flex items-center gap-4 px-8 py-4 bg-black/60 backdrop-blur-3xl rounded-[1.5rem] border border-white/10">
                   <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.8)]"></div>
                   <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Master Asset Synchronized</span>
                </div>
              </div>

              {/* Coaching Intelligence Panel (Explicitly mapping the core pillars) */}
              {mode === 'delivery-coach' && coachingAdvice && (
                <div className="w-full lg:w-[480px] space-y-6">
                  <div className="p-10 bg-indigo-600 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                     <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12 transition-transform group-hover:rotate-0 duration-700"><ICONS.Speaker className="w-20 h-20" /></div>
                     <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-200 mb-4">01 • Vocal Pitch & Authority</h5>
                     <p className="text-2xl font-black leading-tight tracking-tight">{coachingAdvice.voiceTone}</p>
                  </div>

                  <div className="bg-slate-900 border border-white/5 rounded-[3rem] p-10 space-y-10 shadow-2xl">
                     <div className="space-y-4">
                        <h5 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 flex items-center gap-3">
                           <div className="w-2 h-2 rounded-full bg-emerald-500"></div> 02 • Opening Hook Protocol
                        </h5>
                        <p className="text-lg font-bold italic text-slate-200 leading-relaxed">“{coachingAdvice.openingManeuver}”</p>
                     </div>

                     <div className="grid grid-cols-2 gap-10">
                        <div className="space-y-3">
                           <h5 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600">03 • Sales Gestures</h5>
                           <p className="text-xs font-bold text-indigo-400 leading-relaxed">{coachingAdvice.handMovements}</p>
                        </div>
                        <div className="space-y-3">
                           <h5 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600">04 • Executive Presence</h5>
                           <p className="text-xs font-bold text-indigo-400 leading-relaxed">{coachingAdvice.bodyLanguage}</p>
                        </div>
                     </div>

                     <div className="space-y-4 pt-8 border-t border-white/5">
                        <div className="flex items-center justify-between">
                           <h5 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600">05 • Gaze Intensity</h5>
                           <span className="text-[8px] font-black text-indigo-500 uppercase">Focus Lock</span>
                        </div>
                        <p className="text-xs font-medium text-slate-400 leading-relaxed italic">{coachingAdvice.eyeExpression}</p>
                     </div>

                     <div className="space-y-4 pt-8 border-t border-white/5">
                        <h5 className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-500">06 • Strategic Arc Logic</h5>
                        <p className="text-sm font-bold text-slate-300 leading-relaxed">{coachingAdvice.answerStrategy}</p>
                     </div>

                     <div className="space-y-4 pt-8 border-t border-white/5">
                        <h5 className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-500">07 • Tactical Closing</h5>
                        <p className="text-sm font-bold text-slate-200 leading-relaxed italic">“{coachingAdvice.tacticalClosing}”</p>
                     </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
               <div className="lg:col-span-2 p-16 bg-slate-900 rounded-[4rem] border border-white/5 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-12 opacity-[0.02] group-hover:scale-110 transition-transform duration-1000"><ICONS.Sparkles className="w-64 h-64" /></div>
                  <div className="flex items-center gap-5 mb-10">
                     <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl"><ICONS.Document className="w-6 h-6" /></div>
                     <h4 className="text-[12px] font-black uppercase text-indigo-500 tracking-[0.4em]">Synthesis Origin Briefing</h4>
                  </div>
                  <p className="text-3xl font-black text-slate-100 leading-tight tracking-tight italic border-l-8 border-indigo-600 pl-12">
                     “{mode === 'delivery-coach' ? coachingQuestion : prompt}”
                  </p>
               </div>

               <div className="p-16 bg-white text-slate-950 rounded-[4rem] flex flex-col justify-center items-center text-center shadow-2xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-indigo-50 scale-0 group-hover:scale-100 transition-transform duration-1000 origin-center rounded-full opacity-40"></div>
                  <div className="relative z-10">
                    <div className="p-6 bg-indigo-600 text-white rounded-3xl mb-10 inline-block shadow-2xl shadow-indigo-100">
                       <ICONS.Efficiency className="w-10 h-10" />
                    </div>
                    <h4 className="text-[11px] font-black uppercase text-slate-500 tracking-[0.3em] mb-3">Enterprise Deployment</h4>
                    <p className="text-2xl font-black mb-12 leading-tight">Master Asset Ready for Distribution</p>
                    <a 
                      href={videoUrl} 
                      download={`Strategic-Coaching-${context.clientCompany.replace(/\s+/g, '-')}.mp4`}
                      className="w-full inline-block py-8 bg-slate-950 text-white rounded-[2rem] text-[11px] font-black uppercase tracking-[0.3em] shadow-2xl hover:bg-indigo-600 transition-all hover:-translate-y-2 active:translate-y-0"
                    >
                      Download 4K Master
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
