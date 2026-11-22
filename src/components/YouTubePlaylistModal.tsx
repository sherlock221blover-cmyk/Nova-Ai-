import React, { useState } from 'react';
import { ExternalLink, Music, Play, Sparkles, X } from 'lucide-react';

interface YouTubePlaylist {
  id: string;
  title: string;
  channel: string;
  description: string;
  videoId: string;
  tags: string[];
}

const PLAYLISTS_DATABASE: YouTubePlaylist[] = [
  {
    id: 'lofi_calm',
    title: 'Lofi Girl - Lofi Hip Hop Beats to Relax / Study to',
    channel: 'Lofi Girl',
    description: 'Calming, cozy lofi beats to soothe anxiety and help you focus peacefully.',
    videoId: 'jfKfPfyJRdk',
    tags: ['calm', 'stress', 'focus', 'anxiety', 'tired'],
  },
  {
    id: 'ambient_sleep',
    title: 'Peaceful Ambient Sleep & Relaxation Music',
    channel: 'Soothing Relaxation',
    description: 'Dreamy ambient soundscapes and soft piano for deep relaxation and unwinding.',
    videoId: 'lFcSrYw-ARY',
    tags: ['stress', 'overwhelm', 'sadness', 'tired', 'calm'],
  },
  {
    id: 'uplifting_acoustic',
    title: 'Uplifting Acoustic & Positive Morning Coffee Indie',
    channel: 'Indie Air',
    description: 'Warm, cheerful acoustic melodies to lift your spirits and bring a smile.',
    videoId: '7NOS8R0FPvA',
    tags: ['happy', 'excited', 'energy'],
  },
  {
    id: 'deep_focus_piano',
    title: 'Relaxing Piano & Soft Strings for Deep Concentration',
    channel: 'Yellow Brick Cinema',
    description: 'Peaceful instrumental piano music to quiet a busy mind.',
    videoId: '2OEL4P1Rz04',
    tags: ['calm', 'focus', 'stress'],
  },
  {
    id: 'chill_vibes',
    title: 'Chillhop Radio - Jazzy & Lofi Hip Hop Beats',
    channel: 'Chillhop Music',
    description: 'Smooth jazzy lofi beats for easy listening and comfortable companionship.',
    videoId: '5yx6BWlEVcY',
    tags: ['happy', 'calm', 'excited'],
  },
];

interface YouTubePlaylistModalProps {
  open: boolean;
  moodHint?: string;
  onClose: () => void;
}

export const YouTubePlaylistModal: React.FC<YouTubePlaylistModalProps> = ({
  open,
  moodHint,
  onClose,
}) => {
  const [selectedVideo, setSelectedVideo] = useState<YouTubePlaylist | null>(null);

  if (!open) return null;

  const normalizedMood = (moodHint || 'calm').toLowerCase();
  const matchedPlaylists = PLAYLISTS_DATABASE.filter((p) =>
    p.tags.some((t) => normalizedMood.includes(t))
  );
  const displayPlaylists = matchedPlaylists.length > 0 ? matchedPlaylists : PLAYLISTS_DATABASE;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Curated YouTube Music Playlists"
    >
      <div className="w-full sm:max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl bg-[#0D1B38] border border-sky-400/20 shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-sky-300 inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Curated YouTube Music</span>
            </p>
            <h2 className="font-display text-xl font-semibold text-white">
              Music Playlists for Your Mood
            </h2>
            <p className="text-xs text-slate-300">
              Hand-picked YouTube streams and soundtracks tailored to how you are feeling right now.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close playlists modal"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {selectedVideo ? (
          <div className="space-y-4">
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-sky-400/20">
              <iframe
                src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1`}
                title={selectedVideo.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-sm font-semibold text-white">
                  {selectedVideo.title}
                </p>
                <p className="text-xs text-slate-400">{selectedVideo.channel}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVideo(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 text-xs font-medium"
              >
                Back to Playlists
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {displayPlaylists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                onClick={() => setSelectedVideo(playlist)}
                className="text-left rounded-2xl bg-[#081126] hover:bg-[#112247] border border-sky-400/15 hover:border-sky-400/35 p-4 space-y-3 transition-colors flex flex-col justify-between"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sky-300">
                    <Music className="w-4 h-4" />
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-200">
                      YouTube
                    </span>
                  </div>
                  <p className="font-display text-sm font-semibold text-white line-clamp-1">
                    {playlist.title}
                  </p>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {playlist.description}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-sky-300 pt-1">
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play Music</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
