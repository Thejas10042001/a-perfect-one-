
import React, { useState, useRef, useMemo } from 'react';
import { AnalysisResult, Citation, UploadedFile, BuyerSnapshot, MeetingContext, CompetitorInsight, MatrixItem } from '../types';
import { ICONS } from '../constants';
import { generatePitchAudio, decodeAudioData } from '../services/geminiService';

interface AnalysisViewProps {
  result: AnalysisResult;
  files: UploadedFile[];
  context: MeetingContext;
}

const VOICES = [
  { name: 'Kore', label: 'Pro Male' },
  { name: 'Puck', label: 'High Energy' },
  { name: 'Charon', label: 'Deep Authority' },
  { name: 'Zephyr', label: 'Calm Strategist' },
];

const CognitiveRadarChart = ({ data, size = 320 }: { data: { label: string, value: number }[], size?: number }) => {
  const center = size / 2;
  const radius = size * 0.35;
  const angleStep = (Math.PI * 2) / data.length;

  const points = data.map((d, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (d.value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
      labelX: center + (radius + 45) * Math.cos(angle),
      labelY: center + (radius + 45) * Math.sin(angle),
    };
  });

  const polygonPath = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="relative flex items-center justify-center p-8">
      <svg width={size + 160} height={size + 100} className="overflow-visible drop-shadow-xl">
        <defs>
          <radialGradient id="radarGrad">
            <stop offset="0%" stopColor="rgba(79, 70, 229, 0.4)" />
            <stop offset="100%" stopColor="rgba(79, 70, 229, 0.05)" />
          </radialGradient>
        </defs>
        {[0.2, 0.4, 0.6, 0.8, 1].map((r, idx) => (
          <circle key={idx} cx={center} cy={center} r={radius * r} fill={idx === 4 ? "url(#radarGrad)" : "none"} stroke="rgba(79, 70, 229, 0.1)" strokeWidth="1" />
        ))}
        {data.map((_, i) => (
          <line key={i} x1={center} y1={center} x2={center + radius * Math.cos(i * angleStep - Math.PI / 2)} y2={center + radius * Math.sin(i * angleStep - Math.PI / 2)} stroke="rgba(79, 70, 229, 0.15)" strokeWidth="1" />
        ))}
        <polygon points={polygonPath} fill="rgba(79, 70, 229, 0.3)" stroke="rgba(79, 70, 229, 0.8)" strokeWidth="3" />
        {data.map((d, i) => (
          <text key={i} x={points[i].labelX} y={points[i].labelY} textAnchor="middle" className="text-[9px] font-black uppercase fill-slate-500 tracking-widest">{d.label}</text>
        ))}
      </svg>
    </div>
  );
};

