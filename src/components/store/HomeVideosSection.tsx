import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Clapperboard, Play, X } from 'lucide-react';
import { SiteSettings } from '../../types/index.ts';
import { keepTabInside } from '../../lib/focusTrap.ts';

/**
 * v3.12 — YouTube videos above the footer of the home page.
 *
 * Dashboard → Website → Home Sections → Videos: paste YouTube links (normal,
 * youtu.be, Shorts or live), give each an optional title, switch the section
 * on or off, and optionally link "View all videos" to the channel.
 *
 * Fast by design: only the thumbnail picture is shown (lazy-loaded). YouTube's
 * player — about 1 MB — loads only when a visitor taps play, in a pop-up
 * player, using the privacy-friendly youtube-nocookie.com address.
 */

export interface HomeVideo {
  id?: string;
  url: string;
  title?: string;
}

export interface HomeVideosConfig {
  enabled?: boolean;
  title?: string;
  channelUrl?: string;
  buttonText?: string;
  videos?: HomeVideo[];
}

/** YouTube video id from any common link, or null */
export function youtubeIdOf(url?: string | null): string | null {
  const value = String(url || '').trim();
  if (!value) return null;
  const match =
    value.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i) ||
    value.match(/youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})/i);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
}

export const isShortsUrl = (url?: string | null) => /youtube\.com\/shorts\//i.test(String(url || ''));

export const homeVideosOf = (settings?: SiteSettings) => {
  const raw = ((settings as any)?.home_videos_config || {}) as HomeVideosConfig;
  const videos = (Array.isArray(raw.videos) ? raw.videos : [])
    .map((video) => ({ ...video, youtubeId: youtubeIdOf(video?.url) }))
    .filter((video): video is HomeVideo & { youtubeId: string } => Boolean(video.youtubeId));
  const channel = String(raw.channelUrl || '').trim();
  return {
    enabled: raw.enabled !== false,
    title: String(raw.title || '').trim() || 'Videos',
    channelUrl: /^https?:\/\//i.test(channel) ? channel : '',
    buttonText: String(raw.buttonText || '').trim() || 'View all videos',
    videos,
  };
};

const Player: React.FC<{ video: { youtubeId: string; title?: string; url: string }; onClose: () => void }> = ({ video, onClose }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  const vertical = isShortsUrl(video.url);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeHandler.current();
      keepTabInside(event, cardRef.current);
    };
    const opener = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    const focus = window.setTimeout(() => closeRef.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focus);
      document.body.style.overflow = previous;
      opener?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-(--ds-s-3) sm:p-(--ds-s-8)" role="dialog" aria-modal="true" aria-label={video.title || 'Video'}>
      <div className="absolute inset-0 ds-fade-in" style={{ background: 'rgba(8, 10, 15, 0.82)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div ref={cardRef} className={`relative w-full ${vertical ? 'max-w-[400px]' : 'max-w-5xl'} ds-scale-in`}>
        <div className="flex items-center justify-between gap-(--ds-s-3) mb-(--ds-s-2)">
          <p className="min-w-0 truncate text-white/90 font-(--ds-fw-semibold) text-(length:--ds-fs-md)">{video.title}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close video"
            className="shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-(--ds-r-full) bg-white/12 hover:bg-white/22 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className={`relative w-full overflow-hidden rounded-(--ds-r-xl) bg-black shadow-(--ds-shadow-xl) ${vertical ? 'aspect-[9/16] max-h-[80vh]' : 'aspect-video'}`}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={video.title || 'YouTube video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

export const HomeVideosSection: React.FC<{ settings?: SiteSettings }> = ({ settings }) => {
  const cfg = homeVideosOf(settings);
  const [playing, setPlaying] = useState<(HomeVideo & { youtubeId: string }) | null>(null);

  if (!cfg.enabled || cfg.videos.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-(--ds-s-4)" aria-labelledby="home-videos-title">
      <div className="flex items-center justify-between gap-(--ds-s-3) mb-(--ds-s-4)">
        <h2
          id="home-videos-title"
          className="min-w-0 flex items-center gap-(--ds-s-2) text-(length:--ds-fs-xl) sm:text-(length:--ds-fs-2xl) font-(--ds-fw-bold) text-(--ds-text)"
        >
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-(--ds-r-md) text-(--primary) bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
          >
            <Clapperboard className="w-5 h-5" />
          </span>
          <span className="truncate">{cfg.title}</span>
        </h2>
        {cfg.channelUrl && (
          <a
            href={cfg.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group shrink-0 inline-flex items-center gap-(--ds-s-1) h-(--ds-h-sm) px-(--ds-s-3) rounded-(--ds-r-full) text-(length:--ds-fs-sm) font-(--ds-fw-semibold) text-(--primary) bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] transition-colors"
          >
            <span className="hidden sm:inline">{cfg.buttonText}</span>
            <span className="sm:hidden">View all</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        )}
      </div>

      {/* Phones: a sliding row; tablets 2 a row, computers 4 a row */}
      <div className="ds-scroll-hide flex gap-(--ds-s-3) overflow-x-auto snap-x snap-mandatory pb-(--ds-s-1) sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-(--ds-s-4) sm:overflow-visible sm:pb-0">
        {cfg.videos.map((video, index) => (
          <article key={video.id || `${video.youtubeId}-${index}`} className="shrink-0 basis-[82%] min-[480px]:basis-[60%] sm:basis-auto snap-start min-w-0">
            <button
              type="button"
              onClick={() => setPlaying(video)}
              aria-label={`Play video${video.title ? `: ${video.title}` : ` ${index + 1}`}`}
              className="group relative block w-full aspect-video overflow-hidden rounded-(--ds-r-xl) bg-(--ds-gray-900) shadow-(--ds-shadow-sm) hover:shadow-(--ds-shadow-lg) transition-shadow cursor-pointer"
            >
              <img
                src={`https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`}
                srcSet={`https://i.ytimg.com/vi/${video.youtubeId}/mqdefault.jpg 320w, https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg 480w`}
                sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 82vw"
                alt=""
                loading="lazy"
                decoding="async"
                onError={(event) => (event.currentTarget.style.visibility = 'hidden')}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-(--ds-dur-slow) ease-(--ds-ease) group-hover:scale-[1.04]"
              />
              <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
              <span
                aria-hidden
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 sm:w-16 sm:h-16 rounded-full inline-flex items-center justify-center text-(--primary-foreground) bg-(--primary) shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5)] ring-4 ring-white/25 transition-transform duration-(--ds-dur) group-hover:scale-110"
              >
                <Play className="w-6 h-6 sm:w-7 sm:h-7 translate-x-0.5" fill="currentColor" />
              </span>
            </button>
            {video.title && (
              <h3 className="mt-(--ds-s-2) px-0.5 text-(length:--ds-fs-md) font-(--ds-fw-semibold) text-(--ds-text) ds-clamp-2 leading-snug">{video.title}</h3>
            )}
          </article>
        ))}
      </div>

      {playing && <Player video={playing} onClose={() => setPlaying(null)} />}
    </section>
  );
};
