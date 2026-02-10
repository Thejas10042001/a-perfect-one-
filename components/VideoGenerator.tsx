
import React, { useState } from 'react';
import { ICONS } from '../constants';
import { GoogleGenAI } from '@google/genai';

interface VideoGeneratorProps {
  clientCompany: string;
}

export const VideoGenerator: React.FC<VideoGeneratorProps> = ({ clientCompany }) => {
  const [prompt, setPrompt] = useState(`A high-fidelity cinematic 3D animation of a futuristic enterprise command center displaying real-time growth analytics for ${clientCompany}, professional lighting, 4k ultra-detailed.`);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const handleGenerateVideo = async () => {
    // Check if key is selected. If not, open dialog and proceed immediately (assume success per guidelines)
    if (!(await window.aistudio.hasSelectedApiKey())) {
      await window.aistudio.openSelectKey();
    }

    setIsGenerating(true);
    setError(null);
    setStatusMessage("Initializing Neural Video Core...");

    try {
      // GUIDELINE: Create a new GoogleGenAI instance right before making an API call to ensure it uses the most up-to-date API key.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      setStatusMessage("Synthesizing Temporal Latent Space...");
      
      let operation;
      try {
        operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: prompt,
          config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: '16:9'
          }
        });
      } catch (genErr: any) {
        // If 429 error, it's a quota issue
        if (genErr.message?.includes("429") || genErr.message?.includes("RESOURCE_EXHAUSTED")) {
          throw new Error("Video synthesis quota exhausted. Please check your AI Studio billing plan or try again later.");
        }
        // If "Requested entity was not found", key selection state might be invalid
        if (genErr.message?.includes("Requested entity was not found")) {
          await window.aistudio.openSelectKey();
          throw new Error("API configuration reset. Please re-select your paid API key and try again.");
        }
        throw genErr;
      }

      const loadingMessages = [
        "Synthesizing Temporal Latent Space...",
        "Rendering Volumetric Lighting...",
        "Optimizing Strategic Narrative Flow...",
        "Finalizing Cognitive Asset Export...",
        "Applying Enterprise Aesthetic Filters..."
      ];
      
      let messageIdx = 0;

      while (!operation.done) {
        setStatusMessage(loadingMessages[messageIdx % loadingMessages.length]);
        messageIdx++;
        await new Promise(resolve => setTimeout(resolve, 10000));
        // Use fresh ai instance inside polling if necessary to ensure persistent key availability
        const pollingAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        operation = await pollingAi.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        setStatusMessage("Fetching Encoded Payload...");
        // GUIDELINE: Must append API key when fetching from the download link.
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        const blob = await response.blob();
        setVideoUrl(URL.createObjectURL(blob));
      } else {
        throw new Error("Video generation completed but no video URI was returned. Verify your billing account status.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate strategic video asset.");
    } finally {
      setIsGenerating(false);
      setStatusMessage("");
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-xl overflow-hidden relative min-h-[600px] flex flex-col">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
            <ICONS.Play />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Strategic Asset Synthesis</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Veo 3.1 Neural Video Rendering</p>
          </div>
        </div>
        {videoUrl && (
          <button 
            onClick={() => { setVideoUrl(null); setPrompt(`A cinematic aerial shot of a modern glass corporate headquarters with a glowing '${clientCompany}' holographic sign, dusk lighting, 4k ultra-realistic`); }}
            className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
          >
            New Generation
          </button>
        )}
      </div>

      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
        {!videoUrl ? (
          <div className="space-y-8 flex-1 flex flex-col">
            <div className="p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] shadow-inner flex-1 flex flex-col">
               <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-4">Rendering Prompt</label>
               <textarea 
                 value={prompt}
                 onChange={(e) => setPrompt(e.target.value)}
                 disabled={isGenerating}
                 className="flex-1 w-full bg-white border border-slate-200 rounded-2xl p-6 text-sm focus:border-indigo-500 outline-none transition-all resize-none leading-relaxed font-medium"
                 placeholder="Describe the cinematic strategic asset..."
               />
            </div>

            {error && (
              <div className="p-6 bg-rose-50 border border-rose-100 rounded-[2rem] text-rose-600 space-y-2">
                <div className="flex items-center gap-2">
                  <ICONS.Security className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Synthesis Blocked</span>
                </div>
                <p className="text-xs font-bold">{error}</p>
                <p className="text-[9px] text-rose-400 uppercase tracking-widest leading-relaxed">Ensure you have selected a valid API key from a project with billing enabled.</p>
              </div>
            )}

            <div className="flex flex-col items-center gap-4 py-4">
              <button
                onClick={handleGenerateVideo}
                disabled={isGenerating || !prompt.trim()}
                className={`
                  flex items-center gap-3 px-16 py-6 rounded-full font-black text-xl shadow-2xl transition-all
                  ${!isGenerating && prompt.trim() 
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95 shadow-indigo-200 cursor-pointer' 
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}
                `}
              >
                {isGenerating ? (
                  <>
                    <div className="w-6 h-6 border-4 border-slate-400 border-t-white rounded-full animate-spin"></div>
                    <span className="animate-pulse">{statusMessage}</span>
                  </>
                ) : (
                  <>
                    <ICONS.Play className="w-6 h-6" />
                    Synthesize Cinematic Asset
                  </>
                )}
              </button>
              <div className="flex flex-col items-center gap-1">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">
                  Approx. 2-5 minutes for full neural rendering
                </p>
                <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest underline cursor-pointer" onClick={() => window.aistudio.openSelectKey()}>
                  Switch API Key / Check Billing
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in zoom-in-95 duration-700 flex-1 flex flex-col">
            <div className="rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl bg-black aspect-video relative group">
              <video 
                src={videoUrl} 
                controls 
                autoPlay 
                loop 
                className="w-full h-full object-cover"
              />
              <div className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/20">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                 <span className="text-[10px] font-black text-white uppercase tracking-widest">Neural Render Verified</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
               <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100">
                  <h4 className="text-[10px] font-black uppercase text-indigo-600 tracking-widest mb-2">Prompt Heritage</h4>
                  <p className="text-xs text-slate-700 font-medium italic">"{prompt}"</p>
               </div>
               <div className="p-6 bg-slate-900 text-white rounded-3xl flex flex-col justify-center text-center">
                  <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Strategic Utility</h4>
                  <p className="text-sm font-bold">Incorporate into Executive Kickoff Deck</p>
                  <div className="mt-4 flex justify-center">
                     <a 
                       href={videoUrl} 
                       download={`StrategicAsset-${clientCompany}.mp4`}
                       className="px-6 py-2 bg-white text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all"
                     >
                       Download Master File
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
