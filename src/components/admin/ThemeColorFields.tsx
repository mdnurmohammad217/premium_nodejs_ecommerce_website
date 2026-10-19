import React, { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Field } from './ui.tsx';
import { contrastWithWhite, hoverShade, isHexColor, lightTint, readableOnWhite, textOnColor } from '../../lib/contrast.ts';
import type { ThemeColors } from '../../context/ThemeContext.tsx';

/**
 * v3.12.1 — Theme & Colors → Custom colours.
 *
 * The website is built on ONE brand colour: buttons, links, prices, icons,
 * badges, the header pill, the checkout and the dashboard all follow it.
 * (The old "Secondary" / "Accent" pickers were not used by any page, so a
 * change there looked like the theme was broken; they are gone from here.)
 *
 * A colour is applied only once it is a full #rrggbb / #rgb value, so a
 * half-typed "#ea" never blanks the buttons. The hover shade is worked out
 * from the brand colour unless the owner picks one.
 */

const ColorInput: React.FC<{
  label: string;
  hint?: string;
  value: string;
  onChange: (hex: string) => void;
}> = ({ label, hint, value, onChange }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const bad = draft.trim() !== '' && !isHexColor(draft.trim());
  const id = `theme-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <Field label={label} hint={hint} error={bad ? 'Use a colour code like #ea580c' : undefined}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={isHexColor(value) && value.length === 7 ? value : '#059669'}
          onChange={(event) => onChange(event.target.value)}
          className="cursor-pointer p-0.5 shrink-0"
          style={{ width: 38, height: 38, borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)' }}
        />
        <input
          id={id}
          type="text"
          inputMode="text"
          spellCheck={false}
          maxLength={7}
          value={draft}
          onChange={(event) => {
            let next = event.target.value.trim();
            if (next && !next.startsWith('#')) next = `#${next}`;
            setDraft(next);
            if (isHexColor(next)) onChange(next.toLowerCase());
          }}
          onBlur={() => setDraft(value)}
          aria-invalid={bad}
          className="a-field ds-num"
          style={bad ? { borderColor: 'var(--ds-danger)' } : undefined}
        />
      </div>
    </Field>
  );
};

export const ThemeColorFields: React.FC<{
  colors: ThemeColors;
  setCustomColors: (next: Partial<ThemeColors>) => void;
}> = ({ colors, setCustomColors }) => {
  const valid = isHexColor(colors.primaryColor);
  const autoHover = valid ? hoverShade(colors.primaryColor) : colors.primaryHover;
  // How readable the white button text is on the chosen colour (light
  // colours get dark text instead, which is always readable)
  const ratio = valid ? contrastWithWhite(colors.primaryColor) : 21;
  const lowContrast = valid && textOnColor(colors.primaryColor) === '#ffffff' && ratio < 4.5;
  const darker = valid ? readableOnWhite(colors.primaryColor, 4.6) : colors.primaryColor;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ColorInput
          label="Brand colour"
          hint="Buttons, links, prices, icons and badges on the website, dashboard and POS."
          value={colors.primaryColor}
          onChange={(hex) =>
            setCustomColors({ primaryColor: hex, primaryHover: hoverShade(hex), primaryLight: lightTint(hex) })
          }
        />
        <ColorInput
          label="Button hover colour"
          hint="Shown when the mouse is over a button. Set for you when you pick a brand colour."
          value={colors.primaryHover || autoHover}
          onChange={(hex) => setCustomColors({ primaryHover: hex })}
        />
      </div>

      {lowContrast && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 p-3"
          style={{ borderRadius: 'var(--ds-r-md)', background: 'var(--ds-warning-soft, #fffbeb)', border: '1px solid var(--ds-warning-border, #fde68a)' }}
        >
          <p style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text)' }}>
            Button text on this colour is a little hard to read ({ratio.toFixed(1)} : 1). The website works fine, but
            PageSpeed&apos;s Accessibility score likes 4.5 : 1 or more.
          </p>
          <button
            type="button"
            onClick={() => setCustomColors({ primaryColor: darker, primaryHover: hoverShade(darker), primaryLight: lightTint(darker) })}
            className="a-btn inline-flex items-center gap-2 px-3 h-9 font-semibold cursor-pointer"
            style={{ borderRadius: 'var(--ds-r-md)', border: '1px solid var(--a-border)', background: 'var(--a-surface)', fontSize: 'var(--a-fs-sm)' }}
          >
            <span className="inline-block rounded-full" style={{ width: 14, height: 14, background: darker }} />
            Use a slightly darker shade ({darker})
          </button>
        </div>
      )}

      {/* Live preview — uses the same colour variables as the website */}
      <div
        className="p-4 flex flex-wrap items-center gap-3"
        style={{ borderRadius: 'var(--ds-r-lg)', border: '1px dashed var(--a-border)', background: 'var(--a-surface-2)' }}
        aria-label="Preview"
      >
        <span style={{ fontSize: 'var(--a-fs-sm)', color: 'var(--a-text-muted)', fontWeight: 600 }}>Preview:</span>
        <span
          className="inline-flex items-center gap-1.5 px-4 h-10 font-semibold bg-(--primary) hover:bg-(--primary-hover) text-(--primary-foreground) transition-colors"
          style={{ borderRadius: 'var(--ds-r-md)' }}
        >
          <ShoppingCart className="w-4 h-4" /> Add to Cart
        </span>
        <span
          className="inline-flex items-center px-4 h-10 font-semibold"
          style={{ borderRadius: 'var(--ds-r-md)', border: '1.5px solid var(--primary)', color: 'var(--primary-ink, var(--primary))', background: '#fff' }}
        >
          Buy Now
        </span>
        <span className="font-bold ds-num" style={{ color: 'var(--primary-ink, var(--primary))', fontSize: 'var(--a-fs-lg)' }}>
          ৳ 1,250
        </span>
        <span
          className="inline-flex items-center px-2.5 h-6 text-xs font-bold"
          style={{ borderRadius: 999, background: 'var(--primary-light)', color: 'var(--primary-ink, var(--primary))' }}
        >
          New Arrival
        </span>
        <span className="underline font-semibold" style={{ color: 'var(--primary-ink, var(--primary))' }}>
          View all
        </span>
      </div>
    </div>
  );
};
