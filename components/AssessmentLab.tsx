
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ICONS } from '../constants';
import { generateAssessmentQuestions, evaluateAssessment } from '../services/geminiService';
import { AssessmentQuestion, AssessmentResult, QuestionType } from '../types';

interface AssessmentLabProps {
  activeDocuments: { name: string; content: string }[];
}

export const AssessmentLab: React.FC<AssessmentLabProps> = ({ activeDocuments }) => {
  const [stage, setStage] = useState<'config' | 'running' | 'results'>('config');
  const [config, setConfig] = useState({ mcq: 5, short: 0, long: 0, mic: 0, timer: 10 });
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeByQuestion, setTimeByQuestion] = useState<Record<string, number>>({});
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalSessionTime, setTotalSessionTime] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTimeRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition for MIC questions
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        const qId = questions[currentIdx]?.id;
        if (qId) {
          setAnswers(prev => ({ ...prev, [qId]: transcript }));
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [questions, currentIdx]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("Speech Recognition is not supported in this browser.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (e) {
        console.error("Speech start error:", e);
      }
    }
  };

  const handleStart = async (customConfig?: typeof config) => {
    setIsGenerating(true);
    const activeConfig = customConfig || config;
    try {
      const combined = activeDocuments.map(d => d.content).join('\n');
      const qSet = await generateAssessmentQuestions(combined, activeConfig);
      setQuestions(qSet);
      
      const seconds = activeConfig.timer * 60;
      setTimeLeft(seconds);
      setTotalSessionTime(seconds);
      setStage('running');
      setAnswers({});
      setTimeByQuestion({});
      setCurrentIdx(0);
      lastTimeRef.current = seconds;
      
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const recordCurrentQuestionTime = () => {
    const qId = questions[currentIdx]?.id;
    if (qId) {
      const timeElapsedSinceLastMark = lastTimeRef.current - timeLeft;
      setTimeByQuestion(prev => ({
        ...prev,
        [qId]: (prev[qId] || 0) + timeElapsedSinceLastMark
      }));
      lastTimeRef.current = timeLeft;
    }
  };

  const handleNext = () => {
    recordCurrentQuestionTime();
    if (isRecording) toggleRecording();
    setCurrentIdx(prev => prev + 1);
  };

  const handlePrevious = () => {
    recordCurrentQuestionTime();
    setCurrentIdx(prev => Math.max(0, prev - 1));
  };

  const handleSubmit = async () => {
    recordCurrentQuestionTime();
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsEvaluating(true);
    try {
      const evals = await evaluateAssessment(questions, answers);
      const mappedResults = evals.map(e => ({
        ...e,
        timeSpent: timeByQuestion[e.questionId] || 0
      }));
      setResults(mappedResults);
      setStage('results');
    } catch (e) {
      console.error(e);
    } finally {
      setIsEvaluating(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const exportPDF = async () => {
    setIsExporting(true);
    try {
      const { jsPDF } = (window as any).jspdf;
      const doc = new jsPDF();
      let y = 20;

      doc.setFontSize(22);
      doc.text("Assessment Readiness Report", 20, y);
      y += 15;

      doc.setFontSize(10);
      doc.text(`Completed on: ${new Date().toLocaleString()}`, 20, y);
      y += 10;

      questions.forEach((q, idx) => {
        const res = results.find(r => r.questionId === q.id);
        if (y > 250) { doc.addPage(); y = 20; }
        
        doc.setFont("helvetica", "bold");
        doc.text(`${idx + 1}. [${q.type.toUpperCase()}] ${q.text}`, 20, y, { maxWidth: 170 });
        y += 10;

        doc.setFont("helvetica", "normal");
        doc.text(`Your Answer: ${res?.userAnswer || "N/A"}`, 25, y, { maxWidth: 165 });
        y += 10;

        doc.setTextColor(79, 70, 229);
        doc.text(`Correct Logic: ${q.correctAnswer} (${res?.timeSpent}s spent)`, 25, y, { maxWidth: 165 });
        doc.setTextColor(0);
        y += 10;

        doc.setFont("helvetica", "italic");
        doc.text(`Coaching: ${res?.evaluation.feedback || ""}`, 25, y, { maxWidth: 165 });
        y += 15;
      });

      doc.save("Cognitive-Assessment-Report.pdf");
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  if (stage === 'config') {
    return (
      <div className="bg-white rounded-[3rem] p-12 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-100">
              <ICONS.Trophy className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Assessment Lab Configuration</h2>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Pressure-test your document mastery</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
             <button 
               onClick={() => handleStart({ mcq: 10, short: 0, long: 0, mic: 0, timer: 15 })}
               className="px-6 py-3 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all flex items-center gap-2"
             >
               <ICONS.Document className="w-4 h-4" /> Quick MCQ Quiz
             </button>
             <button 
               onClick={() => handleStart({ mcq: 0, short: 5, long: 0, mic: 0, timer: 20 })}
               className="px-6 py-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center gap-2"
             >
               <ICONS.Efficiency className="w-4 h-4" /> Tactical Short Answers
             </button>
             <button 
               onClick={() => handleStart({ mcq: 0, short: 0, long: 0, mic: 3, timer: 15 })}
               className="px-6 py-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center gap-2"
             >
               <ICONS.Speaker className="w-4 h-4" /> Verbal Mastery Drill
             </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
          <div className="space-y-6">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500 border-b border-indigo-50 pb-2">Question Parameters</h4>
            <ConfigRow label="MCQ (Logic Gates)" val={config.mcq} set={(v) => setConfig({ ...config, mcq: v })} icon={<ICONS.Document />} />
            <ConfigRow label="Short Answer (Tactical)" val={config.short} set={(v) => setConfig({ ...config, short: v })} icon={<ICONS.Efficiency />} />
            <ConfigRow label="Long Answer (Strategic)" val={config.long} set={(v) => setConfig({ ...config, long: v })} icon={<ICONS.Research />} />
            <ConfigRow label="Microphone (Verbal Delivery)" val={config.mic} set={(v) => setConfig({ ...config, mic: v })} icon={<ICONS.Speaker />} />
          </div>

          <div className="space-y-6">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-500 border-b border-rose-50 pb-2">Environment Controls</h4>
            <div className="p-8 bg-slate-50 rounded-[2.5rem] space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase text-slate-500">Session Timer</span>
                <span className="text-2xl font-black text-indigo-600">{config.timer}m</span>
              </div>
              <input 
                type="range" min="1" max="60" 
                value={config.timer} 
                onChange={(e) => setConfig({ ...config, timer: parseInt(e.target.value) })}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <p className="text-[10px] text-slate-400 italic">Total available time for all generated nodes.</p>
            </div>

            <div className="p-8 bg-indigo-50 rounded-[2.5rem] flex items-center gap-6 border border-indigo-100">
               <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shrink-0"><ICONS.Brain className="text-white" /></div>
               <p className="text-xs text-indigo-900 font-medium leading-relaxed">
                 AI will synthesize grounded questions across multiple modalities directly from your selected documents to evaluate total readiness.
               </p>
            </div>
          </div>
        </div>

        <button 
          onClick={() => handleStart()}
          disabled={isGenerating || activeDocuments.length === 0}
          className={`w-full py-8 rounded-[2rem] font-black text-xl uppercase tracking-widest transition-all shadow-2xl flex items-center justify-center gap-4 ${isGenerating ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.01] active:scale-95'}`}
        >
          {isGenerating ? (
            <>
              <div className="w-6 h-6 border-4 border-slate-300 border-t-indigo-500 rounded-full animate-spin"></div>
              Generating Performance Nodes...
            </>
          ) : (
            <>
              <ICONS.Play className="w-6 h-6" />
              Initiate Neural Assessment
            </>
          )}
        </button>
      </div>
    );
  }

  if (stage === 'running') {
    const currentQ = questions[currentIdx];
    const progressPercent = totalSessionTime > 0 ? (timeLeft / totalSessionTime) * 100 : 100;

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
          <div className="h-2 w-full bg-slate-100">
             <div 
               className={`h-full transition-all duration-1000 ${timeLeft < 60 ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-indigo-500'}`}
               style={{ width: `${progressPercent}%` }}
             ></div>
          </div>
          <div className="flex items-center justify-between px-10 py-6">
            <div className="flex items-center gap-6">
                <div className="px-4 py-1.5 bg-indigo-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest">
                  Question {currentIdx + 1} / {questions.length}
                </div>
                <div className={`flex items-center gap-2 text-lg font-black ${timeLeft < 60 ? 'text-rose-600 animate-pulse' : 'text-slate-800'}`}>
                   <ICONS.Efficiency className="w-4 h-4" />
                   {formatTime(timeLeft)}
                </div>
            </div>
            {timeLeft < 30 && (
              <div className="flex items-center gap-2 px-4 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-full text-[9px] font-black uppercase tracking-widest animate-bounce">
                Low Time Warning
              </div>
            )}
            <button 
              onClick={handleSubmit}
              className="px-8 py-2.5 bg-emerald-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg"
            >
              Submit Assessment
            </button>
          </div>
        </div>

        <div className="bg-white rounded-[4rem] p-16 shadow-2xl border border-slate-200 relative overflow-hidden">
           <div className="absolute top-0 right-0 p-12 opacity-[0.03]"><ICONS.Research className="w-64 h-64" /></div>
           
           <div className="relative z-10 space-y-12">
              <div className="space-y-4">
                 <span className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${currentQ.type === 'mic' ? 'bg-rose-100 text-rose-600' : currentQ.type === 'long' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                    {currentQ.type === 'mic' ? 'VERBAL MASTERY' : currentQ.type === 'long' ? 'STRATEGIC LONG FORM' : `${currentQ.type} MODE`}
                 </span>
                 <h3 className="text-3xl font-black text-slate-900 leading-tight tracking-tight">
                   {currentQ.text}
                 </h3>
              </div>

              <div className="min-h-[300px]">
                {currentQ.type === 'mcq' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {currentQ.options?.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => setAnswers(prev => ({ ...prev, [currentQ.id]: opt }))}
                        className={`p-8 rounded-[2rem] border-2 text-left transition-all relative flex items-center gap-6 group ${answers[currentQ.id] === opt ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl' : 'bg-slate-50 border-slate-100 hover:border-indigo-300'}`}
                      >
                         <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${answers[currentQ.id] === opt ? 'bg-white/20 text-white' : 'bg-white text-indigo-600 shadow-sm'}`}>
                           {String.fromCharCode(65 + i)}
                         </div>
                         <span className="text-lg font-bold">{opt}</span>
                      </button>
                    ))}
                  </div>
                )}

                {(currentQ.type === 'short' || currentQ.type === 'long') && (
                  <div className="space-y-4">
                    <textarea 
                      value={answers[currentQ.id] || ""}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                      className={`w-full bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] p-10 text-xl font-medium focus:border-indigo-500 focus:bg-white transition-all outline-none shadow-inner ${currentQ.type === 'short' ? 'h-40' : 'h-80'}`}
                      placeholder={currentQ.type === 'short' ? "Provide a concise tactical response..." : "Synthesize your detailed strategic response here. Aim for depth and grounding in document evidence..."}
                    />
                    <div className="flex justify-between px-4 text-[9px] font-black uppercase text-slate-400">
                      <span>{currentQ.type === 'short' ? 'Target: Concise Logic' : 'Target: Comprehensive Strategic Alignment'}</span>
                      <span>{(answers[currentQ.id] || "").length} characters</span>
                    </div>
                  </div>
                )}

                {currentQ.type === 'mic' && (
                  <div className="flex flex-col items-center justify-center gap-10 py-12">
                     <div className="relative">
                        <div className={`absolute inset-0 rounded-full border-4 border-rose-500/20 transition-transform duration-1000 ${isRecording ? 'scale-[1.6] animate-ping' : 'scale-100'}`}></div>
                        <div className={`absolute inset-0 rounded-full border-4 border-rose-500/10 transition-transform duration-1000 ${isRecording ? 'scale-[2.2] animate-ping [animation-delay:0.5s]' : 'scale-100'}`}></div>
                        
                        <button 
                          onClick={toggleRecording}
                          className={`relative z-10 w-40 h-40 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-rose-600 shadow-[0_0_60px_rgba(225,29,72,0.6)]' : 'bg-indigo-600 hover:bg-indigo-700 shadow-xl'}`}
                        >
                          {isRecording ? <ICONS.X className="w-16 h-16 text-white" /> : <ICONS.Speaker className="w-16 h-16 text-white" />}
                        </button>
                     </div>

                     <div className="text-center space-y-4">
                        <h4 className="text-2xl font-black text-slate-800">{isRecording ? "Neural Transcription Active..." : "Initiate Verbal Answer"}</h4>
                        <div className="flex items-center justify-center gap-1 h-8">
                           {isRecording ? (
                              [...Array(12)].map((_, i) => (
                                 <div 
                                    key={i} 
                                    className="w-1 bg-rose-500 rounded-full animate-waveform-sm"
                                    style={{ 
                                       height: `${20 + Math.random() * 80}%`,
                                       animationDelay: `${i * 0.1}s`
                                    }}
                                 ></div>
                              ))
                           ) : (
                              <p className="text-slate-400 font-medium italic">Speak your strategy clearly. Performance will be audited for logic.</p>
                           )}
                        </div>
                     </div>

                     {answers[currentQ.id] && (
                       <div className="max-w-3xl w-full p-10 bg-indigo-50 rounded-[3rem] border-2 border-indigo-100 text-indigo-900 font-bold italic animate-in fade-in slide-in-from-bottom-4 shadow-inner relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4 opacity-10"><ICONS.Speaker className="w-12 h-12" /></div>
                          “{answers[currentQ.id]}”
                       </div>
                     )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-12 border-t border-slate-100">
                <button 
                  onClick={handlePrevious}
                  disabled={currentIdx === 0}
                  className="px-8 py-4 bg-slate-100 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-30"
                >
                  Previous Node
                </button>
                <div className="flex gap-2">
                   {questions.map((_, i) => (
                     <div key={i} className={`h-1.5 rounded-full transition-all ${i === currentIdx ? 'w-8 bg-indigo-600' : 'w-1.5 bg-slate-200'}`}></div>
                   ))}
                </div>
                {currentIdx < questions.length - 1 ? (
                  <button 
                    onClick={handleNext}
                    className="px-10 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl transition-all"
                  >
                    Next Performance Node
                  </button>
                ) : (
                  <button 
                    onClick={handleSubmit}
                    className="px-12 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-xl transition-all"
                  >
                    Final Submission
                  </button>
                )}
              </div>
           </div>
        </div>
        <style>{`
           @keyframes waveform-sm {
              0%, 100% { transform: scaleY(0.5); }
              50% { transform: scaleY(1.2); }
           }
           .animate-waveform-sm {
              animation: waveform-sm 0.6s ease-in-out infinite;
           }
        `}</style>
      </div>
    );
  }

  if (stage === 'results') {
    const totalScore = Math.round(results.reduce((acc, r) => acc + r.evaluation.score, 0) / (results.length || 1));
    const timeUsed = totalSessionTime - timeLeft;
    const timeUsedPercent = Math.round((timeUsed / totalSessionTime) * 100);

    return (
      <div className="space-y-12 animate-in slide-in-from-bottom-8 duration-700">
        <div className="bg-slate-900 rounded-[4rem] p-16 text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-12">
           <div className="absolute top-0 right-0 p-16 opacity-5"><ICONS.Trophy className="w-96 h-96" /></div>
           <div className="relative z-10 space-y-8">
              <div>
                <h2 className="text-4xl font-black tracking-tight">Cognitive Readiness Report</h2>
                <p className="text-indigo-200/70 font-medium text-lg max-w-xl mt-4">
                  Your performance has been cross-referenced against <strong>{activeDocuments.length} document nodes</strong> using the high-fidelity reasoning core.
                </p>
              </div>

              <div className="flex gap-12 items-center">
                 <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Time Efficiency</p>
                    <div className="flex items-end gap-3">
                       <span className="text-4xl font-black">{formatTime(timeUsed)}</span>
                       <span className="text-indigo-500 font-bold mb-1">/ {config.timer}m</span>
                    </div>
                 </div>
                 <div className="w-px h-12 bg-white/10"></div>
                 <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Completion Pace</p>
                    <p className="text-4xl font-black">{timeUsedPercent}% <span className="text-xs text-emerald-600 align-middle">Used</span></p>
                 </div>
              </div>

              <div className="flex gap-4">
                 <button onClick={exportPDF} disabled={isExporting} className="px-8 py-3.5 bg-white text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all flex items-center gap-2">
                   {isExporting ? <div className="w-3 h-3 border-2 border-slate-900 border-t-transparent animate-spin"></div> : <ICONS.Document className="w-4 h-4" />}
                   Export Branded PDF
                 </button>
                 <button onClick={() => setStage('config')} className="px-8 py-3.5 bg-white/10 text-white border border-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">
                   Retake Lab
                 </button>
              </div>
           </div>
           <div className="relative z-10 w-64 h-64 bg-indigo-600 rounded-full flex flex-col items-center justify-center border-[12px] border-white/10 shadow-[0_0_100px_rgba(79,70,229,0.5)]">
              <span className="text-[12px] font-black uppercase tracking-widest text-indigo-200 mb-2">Readiness Score</span>
              <span className="text-7xl font-black">{totalScore}%</span>
           </div>
        </div>

        <div className="space-y-6">
           {questions.map((q, idx) => {
             const res = results.find(r => r.questionId === q.id);
             return (
               <div key={q.id} className="bg-white rounded-[3rem] p-12 border border-slate-200 shadow-xl group hover:border-indigo-300 transition-all">
                  <div className="flex items-start justify-between mb-10">
                     <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Node {idx + 1} • {q.type} • {res?.timeSpent}s Analysis</span>
                        <h4 className="text-2xl font-black text-slate-900 tracking-tight">{q.text}</h4>
                     </div>
                     <div className={`px-6 py-3 rounded-2xl flex items-center gap-3 border ${res?.evaluation.isCorrect ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                        <span className="text-xl font-black">{res?.evaluation.score}%</span>
                        <div className="w-px h-6 bg-current opacity-20"></div>
                        <span className="text-[10px] font-black uppercase tracking-widest">{res?.evaluation.isCorrect ? 'Validated' : 'Weak Point'}</span>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                     <div className="space-y-6">
                        <div className="space-y-3">
                           <h5 className={`text-[10px] font-black uppercase tracking-widest ${q.type === 'mic' ? 'text-rose-500' : q.type === 'long' ? 'text-amber-500' : 'text-indigo-500'}`}>Your {q.type === 'mic' ? 'Verbal' : q.type === 'long' ? 'Strategic' : 'Tactical'} Response</h5>
                           <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 italic text-slate-600 font-medium">
                              “{res?.userAnswer || "No input provided."}”
                           </div>
                        </div>
                        <div className="space-y-3">
                           <h5 className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Ideal Documented Logic</h5>
                           <div className="p-8 bg-emerald-50/30 rounded-[2rem] border border-emerald-100 text-slate-900 font-bold">
                              {q.correctAnswer}
                           </div>
                        </div>
                     </div>
                     <div className="space-y-6">
                        <div className="p-10 bg-indigo-950 text-white rounded-[3rem] shadow-2xl relative overflow-hidden h-full flex flex-col">
                           <div className="absolute top-0 right-0 p-8 opacity-10"><ICONS.Brain className="w-32 h-32" /></div>
                           <div className="flex-1">
                              <h5 className="text-[11px] font-black uppercase text-indigo-400 tracking-[0.4em] mb-6">Neural Auditor Feedback</h5>
                              <p className="text-lg font-medium leading-relaxed italic text-indigo-100">
                                {res?.evaluation.feedback}
                              </p>
                              <div className="mt-8 pt-8 border-t border-white/10 flex items-center justify-between">
                                 <div>
                                    <h6 className="text-[9px] font-black uppercase text-indigo-500 mb-1">{q.type === 'mic' ? 'Verbal Delivery' : q.type === 'long' ? 'Strategic' : 'Tactical'} Mastery Tip</h6>
                                    <p className="text-sm font-bold text-white/80">{q.explanation}</p>
                                 </div>
                                 <div className="text-right">
                                    <h6 className="text-[9px] font-black uppercase text-indigo-400 mb-1">Time Analysis</h6>
                                    <p className="text-xl font-black text-indigo-300">{res?.timeSpent}s</p>
                                 </div>
                              </div>
                           </div>
                           
                           {q.citation && (
                             <div className="mt-8 pt-6 border-t border-white/10">
                                <h6 className="text-[9px] font-black uppercase text-emerald-400 mb-3 flex items-center gap-2">
                                   <ICONS.Shield className="w-3 h-3" /> Grounded Evidence Link
                                </h6>
                                <p className="text-xs font-serif italic text-white/60 leading-relaxed">
                                   “{q.citation.snippet}”
                                </p>
                                <p className="mt-2 text-[8px] font-black uppercase text-indigo-400 tracking-widest">Source: {q.citation.sourceFile}</p>
                             </div>
                           )}
                        </div>
                     </div>
                  </div>
               </div>
             );
           })}
        </div>
      </div>
    );
  }

  return null;
};

const ConfigRow = ({ label, val, set, icon }: { label: string; val: number; set: (v: number) => void; icon: React.ReactNode }) => (
  <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl hover:bg-white hover:shadow-lg transition-all border border-transparent hover:border-slate-100 group">
    <div className="flex items-center gap-4">
      <div className="text-slate-400 group-hover:text-indigo-600 transition-colors">{icon}</div>
      <span className="text-[11px] font-black uppercase text-slate-500 group-hover:text-slate-900">{label}</span>
    </div>
    <div className="flex items-center gap-4">
       <button onClick={() => set(Math.max(0, val - 1))} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-all">-</button>
       <span className="w-8 text-center font-black text-indigo-600">{val}</span>
       <button onClick={() => set(val + 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 transition-all">+</button>
    </div>
  </div>
);
