import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { AvatarState, NovaAvatarStage } from './NovaAvatarStage';
import { getOwnerIdToken } from '../lib/firebase';
import { MemoryItem, UserProfile } from '../types/nova';

interface LiveVoiceModalProps {
  open: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  playfulJealousy: boolean;
  memories: MemoryItem[];
}

function floatTo16BitPcmBase64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  open,
  onClose,
  profile,
  playfulJealousy,
  memories,
}) => {
  const [status, setStatus] = useState<'connecting' | 'ready' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [muted, setMuted] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [userTranscript, setUserTranscript] = useState('');
  const [novaTranscript, setNovaTranscript] = useState('');

  const mutedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setStatus('connecting');
    setErrorMsg('');
    setUserTranscript('');
    setNovaTranscript('');
    setAvatarState('idle');

    const stopPlaybackQueue = () => {
      activeSourcesRef.current.forEach((src) => {
        try {
          src.stop();
        } catch {
          // ignore
        }
      });
      activeSourcesRef.current.clear();
      if (outputCtxRef.current) {
        nextStartTimeRef.current = outputCtxRef.current.currentTime;
      } else {
        nextStartTimeRef.current = 0;
      }
    };

    const startSession = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const inputCtx = new AudioContext({ sampleRate: 16000 });
        const outputCtx = new AudioContext({ sampleRate: 24000 });
        inputCtxRef.current = inputCtx;
        outputCtxRef.current = outputCtx;
        nextStartTimeRef.current = outputCtx.currentTime;

        const idToken = await getOwnerIdToken();
        if (cancelled) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) return;
          ws.send(
            JSON.stringify({
              type: 'init',
              idToken,
              preferredName: profile?.preferredName || 'Muhib',
              preferredLanguage: profile?.preferredLanguage || 'English',
              voiceName: profile?.voiceName || 'Kore',
              voiceStyle: profile?.voiceStyle || 'warm',
              playfulJealousy,
              currentMood: profile?.currentMood,
              currentMoodNote: profile?.currentMoodNote,
              memories: memories.slice(0, 20).map((m) => ({
                category: m.category,
                content: m.content,
              })),
            })
          );

          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (event) => {
            if (cancelled || mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
            const channelData = event.inputBuffer.getChannelData(0);

            // Compute RMS level for visual aura
            let sum = 0;
            for (let i = 0; i < channelData.length; i++) {
              sum += channelData[i] * channelData[i];
            }
            const rms = Math.sqrt(sum / channelData.length);
            if (rms > 0.015) {
              setAudioLevel(Math.min(1, rms * 5));
              setAvatarState((prev) => (prev === 'speaking' ? 'speaking' : 'listening'));
            } else {
              setAudioLevel((prev) => Math.max(0, prev * 0.8));
            }

            const base64Pcm = floatTo16BitPcmBase64(channelData);
            ws.send(JSON.stringify({ type: 'audio', data: base64Pcm }));
          };

          source.connect(processor);
          processor.connect(inputCtx.destination);
        };

        ws.onmessage = (event) => {
          if (cancelled) return;
          const msg = JSON.parse(event.data) as {
            type: string;
            data?: string;
            text?: string;
            message?: string;
          };

          if (msg.type === 'ready') {
            setStatus('ready');
            setAvatarState('listening');
          } else if (msg.type === 'audio' && msg.data && outputCtxRef.current) {
            const ctx = outputCtxRef.current;
            if (ctx.state === 'suspended') {
              ctx.resume().catch(() => {});
            }
            const floatSamples = base64PcmToFloat32(msg.data);
            const audioBuffer = ctx.createBuffer(1, floatSamples.length, 24000);
            audioBuffer.copyToChannel(new Float32Array(floatSamples), 0);

            const sourceNode = ctx.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(ctx.destination);

            const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
            sourceNode.start(startAt);
            nextStartTimeRef.current = startAt + audioBuffer.duration;

            activeSourcesRef.current.add(sourceNode);
            setAvatarState('speaking');
            setAudioLevel(0.65);

            sourceNode.onended = () => {
              activeSourcesRef.current.delete(sourceNode);
              if (activeSourcesRef.current.size === 0 && !cancelled) {
                setAvatarState('listening');
                setAudioLevel(0.08);
              }
            };
          } else if (msg.type === 'inputTranscript' && msg.text) {
            setUserTranscript((prev) => `${prev}${msg.text}`.slice(-280));
          } else if (msg.type === 'outputTranscript' && msg.text) {
            setNovaTranscript((prev) => `${prev}${msg.text}`.slice(-420));
          } else if (msg.type === 'interrupted') {
            stopPlaybackQueue();
            setAvatarState('listening');
          } else if (msg.type === 'turnComplete') {
            if (activeSourcesRef.current.size === 0) {
              setAvatarState('listening');
            }
          } else if (msg.type === 'error') {
            setStatus('error');
            setErrorMsg(msg.message || 'Voice session error.');
          }
        };

        ws.onerror = () => {
          if (!cancelled) {
            setStatus('error');
            setErrorMsg('Could not establish live voice WebSocket connection.');
          }
        };
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Microphone access is required for voice conversations.'
          );
        }
      }
    };

    startSession();

    return () => {
      cancelled = true;
      stopPlaybackQueue();
      try {
        processorRef.current?.disconnect();
      } catch {
        // ignore
      }
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      try {
        inputCtxRef.current?.close();
      } catch {
        // ignore
      }
      try {
        outputCtxRef.current?.close();
      } catch {
        // ignore
      }
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, [
    open,
    profile?.preferredName,
    profile?.preferredLanguage,
    profile?.voiceName,
    profile?.voiceStyle,
    profile?.currentMood,
    profile?.currentMoodNote,
    playfulJealousy,
    memories,
  ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#050B1A]/95 backdrop-blur-lg flex flex-col items-center justify-between p-5 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Live Voice Conversation with NOVA"
    >
      <div className="w-full max-w-2xl flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">NOVA Live Voice</h2>
          <p className="text-xs text-sky-300/90 mt-0.5 flex items-center gap-2">
            {status === 'ready' && (
              <span
                className="w-2 h-2 rounded-full bg-sky-400 animate-pulse inline-block"
                aria-hidden="true"
              />
            )}
            <span>
              {status === 'connecting'
                ? 'Connecting microphone and voice stream...'
                : status === 'error'
                ? 'Connection unavailable'
                : avatarState === 'speaking'
                ? 'NOVA is speaking'
                : muted
                ? 'Microphone muted'
                : 'Listening naturally — speak anytime'}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 text-sm text-slate-300 hover:bg-white/5 transition-colors"
        >
          Close
        </button>
      </div>

      <div className="w-full max-w-md my-auto space-y-5 text-center">
        <NovaAvatarStage state={avatarState} audioLevel={audioLevel} compact />

        {status === 'error' ? (
          <div className="rounded-2xl bg-rose-500/10 border border-rose-400/25 p-4 text-sm text-rose-200">
            {errorMsg}
          </div>
        ) : (
          <div className="space-y-3 min-h-[112px]">
            {userTranscript && (
              <div className="rounded-2xl bg-[#0D1B38]/80 border border-sky-400/15 px-4 py-2.5 text-sm text-slate-300">
                <span className="text-xs text-sky-300 font-medium block mb-0.5">You</span>
                {userTranscript}
              </div>
            )}
            {novaTranscript && (
              <div className="rounded-2xl bg-sky-500/10 border border-sky-400/25 px-4 py-3 text-sm text-slate-100">
                <span className="text-xs text-sky-300 font-medium inline-flex items-center gap-1 mb-0.5">
                  <Volume2 className="w-3.5 h-3.5" />
                  NOVA
                </span>
                <p>{novaTranscript}</p>
              </div>
            )}
            {!userTranscript && !novaTranscript && status === 'ready' && (
              <p className="text-sm text-slate-400">
                Say &ldquo;Hey NOVA, how is my day looking?&rdquo; or just say hello.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 pb-safe">
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          disabled={status !== 'ready'}
          className={`min-h-[52px] px-5 py-3 rounded-2xl border text-sm font-medium inline-flex items-center gap-2 transition-colors disabled:opacity-50 ${
            muted
              ? 'bg-amber-500/15 border-amber-400/35 text-amber-200'
              : 'bg-[#0D1B38] border-sky-400/25 text-slate-100 hover:bg-[#13254B]'
          }`}
        >
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          {muted ? 'Unmute Mic' : 'Mute Mic'}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[52px] px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors shadow-lg shadow-rose-950/40"
        >
          <PhoneOff className="w-5 h-5" />
          End Call
        </button>
      </div>
    </div>
  );
};
