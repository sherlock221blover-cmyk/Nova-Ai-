import React, { useState } from 'react';
import { Mic, Volume2, MessageSquare } from 'lucide-react';

export const NOVA_PORTRAIT_URL = '/src/assets/images/nova_avatar_hero_1795361651340.jpg';
export const NOVA_BACKDROP_URL = '/src/assets/images/nova_ambient_backdrop_1795361652434.jpg';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface NovaAvatarStageProps {
  state?: AvatarState;
  audioLevel?: number; // 0 to 1
  onStartVoice?: () => void;
  onOpenChat?: () => void;
  compact?: boolean;
}

export const NovaAvatarStage: React.FC<NovaAvatarStageProps> = ({
  state = 'idle',
  audioLevel = 0,
  onStartVoice,
  onOpenChat,
  compact = false,
}) => {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [imgError, setImgError] = useState(false);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -ny * 8, y: nx * 8 });
  };

  const handlePointerLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  const stateCaption =
    state === 'listening'
      ? 'Listening to you'
      : state === 'thinking'
      ? 'Thinking'
      : state === 'speaking'
      ? 'Speaking'
      : 'Ready when you are';

  const ringScale = 1 + Math.min(0.16, audioLevel * 0.22);

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`relative overflow-hidden rounded-3xl bg-[#0A1630] border border-sky-400/20 shadow-2xl ${
        compact ? 'aspect-square max-w-[260px] mx-auto' : 'aspect-[3/4] max-h-[540px] w-full'
      }`}
      style={{ perspective: '900px' }}
    >
      {/* Atmospheric ambient backdrop */}
      <img
        src={NOVA_BACKDROP_URL}
        alt=""
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none select-none"
        aria-hidden="true"
      />

      {/* Holographic orbital light rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="w-[82%] aspect-square rounded-full border border-sky-400/20 nova-orbital transition-transform duration-150"
          style={{
            transform: `scale(${ringScale})`,
            boxShadow:
              state === 'speaking' || state === 'listening'
                ? '0 0 48px rgba(56, 189, 248, 0.26)'
                : '0 0 28px rgba(56, 189, 248, 0.12)',
          }}
        />
        <div className="absolute w-[66%] aspect-square rounded-full border border-blue-300/15 nova-halo" />
      </div>

      {/* 3D Portrait Container */}
      <div
        className="relative w-full h-full transition-transform duration-200 ease-out will-change-transform"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        }}
      >
        {!imgError ? (
          <img
            src={NOVA_PORTRAIT_URL}
            alt="NOVA — personal AI companion"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-top nova-breathe select-none"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#0F234B] to-[#060D1E] p-6 text-center">
            <div className="w-24 h-24 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center mb-4">
              <Volume2 className="w-10 h-10 text-sky-300" />
            </div>
            <p className="font-display text-xl font-semibold text-slate-100">NOVA</p>
          </div>
        )}
      </div>

      {/* Measured contrast gradient scrim for bottom controls */}
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#060D1E]/95 via-[#060D1E]/70 to-transparent pointer-events-none" />

      {/* Foreground caption & primary triggers */}
      {!compact && (
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
                NOVA
              </h2>
              <p className="text-xs text-sky-200/90 mt-0.5 tracking-wide">
                Personal AI Companion · {stateCaption}
              </p>
            </div>
          </div>

          {(onStartVoice || onOpenChat) && (
            <div className="flex items-center gap-2.5">
              {onStartVoice && (
                <button
                  type="button"
                  onClick={onStartVoice}
                  className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 transition-colors whitespace-nowrap"
                >
                  <Mic className="w-4 h-4 shrink-0" />
                  Voice Conversation
                </button>
              )}
              {onOpenChat && (
                <button
                  type="button"
                  onClick={onOpenChat}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur-md border border-sky-300/25 text-slate-100 font-medium text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  Chat
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
