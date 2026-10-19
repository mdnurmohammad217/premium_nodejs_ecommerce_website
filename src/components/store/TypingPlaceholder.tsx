import React, { useEffect, useRef, useState } from 'react';

/**
 * v3.11 — the search box "types" its hint: each phrase is typed out, held for a
 * moment, rubbed out, and the next one follows (Dashboard → Website → Search
 * Box). Visitors who asked their device for less motion see the plain text.
 */
const SPEEDS = { slow: { type: 110, erase: 45, hold: 2000 }, normal: { type: 75, erase: 32, hold: 1600 }, fast: { type: 45, erase: 22, hold: 1200 } };

export const TypingPlaceholder: React.FC<{
  phrases: string[];
  fallback: string;
  speed?: 'slow' | 'normal' | 'fast';
  /** false pauses the animation (search box focused or filled in) */
  running?: boolean;
  className?: string;
}> = ({ phrases, fallback, speed = 'normal', running = true, className = '' }) => {
  const list = phrases.map((p) => String(p || '').trim()).filter(Boolean);
  const key = list.join('\u0001');
  const [text, setText] = useState('');
  const box = useRef<HTMLSpanElement>(null);
  const reduced =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate = list.length > 0 && !reduced;

  useEffect(() => {
    if (!animate || !running) return;
    const timing = SPEEDS[speed] || SPEEDS.normal;
    let phrase = 0;
    let shown = 0;
    let erasing = false;
    let timer = 0;
    const tick = () => {
      // A copy hidden by the layout (e.g. the desktop box on a phone) or a
      // background tab only checks back now and then — no work, no re-renders
      if (document.hidden || (box.current && box.current.offsetParent === null)) {
        timer = window.setTimeout(tick, 1200);
        return;
      }
      const target = list[phrase % list.length];
      if (!erasing) {
        shown += 1;
        setText(target.slice(0, shown));
        if (shown >= target.length) {
          erasing = true;
          timer = window.setTimeout(tick, timing.hold);
          return;
        }
        timer = window.setTimeout(tick, timing.type + Math.random() * 40);
        return;
      }
      shown -= 1;
      setText(target.slice(0, Math.max(0, shown)));
      if (shown <= 0) {
        erasing = false;
        phrase += 1;
        timer = window.setTimeout(tick, 380);
        return;
      }
      timer = window.setTimeout(tick, timing.erase);
    };
    timer = window.setTimeout(tick, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, speed, animate, running]);

  return (
    <span ref={box} aria-hidden className={`typing-ph pointer-events-none select-none truncate text-(--ds-text-muted) ${className}`}>
      {animate && running ? (
        <>
          {text}
          <span className="typing-caret" />
        </>
      ) : (
        fallback
      )}
    </span>
  );
};
