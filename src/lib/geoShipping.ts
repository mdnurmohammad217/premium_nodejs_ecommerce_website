/**
 * v3.9 — District (zila) / thana selection at checkout, and the delivery
 * area it implies.
 *
 * Dashboard → System Configuration → Shipping → District & Thana:
 *   • enabled       — checkout asks for District and Thana (two dropdowns)
 *   • autoShipping  — the delivery area (and so its charge) follows the
 *                     district / thana automatically; the customer no longer
 *                     picks "Inside / Outside Dhaka" by hand
 *
 * The same resolver runs in the browser (to show the charge) and on the
 * server (to bill it), so the two can never disagree.
 */

export interface CheckoutGeoConfig {
  enabled: boolean;
  /** The thana must be chosen too (else only the district is required) */
  requireThana: boolean;
  /** Pick the delivery area from the district / thana */
  autoShipping: boolean;
  /** Zone id for every district without its own rule (normally "Outside Dhaka") */
  defaultZone: string;
  /** District → zone id, e.g. { "Dhaka": "inside-dhaka", "Gazipur": "dhaka-sub-area" } */
  districtZones: Record<string, string>;
  /** "District|Thana" → zone id, e.g. { "Dhaka|Savar": "dhaka-sub-area" } */
  thanaZones: Record<string, string>;
  /** Labels: 'en' English, 'bn' Bengali, 'both' "Dhaka (ঢাকা)" */
  language: 'en' | 'bn' | 'both';
}

export const DEFAULT_CHECKOUT_GEO: CheckoutGeoConfig = {
  enabled: false,
  requireThana: true,
  autoShipping: false,
  defaultZone: '',
  districtZones: {},
  thanaZones: {},
  language: 'both',
};

export function cleanGeoConfig(raw: any): CheckoutGeoConfig {
  const map = (value: any): Record<string, string> => {
    const out: Record<string, string> = {};
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, zone] of Object.entries(value)) {
        const k = String(key).trim().slice(0, 140);
        const z = String(zone || '').trim().slice(0, 100);
        if (k && z) out[k] = z;
      }
    }
    return out;
  };
  return {
    enabled: Boolean(raw?.enabled),
    requireThana: raw?.requireThana !== false,
    autoShipping: Boolean(raw?.autoShipping),
    defaultZone: String(raw?.defaultZone || '').slice(0, 100),
    districtZones: map(raw?.districtZones),
    thanaZones: map(raw?.thanaZones),
    language: raw?.language === 'en' || raw?.language === 'bn' ? raw.language : 'both',
  };
}

interface ZoneLike {
  id: string;
  name: string;
  enabled?: boolean;
}

/** A sensible starting zone for a district when the owner set no rule */
function guessZone(zones: ZoneLike[], district: string): string {
  const find = (re: RegExp) => zones.find((zone) => re.test(`${zone.id} ${zone.name}`))?.id || '';
  if (district.toLowerCase() === 'dhaka') return find(/inside|ঢাকার ভিতর|ভিতরে/i);
  return find(/outside|বাইরে/i);
}

/**
 * The delivery zone id for a district / thana, or '' when no rule matches
 * and no default is set (the customer then picks the area as before).
 */
export function zoneForPlace(cfg: CheckoutGeoConfig, zones: ZoneLike[], district?: string | null, thana?: string | null): string {
  const live = zones.filter((zone) => zone.enabled !== false);
  const valid = (id?: string) => (id && live.some((zone) => zone.id === id) ? id : '');
  const d = String(district || '').trim();
  if (!d) return '';
  const t = String(thana || '').trim();
  const fromThana = t ? valid(cfg.thanaZones[`${d}|${t}`]) : '';
  if (fromThana) return fromThana;
  const fromDistrict = valid(cfg.districtZones[d]);
  if (fromDistrict) return fromDistrict;
  return valid(cfg.defaultZone) || valid(guessZone(live, d));
}

/** "Dhaka (ঢাকা)", "ঢাকা" or "Dhaka" */
export function placeLabel(en: string, bn: string, language: CheckoutGeoConfig['language']): string {
  if (language === 'en' || !bn) return en;
  if (language === 'bn') return bn;
  return `${en} (${bn})`;
}
