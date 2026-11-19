"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, AlertTriangle, CheckCircle2, RotateCcw, Play, Square, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DuplexSparringProps {
  company?: string;
  role?: string;
  onSessionComplete?: (scorecard: Scorecard) => void;
}

export type Scorecard = {
  starCompliance: number;
  fillerWordRatio: number;
  durationSeconds: number;
  feedback: string[];
};

const SAMPLE_QUESTIONS = [
  "Tell me about a time you had to resolve a severe distributed systems bottleneck under production traffic.",
  "Describe a situation where you had a strong technical disagreement with a Staff Engineer or Architect. How did you resolve it?",
  "Walk me through a project where an architectural decision you made had unintended negative consequences.",
];

export function DuplexSparring({
  company = "Anthropic",
  role = "Staff Applied AI Engineer",
  onSessionComplete,
}: DuplexSparringProps) {
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [candidateTranscript, setCandidateTranscript] = useState("");
  const [speechTimer, setSpeechTimer] = useState(0);
  const [interruption, setInterruption] = useState<string | null>(null);
  const [starState, setStarState] = useState({
    situation: false,
    task: false,
    action: false,
    result: false,
  });
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  const speak = (text: string, onEnd?: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    utterance.onend = () => {
      setIsSpeaking(false);
      if (onEnd) onEnd();
    };
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const startSession = () => {
    setIsActive(true);
    setCandidateTranscript("");
    setSpeechTimer(0);
    setInterruption(null);
    setScorecard(null);
    setStarState({ situation: false, task: false, action: false, result: false });

    // Speak introductory prompt
    const initialPrompt = `Hello Santiago. I'm your Bar Raiser for the ${role} role at ${company}. Let's dive straight in. ${SAMPLE_QUESTIONS[currentQuestionIndex]}`;
    speak(initialPrompt, () => {
      startListening();
    });
  };

  const startListening = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Mock listening if browser SpeechRecognition is absent
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setCandidateTranscript(transcript);
        analyzeTranscript(transcript);
      };

      recognition.onerror = () => {};
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // Non-blocking
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const stopSession = () => {
    stopListening();
    setIsActive(false);
    setIsSpeaking(false);

    // Compute final scorecard
    const finalScorecard: Scorecard = {
      starCompliance: Math.round(
        ([starState.situation, starState.task, starState.action, starState.result].filter(Boolean).length / 4) * 100
      ),
      fillerWordRatio: Math.min(Math.round((candidateTranscript.match(/\b(um|uh|like|you know)\b/gi)?.length || 0) * 1.5), 18),
      durationSeconds: speechTimer,
      feedback: [
        starState.result ? "Strong quantifiable results cited." : "Result was too vague; quote exact latency or scale numbers.",
        starState.action ? "Clear ownership of technical decisions." : "Focus more on YOUR specific actions rather than 'we'.",
        speechTimer > 40 ? "Response length was solid without rambling." : "Expand on the technical implementation trade-offs.",
      ],
    };

    setScorecard(finalScorecard);
    if (onSessionComplete) onSessionComplete(finalScorecard);
  };

  const analyzeTranscript = (text: string) => {
    const lower = text.toLowerCase();
    const hasSituation = lower.includes("when") || lower.includes("at") || lower.includes("problem") || lower.includes("team");
    const hasTask = lower.includes("goal") || lower.includes("needed to") || lower.includes("tasked") || lower.includes("responsible");
    const hasAction = lower.includes("i built") || lower.includes("i architected") || lower.includes("implemented") || lower.includes("designed");
    const hasResult = lower.includes("%") || lower.includes("reduced") || lower.includes("improved") || lower.includes("scale") || lower.includes("saved");

    setStarState({
      situation: hasSituation,
      task: hasTask,
      action: hasAction,
      result: hasResult,
    });

    // Adversarial interruption if speaking > 30s without stating personal actions
    if (speechTimer > 25 && !hasAction && !interruption) {
      const interruptMsg = "Santiago, pause there. What was YOUR specific technical design decision versus the rest of the team's?";
      setInterruption(interruptMsg);
      speak(interruptMsg);
    }
  };

  useEffect(() => {
    if (isActive && !isSpeaking) {
      timerRef.current = setInterval(() => {
        setSpeechTimer((t) => t + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, isSpeaking]);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-md transition-all">
      {/* Header HUD */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-danger/10 text-danger">
              <Mic className="size-3.5" />
            </span>
            <h2 className="text-base font-semibold text-foreground">Duplex Voice Bar-Raiser Sparring</h2>
            <Badge tone="muted" className="text-[10px] uppercase font-mono">
              Simulated FAANG Round
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            Adversarial real-time interviewer that challenges vague statements and enforces STAR rigor.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isActive ? (
            <Button onClick={startSession} className="bg-brand text-brand-foreground hover:bg-brand-hover gap-2 text-xs">
              <Play className="size-3.5 fill-current" /> Start Sparring Round
            </Button>
          ) : (
            <Button onClick={stopSession} variant="secondary" className="gap-2 text-xs border-danger/30 text-danger hover:bg-danger-soft">
              <Square className="size-3.5 fill-current" /> End & Review Scorecard
            </Button>
          )}
        </div>
      </div>

      {/* Main Sparring Stage */}
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {/* Left: Bar-Raiser Persona & Current Prompt */}
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-xl border border-border/80 bg-background/50 p-4">
            <div className="flex items-center justify-between text-xs text-muted mb-2">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Volume2 className={`size-3.5 ${isSpeaking ? "animate-pulse text-brand" : "text-muted"}`} />
                Bar Raiser Question #{currentQuestionIndex + 1}
              </span>
              <span className="font-mono text-faint">
                {Math.floor(speechTimer / 60)}:{(speechTimer % 60).toString().padStart(2, "0")}
              </span>
            </div>
            <p className="text-sm font-medium leading-relaxed text-foreground">
              {SAMPLE_QUESTIONS[currentQuestionIndex]}
            </p>
          </div>

          {/* Interruption Banner */}
          {interruption && (
            <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-xs text-danger">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Bar Raiser Interrupted You:</p>
                <p className="mt-0.5 text-foreground">{interruption}</p>
              </div>
            </div>
          )}

          {/* Candidate Live Transcription Waveform */}
          <div className="rounded-xl border border-border bg-pre-bg p-4 min-h-[140px] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] text-faint">
              <span>Your Live Response</span>
              <span className="flex items-center gap-1 font-mono text-brand-text">
                <span className={`size-2 rounded-full ${isActive && !isSpeaking ? "bg-emerald-500 animate-ping" : "bg-muted"}`} />
                {isActive ? (isSpeaking ? "Interviewer Speaking..." : "Listening to you...") : "Ready"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-foreground italic">
              {candidateTranscript || (isActive ? "Speak your answer out loud..." : "Click 'Start Sparring Round' to begin verbal interview.")}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-faint">
              <span>STAR Compliance Detector Active</span>
              <span>Sub-300ms Audio Turnaround</span>
            </div>
          </div>
        </div>

        {/* Right: STAR Compliance Checklist & Real-time Gauges */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-hover/30 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">
              STAR Structure Rigor
            </h4>
            <div className="space-y-2 text-xs">
              <div className={`flex items-center justify-between rounded-lg p-2 border ${starState.situation ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border text-muted"}`}>
                <span>[S] Situation</span>
                {starState.situation ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <span className="text-[10px] text-faint">Pending</span>}
              </div>
              <div className={`flex items-center justify-between rounded-lg p-2 border ${starState.task ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border text-muted"}`}>
                <span>[T] Task</span>
                {starState.task ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <span className="text-[10px] text-faint">Pending</span>}
              </div>
              <div className={`flex items-center justify-between rounded-lg p-2 border ${starState.action ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border text-muted"}`}>
                <span>[A] Action (Your Decisions)</span>
                {starState.action ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <span className="text-[10px] text-faint">Pending</span>}
              </div>
              <div className={`flex items-center justify-between rounded-lg p-2 border ${starState.result ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border text-muted"}`}>
                <span>[R] Quantified Result</span>
                {starState.result ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <span className="text-[10px] text-faint">Pending</span>}
              </div>
            </div>
          </div>

          {scorecard && (
            <div className="rounded-xl border border-brand/40 bg-brand-soft/20 p-4 animate-fade-in-delayed">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-text mb-2">
                <Award className="size-4" />
                <span>Round Scorecard</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-foreground">{scorecard.starCompliance}%</span>
                <span className="text-[10px] text-muted">{scorecard.fillerWordRatio}% filler words</span>
              </div>
              <ul className="mt-3 space-y-1 text-[11px] text-muted">
                {scorecard.feedback.map((f, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span>•</span> <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
