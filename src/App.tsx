import React, { useState, useCallback, useRef } from "react";
import { 
  FileText, 
  Upload, 
  Search, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Download, 
  ArrowRight,
  Loader2,
  FileSearch,
  Briefcase,
  Lightbulb
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { analyzeResume, type ResumeAnalysis } from "./lib/gemini";
import { jsPDF } from "jspdf";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const StatusBadge = ({ type }: { type: "High" | "Medium" | "Low" }) => {
  const styles = {
    High: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Medium: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    Low: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-widest", styles[type])}>
      {type}
    </span>
  );
};

const SectionTitle = ({ children, icon: Icon, type = "indigo" }: { children: React.ReactNode; icon: any; type?: "indigo" | "rose" | "emerald" }) => {
  const colors = {
    indigo: "text-indigo-400",
    rose: "text-rose-400",
    emerald: "text-emerald-400"
  };
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className={cn("w-1 h-1 rounded-full", type === "indigo" ? "bg-indigo-400" : type === "rose" ? "bg-rose-400" : "bg-emerald-400")} />
      <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", colors[type])}>{children}</h3>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadingMessages = [
    "Extracting text from your resume...",
    "Scanning for key skills and experience...",
    "Benchmarking against industry standards...",
    "Comparing with job requirements...",
    "Finalizing your ATS score and feedback...",
  ];

  const handleFile = (selectedFile: File) => {
    if (selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
        selectedFile.name.toLowerCase().endsWith(".docx")) {
      setFile(selectedFile);
      setError(null);
    } else {
      setError("Please upload a .DOCX file only.");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const runAnalysis = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setAnalysis(null);
    setError(null);

    // Progress timer
    const interval = setInterval(() => {
      setLoadingStep(s => (s < loadingMessages.length - 1 ? s + 1 : s));
    }, 2000);

    try {
      // 1. Send to backend for extraction
      const formData = new FormData();
      formData.append("resume", file);

      const extractRes = await fetch("/api/extract-text", {
        method: "POST",
        body: formData,
      });

      const contentType = extractRes.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textFallback = await extractRes.text();
        console.error("Server returned non-JSON response:", textFallback);
        throw new Error("Server error: Received an HTML response instead of JSON. This usually means the API route was not found or the server restarted. Please refresh and try again.");
      }

      if (!extractRes.ok) {
        const errData = await extractRes.json();
        throw new Error(errData.error || "Failed to extract text from resume");
      }
      const { text: resumeText } = await extractRes.json();

      // 2. Analyze with Gemini
      const result = await analyzeResume(resumeText, jobDescription);
      setAnalysis(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong during analysis.");
    } finally {
      clearInterval(interval);
      setIsAnalyzing(false);
      setLoadingStep(0);
    }
  };

  const downloadReport = () => {
    if (!analysis) return;
    
    const doc = new jsPDF();
    const margin = 20;
    let y = 20;

    // Header
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text("RESUME ANALYSIS REPORT", margin, y);
    y += 10;

    doc.setFontSize(14);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(`Score: ${analysis.atsScore}/100`, margin, y);
    y += 15;

    // Divider
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.line(margin, y, 190, y);
    y += 15;

    // Sections
    const addSection = (title: string, items: string[]) => {
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59); // Slate-800
      doc.text(title, margin, y);
      y += 8;

      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105); // Slate-600
      items.forEach(item => {
        const lines = doc.splitTextToSize(`• ${item}`, 170);
        doc.text(lines, margin, y);
        y += (lines.length * 6);
        
        // Simple page overflow handle
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      });
      y += 5;
    };

    addSection("STRENGTHS", analysis.strengths);
    addSection("WEAKNESSES", analysis.weaknesses);
    addSection("SUGGESTIONS", analysis.suggestions);

    if (analysis.roleMatch) {
      y += 10;
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text("JOB MATCH ANALYSIS", margin, y);
      y += 8;
      
      doc.setFontSize(11);
      doc.text(`Match Percentage: ${analysis.roleMatch.matchPercentage}%`, margin, y);
      y += 8;
      
      doc.text("Missing Keywords:", margin, y);
      y += 6;
      const keywords = analysis.roleMatch.missingKeywords.join(", ");
      const keywordLines = doc.splitTextToSize(keywords, 170);
      doc.text(keywordLines, margin, y);
    }

    doc.save(`resume_analysis_${Date.now()}.pdf`);
  };

  return (
    <div className="min-h-screen bg-bg-dark text-slate-200 font-sans flex flex-col">
      {/* Navbar */}
      <nav className="h-16 border-b border-white/10 px-8 flex items-center justify-between bg-bg-panel shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">R</div>
          <h1 className="text-xl font-light tracking-tight font-serif uppercase">RESUME <span className="text-indigo-400">INTELLIGENCE</span></h1>
        </div>
        <div className="flex items-center gap-6 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
          <span className="hidden md:block hover:text-slate-300 cursor-pointer transition-colors">Dashboard</span>
          <span className="hidden md:block hover:text-slate-300 cursor-pointer transition-colors">History</span>
          <span className="hidden md:block hover:text-slate-300 cursor-pointer transition-colors">Settings</span>
          <div className="w-8 h-8 rounded-full bg-indigo-900/50 border border-indigo-500/30 flex items-center justify-center">
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <div className="flex-1 overflow-hidden">
        <main className="h-full grid grid-cols-1 md:grid-cols-12 gap-0 overflow-auto md:overflow-hidden">
          {/* Sidebar Area - Inputs */}
          <aside className="col-span-1 md:col-span-4 border-r border-white/10 p-8 flex flex-col gap-8 bg-bg-sidebar overflow-y-auto">
            {/* Reset Button (Moved to top of sidebar) */}
            <div className="flex justify-end">
              <button 
                onClick={() => { setFile(null); setAnalysis(null); setJobDescription(""); setError(null); }}
                className="text-[10px] uppercase tracking-widest font-bold text-slate-500 hover:text-indigo-400 transition-colors"
                style={{ visibility: (file || analysis || jobDescription) ? 'visible' : 'hidden' }}
              >
                Reset
              </button>
            </div>

            {/* Step 1: Upload */}
            <div>
              <label className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold mb-3 block">1. Upload Resume</label>
              <div 
                className={cn(
                  "relative group h-48 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer",
                  isDragging ? "border-indigo-500 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/[0.07]",
                  file && "border-solid border-indigo-500/50"
                )}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input type="file" ref={fileInputRef} className="hidden" accept=".docx" onChange={onFileChange} />
                
                <AnimatePresence mode="wait">
                  {!file ? (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none">
                      <Upload className="w-8 h-8 text-indigo-400 mb-3 mx-auto" />
                      <p className="text-sm text-slate-300">Drop your .DOCX here</p>
                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Only DOCX supported (Max 10MB)</p>
                    </motion.div>
                  ) : (
                    <motion.div key="filled" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="pointer-events-none">
                      <FileText className="w-8 h-8 text-indigo-400 mb-3 mx-auto" />
                      <p className="text-sm font-semibold text-slate-200 truncate max-w-[200px] mx-auto">{file.name}</p>
                      <p className="text-indigo-400 text-[10px] mt-1 font-bold uppercase tracking-wider">Ready to analyze</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {error && <p className="mt-2 text-[10px] text-rose-400 font-bold uppercase tracking-wider px-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
            </div>

            {/* Step 2: Job Description */}
            <div className="flex-1 flex flex-col min-h-0">
              <label className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold mb-3 block">2. Target Job Description</label>
              <textarea 
                className="flex-1 w-full min-h-[160px] bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-slate-300 resize-none focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-600"
                placeholder="Paste the job requirements here for a precision-tailored alignment analysis..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
            </div>

            {/* Action */}
            <button 
              disabled={!file || isAnalyzing}
              onClick={runAnalysis}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-slate-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Analyze Alignment"}
            </button>
          </aside>

          {/* Main Content Area - Results */}
          <section className="col-span-1 md:col-span-8 p-8 flex flex-col gap-8 overflow-y-auto bg-bg-dark">
            <AnimatePresence mode="wait">
              {!analysis && !isAnalyzing ? (
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12"
                >
                  <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8 border border-white/5 ring-8 ring-white/[0.02]">
                    <Search className="w-10 h-10 text-indigo-500 opacity-50" />
                  </div>
                  <h2 className="text-2xl font-serif text-slate-100 mb-4 font-light">Intelligence Pending</h2>
                  <p className="text-slate-500 text-sm leading-relaxed italic">
                    "Success is where preparation and opportunity meet." Upload your credentials to begin your professional optimization sequence.
                  </p>
                </motion.div>
              ) : isAnalyzing ? (
                <motion.div 
                  key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center py-12"
                >
                  <div className="relative mb-8">
                    <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
                    </div>
                  </div>
                  <motion.p 
                    key={loadingStep} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 text-center"
                  >
                    {loadingMessages[loadingStep]}
                  </motion.p>
                </motion.div>
              ) : (
                <motion.div 
                  key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-8 h-full"
                >
                  {/* Header Row */}
                  <div className="flex flex-col lg:flex-row justify-between items-start gap-6 shrink-0">
                    <div>
                      <h2 className="text-4xl font-light mb-2 font-serif">Analysis Report</h2>
                      <div className="flex items-center gap-2">
                        <FileText className="w-3 h-3 text-indigo-400" />
                        <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest truncate max-w-[300px]">
                          {file?.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 self-stretch md:self-auto">
                      <div className="bg-bg-card p-4 rounded-2xl border border-white/5 w-32 flex flex-col items-center justify-center">
                        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">ATS Score</div>
                        <div className={cn("text-3xl font-bold", analysis.atsScore > 80 ? "text-emerald-400" : analysis.atsScore > 60 ? "text-orange-400" : "text-rose-400")}>
                          {analysis.atsScore}<span className="text-sm text-slate-700">/100</span>
                        </div>
                      </div>
                      {analysis.roleMatch && (
                        <div className="bg-bg-card p-4 rounded-2xl border border-white/5 w-32 flex flex-col items-center justify-center">
                          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">JD Match</div>
                          <div className="text-3xl font-bold text-indigo-400">{analysis.roleMatch.matchPercentage}%</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* High Level Metrics Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0">
                    <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                      <SectionTitle icon={CheckCircle2} type="emerald">Strengths</SectionTitle>
                      <ul className="space-y-3 text-sm text-slate-300">
                        {analysis.strengths.map((s, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-emerald-500 font-bold">●</span> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                      <SectionTitle icon={XCircle} type="rose">Critical Gaps</SectionTitle>
                      <ul className="space-y-3 text-sm text-slate-300">
                        {analysis.weaknesses.map((w, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-rose-500 font-bold">●</span> {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Keyword analysis Row */}
                  <div className="bg-bg-card rounded-2xl p-6 border border-white/10 shrink-0">
                    <SectionTitle icon={Search} type="indigo">Keyword Analysis</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {analysis.keywordAnalysis.map((kw, i) => (
                        <span 
                          key={i} 
                          className={cn(
                            "px-3 py-1 border rounded-full text-[10px] font-bold uppercase tracking-wider",
                            kw.relevance === "High" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                            kw.relevance === "Medium" ? "bg-orange-500/10 border-orange-500/20 text-orange-400" :
                            "bg-rose-500/10 border-rose-500/20 text-rose-400"
                          )}
                        >
                          {kw.keyword}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Job match tailored content */}
                  {analysis.roleMatch && (
                    <div className="bg-indigo-900/10 rounded-2xl p-6 border border-indigo-500/20 shrink-0">
                      <SectionTitle icon={Briefcase} type="indigo">Alignment Strategy</SectionTitle>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-indigo-400/60 mb-3 tracking-widest underline underline-offset-4 decoration-indigo-400/20">Action Items</p>
                          <ul className="space-y-4">
                            {analysis.roleMatch.tailoredSuggestions.map((s, i) => (
                              <li key={i} className="flex gap-3 items-start">
                                <div className="bg-indigo-500/20 p-1.5 rounded-lg shrink-0 mt-0.5"><Lightbulb className="w-3 h-3 text-indigo-400" /></div>
                                <p className="text-xs text-slate-300 leading-relaxed font-medium italic">"{s}"</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-indigo-400/60 mb-3 tracking-widest underline underline-offset-4 decoration-indigo-400/20 text-rose-400">Missing Key Elements</p>
                          <div className="flex flex-wrap gap-2">
                            {analysis.roleMatch.missingKeywords.map((kw, i) => (
                              <span key={i} className="px-2 py-1 bg-white/5 rounded-lg border border-white/5 text-[10px] text-slate-400 font-medium">{kw}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* General Improvement Row */}
                  <div className="bg-white/5 rounded-2xl p-6 border border-white/5 shrink-0">
                    <SectionTitle icon={Lightbulb} type="emerald">Executive Suggestions</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
                      {analysis.suggestions.map((s, i) => (
                        <div key={i} className="flex gap-2 items-center text-[11px] text-slate-400 border-b border-white/5 py-2">
                          <span className="text-indigo-400 font-bold shrink-0">→</span>
                          <p>{s}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Footer - Sticky at bottom of Results Area */}
                  <div className="mt-auto flex items-center justify-between pt-8 border-t border-white/5 pb-4 shrink-0">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-slate-600 font-black">
                      Powered by RESUME_CORE_AI 4.0
                    </p>
                    <div className="flex gap-6">
                      <button 
                        onClick={downloadReport}
                        className="text-[10px] uppercase tracking-widest text-indigo-400 hover:text-indigo-300 font-bold underline underline-offset-4 transition-colors"
                      >
                        Download PDF Report
                      </button>
                      <button className="text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-300 font-bold transition-colors">
                        Save to History
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </main>
      </div>
    </div>
  );
}