const SWOTItem = ({ label, items, color, symbol }: { label: string, items: string[], color: string, symbol: string }) => (
  <div className={`p-5 rounded-3xl bg-${color}-50/30 border border-${color}-100/50 flex flex-col h-full`}>
    <div className="flex items-center gap-2 mb-3">
       <div className={`w-6 h-6 rounded-lg bg-${color}-500 text-white flex items-center justify-center font-black text-[10px]`}>{symbol}</div>
       <h5 className={`text-[10px] font-black uppercase tracking-widest text-${color}-600`}>{label}</h5>
    </div>
    <ul className="space-y-2">
      {items.map((item, idx) => (
        <li key={idx} className="flex gap-2 text-[10px] text-slate-600 leading-relaxed font-medium">
          <span className={`text-${color}-500 mt-1 shrink-0`}>•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </div>
);

const CompetitorCard = ({ comp, name }: { comp: CompetitorInsight, name: string }) => (
  <div className="p-10 rounded-[4rem] bg-white border border-slate-100 hover:border-indigo-300 hover:shadow-[0_40px_80px_-15px_rgba(79,70,229,0.12)] transition-all duration-700 group flex flex-col h-full relative overflow-hidden">
    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-10 transition-opacity">
       <ICONS.Trophy className="w-48 h-48" />
    </div>
    
    <div className="flex items-center justify-between mb-8 relative z-10">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-xl shadow-xl shadow-slate-200">{name[0]}</div>
        <div>
           <h4 className="text-2xl font-black text-slate-900 tracking-tight">{name}</h4>
           <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${comp.threatProfile === 'Direct' ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{comp.threatProfile} Threat Profile</span>
           </div>
        </div>
      </div>
      <div className="text-right">
         <p className="text-[9px] font-black uppercase text-indigo-500 tracking-widest mb-1">Our Displacement Wedge</p>
         <p className="text-sm font-bold text-slate-900 border-b-2 border-indigo-100 pb-1">{comp.ourWedge}</p>
      </div>
    </div>

    <p className="text-xs text-slate-500 font-medium mb-8 leading-relaxed italic border-l-4 border-slate-100 pl-4">“{comp.overview}”</p>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
      <SWOTItem label="Strengths" items={comp.strengths || []} color="emerald" symbol="S" />
      <SWOTItem label="Weaknesses" items={comp.weaknesses || []} color="rose" symbol="W" />
      <SWOTItem label="Opportunities" items={comp.opportunities || []} color="indigo" symbol="O" />
      <SWOTItem label="Threats" items={comp.threats || []} color="amber" symbol="T" />
    </div>

    <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
       <div className="flex items-center gap-2">
          <ICONS.Document className="w-3 h-3 text-slate-300" />
          <span className="text-[8px] font-bold text-slate-400 truncate max-w-[150px]">{comp.citation.sourceFile}</span>
       </div>
       <button className="text-[9px] font-black uppercase text-indigo-600 tracking-widest hover:text-indigo-800 transition-colors">View Citation Details</button>
    </div>
  </div>
);

export const AnalysisView: React.FC<AnalysisViewProps> = ({ result, files, context }) => {
  const [highlightedSnippet, setHighlightedSnippet] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const radarData = useMemo(() => [
    { label: "Risk Tolerance", value: result.snapshot.metrics.riskToleranceValue },
    { label: "Strategic Focus", value: result.snapshot.metrics.strategicPriorityFocus },
    { label: "Analytical Depth", value: result.snapshot.metrics.analyticalDepth },
    { label: "Directness", value: result.snapshot.metrics.directness },
    { label: "Innovation", value: result.snapshot.metrics.innovationAppetite },
  ], [result.snapshot]);

  const evidenceIndex = useMemo(() => {
    const list: { source: string; snippet: string; category: string }[] = [];
    if (result.snapshot.roleCitation) list.push({ source: result.snapshot.roleCitation.sourceFile, snippet: result.snapshot.roleCitation.snippet, category: 'Persona' });
    result.snapshot.priorities.forEach(p => list.push({ source: p.citation.sourceFile, snippet: p.citation.snippet, category: 'Priority' }));
    result.groundMatrix?.forEach(m => list.push({ source: m.evidence.sourceFile, snippet: m.evidence.snippet, category: 'Ground Fact' }));
    result.objectionHandling.forEach(o => list.push({ source: o.citation.sourceFile, snippet: o.citation.snippet, category: 'Objection Defense' }));
    result.documentInsights.entities.forEach(e => list.push({ source: e.citation.sourceFile, snippet: e.citation.snippet, category: 'Entity Discovery' }));
    return list;
  }, [result]);

  const playAudioForText = async (text: string, id: string) => {
    if (playingAudioId === id) { audioSourceRef.current?.stop(); setPlayingAudioId(null); return; }
    setIsGeneratingAudio(true);
    setPlayingAudioId(id);
    try {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const bytes = await generatePitchAudio(text, selectedVoice);
      if (!bytes) throw new Error();
      const buffer = await decodeAudioData(bytes, audioContextRef.current, 24000, 1);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setPlayingAudioId(null);
      audioSourceRef.current?.stop();
      audioSourceRef.current = source;
      source.start();
    } catch (e) { setPlayingAudioId(null); } finally { setIsGeneratingAudio(false); }
  };

  const generateReportPDF = async () => {
    setIsExporting(true);
    try {
      const { jsPDF } = (window as any).jspdf;
      const doc = new jsPDF();
      let y = 20;
      const margin = 20;
      const pageWidth = doc.internal.pageSize.getWidth();

      const addHeader = (text: string, color = [79, 70, 229]) => {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(text.toUpperCase(), margin, y);
        y += 6;
        doc.setDrawColor(color[0], color[1], color[2]);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;
      };

      const addSubHeader = (text: string) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(40, 40, 40);
        doc.text(text, margin, y);
        y += 6;
      };

      const addBody = (text: string, size = 10, italic = false) => {
        doc.setFont("helvetica", italic ? "italic" : "normal");
        doc.setFontSize(size);
        doc.setTextColor(60, 60, 60);
        const split = doc.splitTextToSize(text, pageWidth - margin * 2);
        
        if (y + (split.length * (size / 2)) > 280) { doc.addPage(); y = 20; }
        
        doc.text(split, margin, y);
        y += split.length * (size / 2) + 6;
      };

      const addBullet = (text: string) => {
        addBody(`• ${text}`);
      };

      // --- COVER PAGE ---
      doc.setFillColor(30, 27, 75); // Indigo 950
      doc.rect(0, 0, pageWidth, 297, 'F');
      
      doc.setTextColor(255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(32);
      doc.text("COGNITIVE SALES", margin, 100);
      doc.setTextColor(79, 70, 229); // Indigo 600
      doc.text("STRATEGY REPORT", margin, 115);
      
      doc.setFontSize(12);
      doc.setTextColor(200);
      doc.text(`PREPARED FOR: ${context.clientCompany.toUpperCase()}`, margin, 140);
      doc.text(`DATE: ${new Date().toLocaleDateString()}`, margin, 148);
      
      doc.addPage();
      y = 20;

      // --- EXECUTIVE SUMMARY & CONTEXT ---
      addHeader("Executive Mission Brief");
      addSubHeader("Opportunity Snapshot");
      addBody(context.executiveSnapshot || "Strategic renewal and expansion focus.");
      
      addSubHeader("Primary Meeting Focus");
      addBody(context.meetingFocus);

      // --- BUYER PSYCHOLOGY ---
      addHeader("Buyer Psychology Matrix");
      addBody(`Persona Archetype: ${result.snapshot.personaIdentity}`);
      addBody(`Core Decision Logic: ${result.snapshot.decisionLogic}`);
      
      addSubHeader("Psychological Risk Profile");
      addBody(`Decision Style: ${result.snapshot.decisionStyle}`);
      addBody(`Risk Tolerance Level: ${result.snapshot.riskTolerance}`);
      
      addSubHeader("Neural Metrics");
      radarData.forEach(d => {
        addBody(`${d.label}: ${d.value}%`);
      });

      // --- DOCUMENT INSIGHTS ---
      addHeader("Cognitive Grounding Matrix");
      result.groundMatrix.forEach(m => {
        addSubHeader(`[${m.category}] ${m.observation}`);
        addBody(`Significance: ${m.significance}`, 9, true);
      });

      addHeader("Document Intelligence Synthesis");
      addBody(result.documentInsights.materialSynthesis);

      // --- COMPETITIVE HUB ---
      addHeader("Competitive Intelligence Battlefield");
      const renderComp = (c: CompetitorInsight, name: string) => {
        addSubHeader(`${name} (${c.threatProfile} Threat)`);
        addBody(`Overview: ${c.overview}`);
        addBody(`Our Strategic Wedge: ${c.ourWedge}`, 10, true);
        addBody("Key Weaknesses to Exploit:");
        c.weaknesses.forEach(w => addBullet(w));
        y += 4;
      };
      renderComp(result.competitiveHub.cognigy, "COGNIGY");
      renderComp(result.competitiveHub.amelia, "AMELIA");
      result.competitiveHub.others.forEach(o => renderComp(o, o.name));

      // --- TACTICAL PLAYBOOK ---
      addHeader("Tactical Conversation Playbook");
      addSubHeader("Strategic Opening Hooks");
      result.openingLines.forEach(l => {
        addBody(`[${l.label}] “${l.text}”`, 10, true);
      });

      addSubHeader("Strategic Questions to Ask");
      result.strategicQuestionsToAsk.forEach(q => {
        addBody(`Q: ${q.question}`);
        addBody(`Rationale: ${q.whyItMatters}`, 9, true);
        y += 2;
      });

      addHeader("Objection Defense Drills");
      result.objectionHandling.forEach(o => {
        addSubHeader(`Objection: “${o.objection}”`);
        addBody(`Psychological Meaning: ${o.realMeaning}`, 9, true);
        addBody(`Execution Strategy: ${o.strategy}`);
        addBody(`Recommended Wording: “${o.exactWording}”`, 10, true);
        y += 4;
      });

      // --- DEEP DIVE SECTIONS ---
      addHeader("In-Depth Strategic Briefing");
      addSubHeader("Executive Summary & Background");
      addBody(result.reportSections.introBackground);
      
      addSubHeader("Technical Discussion & Validation");
      addBody(result.reportSections.technicalDiscussion);
      
      addSubHeader("Implementation & Product Integration");
      addBody(result.reportSections.productIntegration);

      // --- COACHING & TONE ---
      addHeader("Final Coaching & Execution Guidance");
      addSubHeader("Tone Alignment");
      addBody(`Words to Utilize: ${result.toneGuidance.wordsToUse.join(', ')}`);
      addBody(`Words to Neutralize: ${result.toneGuidance.wordsToAvoid.join(', ')}`);
      
      addSubHeader("Strategic Dos and Don'ts");
      addBody("Actionable Dos:");
      result.finalCoaching.dos.forEach(d => addBullet(d));
      addBody("Strategic Don'ts:");
      result.finalCoaching.donts.forEach(d => addBullet(d));
      
      addSubHeader("Closing Strategy Advice");
      addBody(result.finalCoaching.finalAdvice);

      // --- EVIDENCE INDEX ---
      addHeader("Evidence Index & Traceability");
      evidenceIndex.forEach((ev, i) => {
        if (i < 20) { // Limit to top 20 for readability
          addBody(`Source: ${ev.source} (${ev.category})`, 8, true);
          addBody(`“${ev.snippet.substring(0, 150)}${ev.snippet.length > 150 ? '...' : ''}”`, 8);
        }
      });

      doc.save(`Cognitive-Strategy-${context.clientCompany.replace(/\s+/g, '-')}.pdf`);
    } catch (e) { 
      console.error("PDF Export Failed:", e); 
      alert("Strategic report generation encountered an error. Please verify jsPDF availability.");
    } finally { 
      setIsExporting(false); 
    }
  };

  const renderSection = (title: string, content: string) => (
    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
      <h4 className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mb-4">{title}</h4>
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );

  return (
    <div className="space-y-12 pb-20">
      <div className="flex justify-end items-center gap-6">
        <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm">
           <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Active Voice</span>
           <select 
             value={selectedVoice} 
             onChange={(e) => setSelectedVoice(e.target.value)}
             className="bg-transparent text-[11px] font-black uppercase text-indigo-600 outline-none cursor-pointer"
           >
             {VOICES.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
           </select>
        </div>
        <button 
          onClick={generateReportPDF} 
          disabled={isExporting} 
          className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 ${isExporting ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
        >
          {isExporting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Synthesizing PDF...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Comprehensive Brief
            </>
          )}
        </button>
      </div>

      {/* Strategic Opening Hooks Section */}
      <section className="bg-indigo-950 rounded-[4rem] p-12 shadow-2xl relative overflow-hidden group border border-indigo-900">
        <div className="absolute top-0 right-0 p-16 opacity-[0.05] translate-x-1/4 -translate-y-1/4 group-hover:translate-x-0 transition-transform duration-1000"><ICONS.Sparkles className="w-96 h-96 text-white" /></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-2">Psychological Priming</h3>
              <h2 className="text-4xl font-black text-white tracking-tight">Strategic Opening Hooks</h2>
              <p className="text-indigo-200/70 mt-3 text-sm font-medium max-w-2xl">Use these persona-aligned openers to establish authority and empathy immediately. Grounded in document analysis of {context.clientCompany}'s core priorities.</p>
            </div>
            <div className="hidden lg:flex flex-col items-end gap-2">
               <div className="px-4 py-2 bg-indigo-900/50 border border-indigo-500/30 rounded-xl text-[10px] font-black text-indigo-300 uppercase tracking-widest">
                  Target: {context.persona}
               </div>
               <div className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  Grounded Memory: Active
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {result.openingLines.map((line, i) => (
              <div key={i} className="bg-white/5 border border-white/10 p-10 rounded-[3rem] hover:bg-white/10 hover:border-indigo-400/50 transition-all duration-500 group/hook flex flex-col justify-between">
                <div>
                   <div className="flex items-center justify-between mb-6">
                      <span className="px-4 py-1.5 bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-indigo-500/20">
                        {line.label}
                      </span>
                      <ICONS.Chat className="w-4 h-4 text-indigo-400 opacity-50" />
                   </div>
                   <p className="text-xl font-bold text-white leading-relaxed tracking-tight mb-8 group-hover/hook:text-indigo-100 transition-colors italic">
                     “{line.text}”
                   </p>
                </div>
                <div className="space-y-6">
                   <button 
                     onClick={() => playAudioForText(line.text, `hook-${i}`)}
                     className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all group-active/hook:scale-95"
                   >
                     {playingAudioId === `hook-${i}` ? (
                        <>Stop Playback</>
                     ) : (
                        <><ICONS.Speaker className="w-4 h-4" /> Listen to delivery</>
                     )}
                   </button>
                   <div className="flex items-center gap-2 pt-4 border-t border-white/5 opacity-40">
                      <ICONS.Document className="w-2.5 h-2.5" />
                      <span className="text-[8px] font-bold uppercase tracking-widest truncate">{line.citation.sourceFile}</span>
                   </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ground Matrix Hero Section */}
      <section className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-200 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-12 opacity-5"><ICONS.Shield className="w-64 h-64 text-indigo-900" /></div>
        <div className="relative z-10">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500 mb-2">Source Grounding</h3>
          <h2 className="text-4xl font-black text-slate-900 mb-10">Cognitive Ground Matrix</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {result.groundMatrix.map((item, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-100 p-8 rounded-[2.5rem] flex flex-col hover:bg-white hover:border-indigo-300 hover:shadow-xl transition-all group">
                <span className="text-[8px] font-black uppercase tracking-widest text-indigo-500 mb-3 px-2 py-1 bg-white border border-indigo-50 rounded-full inline-block w-fit">
                  {item.category}
                </span>
                <p className="text-md font-bold text-slate-900 mb-4 leading-tight group-hover:text-indigo-600 transition-colors">
                  {item.observation}
                </p>
                <div className="mt-auto space-y-3">
                   <p className="text-[10px] text-slate-500 font-medium italic leading-relaxed">
                     “{item.significance}”
                   </p>
                   <div className="pt-4 border-t border-slate-200">
                      <p className="text-[7px] font-black uppercase text-slate-400 tracking-widest mb-1 flex items-center gap-1">
                        <ICONS.Document className="w-2 h-2" /> Evidence Source
                      </p>
                      <p className="text-[8px] font-bold text-slate-600 truncate">{item.evidence.sourceFile}</p>
                   </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Psychology Matrix Enhanced */}
      <section className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-200">
        <div className="flex flex-col lg:flex-row gap-16 items-start">
          <div className="w-full lg:w-1/2 space-y-10">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500 mb-2">Neural Matrix</h3>
              <h2 className="text-4xl font-black text-slate-900 mb-6">Buyer Psychology Identity</h2>
              <div className="space-y-6 text-slate-600 italic border-l-4 border-indigo-100 pl-6">
                <p><strong>Persona:</strong> {result.snapshot.personaIdentity}</p>
                <p><strong>Logic:</strong> {result.snapshot.decisionLogic}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                {radarData.map((d, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                      <span>{d.label}</span>
                      <span>{d.value}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${d.value}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Anticipated Resistance Nodes */}
            <div className="pt-10 border-t border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                 <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
                    <ICONS.Security className="w-4 h-4" />
                 </div>
                 <h4 className="text-[11px] font-black uppercase text-slate-900 tracking-widest">Anticipated Resistance Nodes</h4>
              </div>
              <div className="space-y-4">
                {result.snapshot.likelyObjections.slice(0, 3).map((objection, i) => {
                  const handle = result.objectionHandling.find(oh => oh.objection.toLowerCase().includes(objection.text.toLowerCase().substring(0, 10)));
                  return (
                    <div key={i} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:border-rose-200 transition-all group">
                       <p className="text-xs font-black text-slate-800 mb-2 tracking-tight group-hover:text-rose-600 transition-colors">“{objection.text}”</p>
                       <div className="flex items-start gap-2">
                          <span className="text-[9px] font-black uppercase text-indigo-500 mt-0.5 tracking-widest shrink-0">Strategy:</span>
                          <p className="text-[10px] font-bold text-slate-500 leading-snug">
                            {handle?.strategy || "Leverage grounded ROI proof and persona-specific empathy nodes."}
                          </p>
                       </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="w-full lg:w-1/2 flex flex-col items-center justify-center sticky top-24">
            <CognitiveRadarChart data={radarData} />
            <div className="mt-4 p-6 bg-indigo-50 rounded-[2.5rem] border border-indigo-100 text-center max-w-sm">
               <p className="text-[9px] font-black uppercase text-indigo-600 tracking-widest mb-1">Synthesized Decision Driver</p>
               <p className="text-xs font-bold text-slate-700 italic">“Anchored in high {radarData.sort((a,b) => b.value - a.value)[0].label.toLowerCase()}—responses must prioritize structural validation.”</p>
            </div>
          </div>
        </div>
      </section>

      {/* Strategic Report Sections - New UI Expansion */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {renderSection("Strategic Introduction", result.reportSections.introBackground)}
        {renderSection("Technical Validation", result.reportSections.technicalDiscussion)}
        {renderSection("Integration Roadmap", result.reportSections.productIntegration)}
      </section>

      {/* Competitive Intelligence Hub with Comparative SWOT */}
      <section className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-200 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 via-indigo-600 to-emerald-500"></div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div>
            <div className="flex items-center gap-4 mb-3">
               <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-200"><ICONS.Trophy /></div>
               <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-indigo-500">Market Intelligence Hub</h3>
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Comparative SWOT Analysis</h2>
            <p className="text-slate-500 mt-2 font-medium max-w-2xl">Deep-dive into inferred and explicit competitive dynamics. This matrix identifies specific vulnerabilities and threat vectors grounded in your documentary data.</p>
          </div>
          <div className="flex items-center gap-3 px-6 py-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 shadow-sm">
             <span className="text-[10px] font-black uppercase tracking-widest">Wedge Logic: Enabled</span>
             <ICONS.Shield className="w-3 h-3" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
          <CompetitorCard comp={result.competitiveHub.cognigy} name="Cognigy" />
          <CompetitorCard comp={result.competitiveHub.amelia} name="Amelia" />
          {result.competitiveHub.others.map((c, i) => <CompetitorCard key={i} comp={c} name={c.name} />)}
        </div>

        {/* Tactical Synthesis Footer */}
        <div className="mt-16 p-10 bg-slate-900 rounded-[3.5rem] text-white relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-12 opacity-5 translate-x-1/4 -translate-y-1/4 rotate-12 transition-transform group-hover:rotate-0 duration-700"><ICONS.Brain className="w-80 h-80" /></div>
           <div className="relative z-10 flex flex-col lg:flex-row gap-12 items-center">
              <div className="flex-1 space-y-4">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400">Competitive Synthesis Summary</h4>
                 <p className="text-2xl font-black leading-tight tracking-tight">
                    "Exploit Cognigy's {(result.competitiveHub.cognigy.weaknesses[0] || "logic gaps").toLowerCase()} while countering Amelia's {(result.competitiveHub.amelia.strengths[0] || "market presence").toLowerCase()} by anchoring on our {(result.snapshot.priorities[0]?.text || "core value").toLowerCase()} advantage."
                 </p>
              </div>
              <div className="w-full lg:w-fit grid grid-cols-2 gap-4">
                 <div className="p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md">
                    <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">Primary Win Vector</p>
                    <p className="text-xs font-bold text-white/90">Strategic {result.snapshot.personaIdentity.split(' ')[0]} Alignment</p>
                 </div>
                 <div className="p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md">
                    <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-1">Critical Block Vector</p>
                    <p className="text-xs font-bold text-white/90">Competitor Technical Lock-in</p>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* Battle Drills with Tactical Playbook Layout */}
      <section className="bg-white rounded-[4rem] p-12 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500 mb-2">Tactical Playbook</h3>
            <h2 className="text-3xl font-black text-slate-900">Objection Defense Drills</h2>
          </div>
          <div className="flex items-center gap-3 px-5 py-2.5 bg-rose-50 text-rose-600 rounded-full border border-rose-100 shadow-sm">
             <span className="text-[10px] font-black uppercase tracking-widest">Execution Engine: Primed</span>
             <ICONS.Brain className="w-3 h-3" />
          </div>
        </div>
        
        <div className="space-y-16">
          {result.objectionHandling.map((o, i) => (
            <div key={i} className="relative group">
              {i !== result.objectionHandling.length - 1 && (
                <div className="absolute left-6 top-full h-16 w-0.5 bg-slate-100"></div>
              )}
              
              <div className="p-10 rounded-[3.5rem] bg-slate-50 border border-slate-100 hover:border-indigo-200 hover:bg-white hover:shadow-2xl transition-all duration-500 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-12 opacity-[0.02] -translate-y-1/4 translate-x-1/4 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform duration-700">
                   <ICONS.Shield className="w-64 h-64 text-rose-900" />
                </div>

                <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12">
                  <div className="lg:col-span-5 space-y-8">
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                         <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
                         <h4 className="text-[11px] font-black uppercase text-rose-500 tracking-widest">Incoming Objection</h4>
                      </div>
                      <p className="text-2xl font-black text-slate-900 leading-tight tracking-tight">“{o.objection}”</p>
                    </div>

                    <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm italic text-slate-600 text-sm leading-relaxed border-l-4 border-l-rose-200">
                       <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 not-italic mb-2">Neural Translation (Underlying Meaning)</p>
                       “{o.realMeaning}”
                    </div>
                  </div>

                  <div className="lg:col-span-7 space-y-8">
                     <div className="p-8 bg-indigo-950 text-white rounded-[2.5rem] shadow-xl relative overflow-hidden group/strat">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/strat:scale-125 transition-transform"><ICONS.Research /></div>
                        <h5 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-3">Strategic Maneuver</h5>
                        <p className="text-lg font-bold text-white/90 leading-snug">{o.strategy}</p>
                     </div>

                     <div className="p-10 bg-white border border-indigo-100 rounded-[3rem] shadow-inner flex flex-col items-center text-center relative">
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                           <div className="w-1 h-1 bg-indigo-500 rounded-full"></div>
                           <h5 className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Validated Verbal Script</h5>
                           <div className="w-1 h-1 bg-indigo-500 rounded-full"></div>
                        </div>
                        <p className="text-xl font-bold text-slate-900 leading-relaxed italic mt-4">“{o.exactWording}”</p>
                        
                        <div className="mt-8 flex items-center gap-4">
                           <button 
                             onClick={() => playAudioForText(o.exactWording, `obj-${i}`)} 
                             className="flex items-center gap-3 px-8 py-3.5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
                           >
                             {playingAudioId === `obj-${i}` ? (
                               'Terminate Playback'
                             ) : (
                               <><ICONS.Speaker className="w-4 h-4" /> Listen to delivery</>
                             )}
                           </button>
                           <div className="text-[8px] font-bold text-slate-300 uppercase tracking-[0.2em]">Synthesized with {selectedVoice} Voice</div>
                        </div>
                     </div>
                  </div>
                </div>

                <div className="mt-12 pt-10 border-t border-slate-200/50 grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0"><ICONS.Brain className="w-5 h-5" /></div>
                    <div>
                       <h5 className="text-[10px] font-black uppercase text-slate-900 tracking-widest mb-1">Empathy Anchor</h5>
                       <p className="text-xs text-slate-500 font-medium leading-relaxed">{o.empathyTip}</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shrink-0"><ICONS.ROI className="w-5 h-5" /></div>
                    <div>
                       <h5 className="text-[10px] font-black uppercase text-slate-900 tracking-widest mb-1">Value Reinforcement</h5>
                       <p className="text-xs text-slate-500 font-medium leading-relaxed">{o.valueTip}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100/50 flex items-center justify-between text-[8px] font-bold text-slate-400 opacity-60">
                   <div className="flex items-center gap-2">
                      <ICONS.Document className="w-2.5 h-2.5" />
                      <span>Evidence Source: {o.citation.sourceFile}</span>
                   </div>
                   <div className="italic">“{o.citation.snippet.substring(0, 100)}...”</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Evidence Index Table */}
      <section className="bg-slate-900 rounded-[4rem] p-12 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-16 opacity-5"><ICONS.Document className="w-96 h-96" /></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-2">Master Traceability Index</h3>
              <h2 className="text-3xl font-black">Analysis Evidence Index</h2>
            </div>
            <div className="flex items-center gap-2 px-6 py-3 bg-white/10 rounded-2xl border border-white/10">
               <span className="text-indigo-300 font-black text-xl">{evidenceIndex.length}</span>
               <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Verified Document Links</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {evidenceIndex.map((ev, i) => (
              <div key={i} className="group bg-white/5 border border-white/10 p-8 rounded-[2.5rem] hover:bg-white/10 hover:border-indigo-500/50 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[7px] font-black uppercase tracking-widest px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                    {ev.category}
                  </span>
                  <ICONS.Shield className="w-3 h-3 text-indigo-400 opacity-50" />
                </div>
                <p className="text-[11px] font-serif italic text-white/80 leading-relaxed mb-6 group-hover:text-white transition-colors">
                  “{ev.snippet.length > 150 ? ev.snippet.substring(0, 150) + '...' : ev.snippet}”
                </p>
                <div className="pt-4 border-t border-white/5 flex items-center gap-3">
                   <div className="w-6 h-6 rounded-lg bg-indigo-600/30 flex items-center justify-center text-indigo-400">
                     <ICONS.Document className="w-3 h-3" />
                   </div>
                   <div className="overflow-hidden">
                      <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-0.5">Found In</p>
                      <p className="text-[9px] font-bold text-white/60 truncate">{ev.source}</p>
                   </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
