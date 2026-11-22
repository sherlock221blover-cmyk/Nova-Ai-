import React, { useEffect, useState } from 'react';
import {
  Anchor,
  Check,
  ExternalLink,
  HeartHandshake,
  Phone,
  Play,
  RotateCcw,
  Square,
  Wind,
  X,
} from 'lucide-react';

interface WellbeingModalProps {
  open: boolean;
  initialTab?: 'breathing' | 'grounding' | 'resources';
  onClose: () => void;
}

type BreathPhase = 'inhale' | 'hold' | 'exhale';

const PHASE_DURATION: Record<BreathPhase, number> = {
  inhale: 4,
  hold: 7,
  exhale: 8,
};

const PHASE_LABEL: Record<BreathPhase, string> = {
  inhale: 'Breathe in gently',
  hold: 'Hold softly',
  exhale: 'Breathe out slowly',
};

const GROUNDING_STEPS = [
  { count: 5, sense: 'See', prompt: 'Notice 5 calm things you can see around you right now.' },
  { count: 4, sense: 'Touch', prompt: 'Notice 4 things you can physically feel (chair, fabric, floor).' },
  { count: 3, sense: 'Hear', prompt: 'Listen for 3 gentle sounds in the room or outside.' },
  { count: 2, sense: 'Smell', prompt: 'Notice 2 scents nearby, or take two slow fresh breaths.' },
  { count: 1, sense: 'Taste', prompt: 'Notice 1 neutral or pleasant taste, or take a sip of water.' },
];

export const WellbeingModal: React.FC<WellbeingModalProps> = ({
  open,
  initialTab = 'breathing',
  onClose,
}) => {
  const [tab, setTab] = useState<'breathing' | 'grounding' | 'resources'>(initialTab);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<BreathPhase>('inhale');
  const [secondsLeft, setSecondsLeft] = useState<number>(PHASE_DURATION.inhale);
  const [cycles, setCycles] = useState(0);
  const [checkedSteps, setCheckedSteps] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
    } else {
      setRunning(false);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!running || !open) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        setPhase((currentPhase) => {
          if (currentPhase === 'inhale') {
            setSecondsLeft(PHASE_DURATION.hold);
            return 'hold';
          }
          if (currentPhase === 'hold') {
            setSecondsLeft(PHASE_DURATION.exhale);
            return 'exhale';
          }
          setCycles((c) => c + 1);
          setSecondsLeft(PHASE_DURATION.inhale);
          return 'inhale';
        });
        return 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, open]);

  if (!open) return null;

  const toggleStep = (count: number) => {
    setCheckedSteps((prev) =>
      prev.includes(count) ? prev.filter((c) => c !== count) : [...prev, count]
    );
  };

  const resetBreathing = () => {
    setRunning(false);
    setPhase('inhale');
    setSecondsLeft(PHASE_DURATION.inhale);
    setCycles(0);
  };

  const circleScale =
    !running
      ? 'scale-100'
      : phase === 'inhale'
      ? 'scale-125'
      : phase === 'hold'
      ? 'scale-125'
      : 'scale-95';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-md p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="NOVA Well-Being Toolkit"
    >
      <div className="w-full sm:max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0D1B38] border border-sky-400/20 shadow-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              Well-Being &amp; Calm Space
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Gentle tools to help you slow down, breathe, and find real human support when needed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close well-being toolkit"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'breathing' as const, label: '4-7-8 Breathing', icon: Wind },
            { id: 'grounding' as const, label: '5-4-3-2-1 Grounding', icon: Anchor },
            { id: 'resources' as const, label: 'Professional Support', icon: HeartHandshake },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'bg-[#081126] text-slate-300 hover:text-white border border-sky-400/15'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Guided Breathing */}
        {tab === 'breathing' && (
          <div className="rounded-2xl bg-[#081126] border border-sky-400/15 p-6 flex flex-col items-center text-center space-y-6">
            <div className="relative w-44 h-44 flex items-center justify-center">
              <div
                className={`absolute w-36 h-36 rounded-full bg-sky-500/15 border border-sky-400/40 transition-transform duration-1000 ease-in-out ${circleScale}`}
              />
              <div className="relative z-10 space-y-1">
                <p className="font-mono text-3xl font-semibold tabular-nums text-white">
                  {secondsLeft}s
                </p>
                <p className="text-xs font-medium text-sky-300">
                  {running ? PHASE_LABEL[phase] : 'Ready whenever you are'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Completed cycles: <span className="font-mono text-slate-200">{cycles}</span>
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRunning((r) => !r)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm inline-flex items-center gap-2 transition-colors"
              >
                {running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4" />}
                {running ? 'Pause' : 'Start Breathing'}
              </button>
              <button
                type="button"
                onClick={resetBreathing}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-white/5 inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: 5-4-3-2-1 Sensory Grounding */}
        {tab === 'grounding' && (
          <div className="space-y-2.5">
            {GROUNDING_STEPS.map((step) => {
              const done = checkedSteps.includes(step.count);
              return (
                <button
                  key={step.count}
                  type="button"
                  onClick={() => toggleStep(step.count)}
                  className={`w-full text-left rounded-2xl p-4 border transition-colors flex items-start gap-3 ${
                    done
                      ? 'bg-sky-500/15 border-sky-400/35'
                      : 'bg-[#081126] border-sky-400/15 hover:border-sky-400/30'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-mono text-xs font-semibold ${
                      done ? 'bg-sky-500 text-slate-950' : 'bg-[#0D1B38] text-sky-300'
                    }`}
                  >
                    {done ? <Check className="w-4 h-4" /> : step.count}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-sky-300">{step.sense}</p>
                    <p className="text-sm text-slate-200 mt-0.5 leading-relaxed">{step.prompt}</p>
                  </div>
                </button>
              );
            })}
            {checkedSteps.length > 0 && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setCheckedSteps([])}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Clear checkmarks
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Professional Mental Health Resources */}
        {tab === 'resources' && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-[#081126] border border-sky-400/15 p-4 text-xs text-slate-300 leading-relaxed">
              NOVA cares about your well-being and is always glad to listen, but NOVA is an AI
              companion—not a therapist, doctor, or crisis counselor. If you&apos;re going through
              a painful or overwhelming time, reaching out to a trusted person or licensed
              professional can make a real difference.
            </div>

            <div className="divide-y divide-sky-400/10 rounded-2xl bg-[#081126] border border-sky-400/15 overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">988 Suicide &amp; Crisis Lifeline</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Free, confidential 24/7 support (US &amp; Canada) · Call or text 988
                  </p>
                </div>
                <a
                  href="https://988lifeline.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                >
                  <Phone className="w-3.5 h-3.5" />
                  988lifeline.org
                </a>
              </div>

              <div className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Crisis Text Line</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    24/7 text support · Text HOME to 741741 (US/CA) or 85258 (UK)
                  </p>
                </div>
                <a
                  href="https://www.crisistextline.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Visit
                </a>
              </div>

              <div className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Find A Helpline (International)</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Free, confidential support services in over 130 countries
                  </p>
                </div>
                <a
                  href="https://findahelpline.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Find Help
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
