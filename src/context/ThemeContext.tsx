import React, { createContext, useContext, useEffect, useState } from 'react';
import { readableOnWhite, textOnColor, isHexColor, hoverShade, lightTint } from '../lib/contrast.ts';
import { readBoot } from '../lib/boot.ts';
import { cachedGet } from '../lib/dataCache.ts';

export interface ThemeColors {
  preset: string;
  primaryColor: string;
  primaryHover: string;
  primaryLight: string;
  secondaryColor: string;
  accentColor: string;
}

export const THEME_PRESETS: Record<string, ThemeColors> = {
  emerald: {
    preset: 'emerald',
    primaryColor: '#059669', // Emerald Green (Pharmacy reference)
    primaryHover: '#047857',
    primaryLight: '#ecfdf5',
    secondaryColor: '#0284c7',
    accentColor: '#f59e0b',
  },
  ocean: {
    preset: 'ocean',
    primaryColor: '#0284c7', // Sky Blue
    primaryHover: '#0369a1',
    primaryLight: '#f0f9ff',
    secondaryColor: '#059669',
    accentColor: '#f59e0b',
  },
  royal: {
    preset: 'royal',
    primaryColor: '#2563eb', // Royal Blue
    primaryHover: '#1d4ed8',
    primaryLight: '#eff6ff',
    secondaryColor: '#4f46e5',
    accentColor: '#f59e0b',
  },
  orange: {
    preset: 'orange',
    primaryColor: '#ea580c', // Bright Orange
    primaryHover: '#c2410c',
    primaryLight: '#fff7ed',
    secondaryColor: '#0284c7',
    accentColor: '#10b981',
  },
  rose: {
    preset: 'rose',
    primaryColor: '#e11d48', // Rose Pink
    primaryHover: '#be123c',
    primaryLight: '#fff1f2',
    secondaryColor: '#7c3aed',
    accentColor: '#f59e0b',
  },
  purple: {
    preset: 'purple',
    primaryColor: '#7c3aed', // Purple Violet
    primaryHover: '#6d28d9',
    primaryLight: '#f5f3ff',
    secondaryColor: '#059669',
    accentColor: '#ea580c',
  },
  slate: {
    preset: 'slate',
    primaryColor: '#334155', // Slate Modern
    primaryHover: '#1e293b',
    primaryLight: '#f8fafc',
    secondaryColor: '#059669',
    accentColor: '#f59e0b',
  },
};

interface ThemeContextType {
  colors: ThemeColors;
  setPreset: (presetName: string) => void;
  setCustomColors: (colors: Partial<ThemeColors>) => void;
  saveThemeToServer: () => Promise<void>;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: THEME_PRESETS.emerald,
  setPreset: () => {},
  setCustomColors: () => {},
  saveThemeToServer: async () => {},
  loading: false,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // The shop's colours come with the page, so nothing is ever painted in the
  // default green first (v3.8)
  const [colors, setColors] = useState<ThemeColors>(() => {
    const theme = readBoot()?.settings?.theme;
    return theme && typeof theme === 'object' ? { ...THEME_PRESETS.emerald, ...theme } : THEME_PRESETS.emerald;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Shares the storefront's cached settings request (answered from the page's data)
    cachedGet('/api/settings')
      .then((data: any) => {
        if (data?.theme) {
          setColors((prev) => ({ ...prev, ...data.theme }));
        }
      })
      .catch((err) => console.error('Error fetching theme settings:', err));
  }, []);

  useEffect(() => {
    // Apply CSS Variables to Document Root
    const root = document.documentElement;
    // A half-typed colour ("#ea") is never applied — the page keeps the last good one
    if (!isHexColor(colors.primaryColor)) return;
    // The chosen colour exactly as picked (buttons, backgrounds, icons) …
    root.style.setProperty('--primary', colors.primaryColor);
    root.style.setProperty('--primary-hover', isHexColor(colors.primaryHover) ? colors.primaryHover : hoverShade(colors.primaryColor));
    // … a readable shade of it for small text on white (src/lib/contrast.ts) …
    root.style.setProperty('--primary-ink', readableOnWhite(colors.primaryColor, 5.4));
    // … and button text that stays readable on light colours
    root.style.setProperty('--primary-foreground', textOnColor(colors.primaryColor));
    root.style.setProperty('--primary-light', isHexColor(colors.primaryLight) ? colors.primaryLight : lightTint(colors.primaryColor));
    if (isHexColor(colors.secondaryColor)) root.style.setProperty('--secondary', colors.secondaryColor);
    if (isHexColor(colors.accentColor)) root.style.setProperty('--accent', colors.accentColor);
  }, [colors]);

  const setPreset = (presetName: string) => {
    if (THEME_PRESETS[presetName]) {
      setColors(THEME_PRESETS[presetName]);
    }
  };

  const setCustomColors = (newColors: Partial<ThemeColors>) => {
    setColors((prev) => ({
      ...prev,
      ...newColors,
      preset: 'custom',
    }));
  };

  // v3.12.1 — a refused save is reported (it used to fail without a word)
  const saveThemeToServer = async () => {
    if (!isHexColor(colors.primaryColor)) throw new Error('Please pick a colour (a code like #ea580c) before saving.');
    setLoading(true);
    try {
      const res = await fetch('/api/settings/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(colors),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Could not save the theme.');
      }
      // Open storefront tabs re-read the settings and take the new colours
      window.dispatchEvent(new CustomEvent('pharma:settings-updated'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemeContext.Provider value={{ colors, setPreset, setCustomColors, saveThemeToServer, loading }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
