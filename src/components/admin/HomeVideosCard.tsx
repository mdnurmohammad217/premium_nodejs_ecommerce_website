import React, { useEffect, useState } from 'react';
import { Clapperboard, Plus, Save, Check, Trash2, ArrowUp, ArrowDown, Wand2 } from 'lucide-react';
import { Card, CardHeader, Button, Field, Toggle, mix } from './ui.tsx';
import { SiteSettings } from '../../types/index.ts';
import { youtubeIdOf, type HomeVideosConfig } from '../store/HomeVideosSection.tsx';

/**
 * v3.12 — Website → Home Sections → Videos.
 * YouTube links shown above the footer of the home page. Paste a link (the
 * title is filled in from YouTube), drag the order with the arrows, switch the
 * section on or off.
 */
const MAX_VIDEOS = 12;
const newId = () => `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const HomeVideosCard: React.FC<{ settings: SiteSettings; onSaveSettings: (next: SiteSettings) => Promise<void> | void }> = ({
  settings,
  onSaveSettings,
}) => {
  const stored = ((settings as any)?.home_videos_config || {}) as HomeVideosConfig;
  const fresh = (): HomeVideosConfig => ({
    enabled: stored.enabled !== false,
    title: stored.title || '',
    channelUrl: stored.channelUrl || '',
    buttonText: stored.buttonText || '',
    videos: (stored.videos || []).map((video) => ({ id: video.id || newId(), url: video.url || '', title: video.title || '' })),
  });
  const [draft, setDraft] = useState<HomeVideosConfig>(fresh);
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(fresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(stored)]);

  const videos = draft.videos || [];
  const change = (patch: Partial<HomeVideosConfig>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const setVideos = (next: NonNullable<HomeVideosConfig['videos']>) => change({ videos: next });

  const lookupTitle = async (url: string): Promise<string> => {
    try {
      const res = await fetch(`/api/admin/video-info?url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => ({}));
      return String(data?.title || '');
    } catch {
      return '';
    }
  };

  const add = async () => {
    const url = newUrl.trim();
    setAddError('');
    if (!youtubeIdOf(url)) {
      setAddError('Paste a YouTube video link, e.g. https://www.youtube.com/watch?v=… or https://youtu.be/…');
      return;
    }
    if (videos.length >= MAX_VIDEOS) {
      setAddError(`Up to ${MAX_VIDEOS} videos.`);
      return;
    }
    if (videos.some((video) => youtubeIdOf(video.url) === youtubeIdOf(url))) {
      setAddError('This video is already in the list.');
      return;
    }
    setAdding(true);
    const title = await lookupTitle(url);
    setAdding(false);
    setVideos([...videos, { id: newId(), url, title }]);
    setNewUrl('');
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= videos.length) return;
    const next = [...videos];
    [next[index], next[target]] = [next[target], next[index]];
    setVideos(next);
  };

  const save = async () => {
    const bad = videos.find((video) => !youtubeIdOf(video.url));
    if (bad) {
      setError('One of the links is not a YouTube video link. Fix or remove it, then save.');
      return;
    }
    const channel = String(draft.channelUrl || '').trim();
    if (channel && !/^https?:\/\//i.test(channel)) {
      setError('The “View all videos” link must start with https://');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const clean: HomeVideosConfig = {
        enabled: draft.enabled !== false,
        title: String(draft.title || '').trim(),
        channelUrl: channel,
        buttonText: String(draft.buttonText || '').trim(),
        videos: videos.map((video) => ({ id: video.id, url: video.url.trim(), title: String(video.title || '').trim() })),
      };
      await onSaveSettings({ ...settings, home_videos_config: clean } as any);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card accent="var(--ds-danger)">
      <CardHeader
        title="Videos (above the footer)"
        subtitle="YouTube videos on the home page, right above the footer. Only the picture loads with the page; the player opens when a visitor taps play, so the page stays fast."
        icon={Clapperboard}
        accent="var(--ds-danger)"
        actions={
          <Button variant="primary" icon={saved ? Check : Save} onClick={save} loading={saving}>
            {saved ? 'Saved' : 'Save Videos'}
          </Button>
        }
      />

      <Toggle
        checked={draft.enabled !== false}
        onChange={(value) => change({ enabled: value })}
        label="Show the video section"
        description="The section is hidden automatically while the list is empty."
      />

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Field label="Section title">
          <input className="a-field" value={draft.title || ''} placeholder="Videos" maxLength={60} onChange={(event) => change({ title: event.target.value })} />
        </Field>
        <Field label="“View all videos” link (optional)" hint="Your YouTube channel, e.g. https://www.youtube.com/@yourshop">
          <input
            className="a-field"
            value={draft.channelUrl || ''}
            placeholder="https://www.youtube.com/@…"
            inputMode="url"
            onChange={(event) => change({ channelUrl: event.target.value })}
          />
        </Field>
        <Field label="Button text">
          <input
            className="a-field"
            value={draft.buttonText || ''}
            placeholder="View all videos"
            maxLength={40}
            onChange={(event) => change({ buttonText: event.target.value })}
          />
        </Field>
      </div>

      <div className="mt-5 p-3" style={{ borderRadius: 'var(--ds-r-md)', background: mix('var(--ds-danger)', 0.05), border: `1px solid ${mix('var(--ds-danger)', 0.18)}` }}>
        <label className="a-label" htmlFor="home-video-url">
          Add a YouTube video
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="home-video-url"
            className="a-field flex-1"
            value={newUrl}
            placeholder="https://www.youtube.com/watch?v=…  or  https://youtu.be/…  or a Shorts link"
            inputMode="url"
            onChange={(event) => setNewUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void add();
              }
            }}
          />
          <Button variant="primary" icon={Plus} onClick={add} loading={adding} disabled={!newUrl.trim()}>
            Add video
          </Button>
        </div>
        {addError && <p className="ds-error-text">{addError}</p>}
      </div>

      <div className="mt-4">
        {videos.length === 0 ? (
          <p
            className="p-4 text-center"
            style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', border: '1px dashed var(--a-border)', borderRadius: 'var(--ds-r-md)' }}
          >
            No video yet. Paste a YouTube link above.
          </p>
        ) : (
          <ul className="space-y-2">
            {videos.map((video, index) => {
              const id = youtubeIdOf(video.url);
              return (
                <li
                  key={video.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-2.5"
                  style={{ border: '1px solid var(--a-border)', borderRadius: 'var(--ds-r-md)', background: 'var(--a-surface)' }}
                >
                  <span
                    className="relative shrink-0 overflow-hidden w-full sm:w-36 aspect-video"
                    style={{ borderRadius: 'var(--ds-r-sm)', background: 'var(--ds-gray-900)' }}
                  >
                    {id && (
                      <img
                        src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`}
                        alt=""
                        loading="lazy"
                        onError={(event) => (event.currentTarget.style.visibility = 'hidden')}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex gap-2">
                      <input
                        className="a-field flex-1"
                        value={video.title || ''}
                        placeholder="Title (optional)"
                        maxLength={160}
                        aria-label={`Title of video ${index + 1}`}
                        onChange={(event) => setVideos(videos.map((item) => (item.id === video.id ? { ...item, title: event.target.value } : item)))}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Wand2}
                        title="Fill in the title from YouTube"
                        onClick={async () => {
                          const title = await lookupTitle(video.url);
                          if (title) setVideos(videos.map((item) => (item.id === video.id ? { ...item, title } : item)));
                        }}
                      >
                        <span className="hidden md:inline">From YouTube</span>
                      </Button>
                    </div>
                    <input
                      className="a-field"
                      value={video.url}
                      aria-label={`Link of video ${index + 1}`}
                      onChange={(event) => setVideos(videos.map((item) => (item.id === video.id ? { ...item, url: event.target.value } : item)))}
                      style={{ fontSize: 'var(--a-fs-sm)', color: id ? undefined : 'var(--ds-danger)' }}
                    />
                  </div>
                  <div className="flex sm:flex-col gap-1 shrink-0">
                    <IconAction label="Move up" onClick={() => move(index, -1)} disabled={index === 0} icon={ArrowUp} />
                    <IconAction label="Move down" onClick={() => move(index, 1)} disabled={index === videos.length - 1} icon={ArrowDown} />
                    <IconAction
                      label="Remove"
                      danger
                      onClick={() => setVideos(videos.filter((item) => item.id !== video.id))}
                      icon={Trash2}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && <p className="ds-error-text mt-3">{error}</p>}
    </Card>
  );
};

const IconAction: React.FC<{ label: string; onClick: () => void; disabled?: boolean; danger?: boolean; icon: typeof Trash2 }> = ({
  label,
  onClick,
  disabled,
  danger,
  icon: Icon,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="w-8 h-8 inline-flex items-center justify-center cursor-pointer disabled:opacity-35 disabled:cursor-default"
    style={{
      borderRadius: 'var(--ds-r-md)',
      color: danger ? 'var(--ds-danger)' : 'var(--a-text-soft)',
      background: danger ? mix('var(--ds-danger)', 0.08) : 'var(--a-surface-3)',
    }}
  >
    <Icon className="w-4 h-4" />
  </button>
);
