/**
 * Loads .env, then makes sure the BUILT server always runs in production mode.
 *
 * v3.10 — a server .env that still says NODE_ENV=development (copied from a
 * developer's computer) used to switch the live site into development mode:
 * every page was compiled on the fly, React ran its slow debugging build, and
 * the page arrived without its ready-made data, custom code or security
 * headers. `npm start` runs dist/server.cjs, which is only ever a production
 * server, so that file now ignores the setting. `npm run dev` is unchanged.
 * (ALLOW_DEV_SERVER=1 keeps the old behaviour, for debugging a build.)
 *
 * v3.11 — .env is found even when the hosting panel starts the app from a
 * different working directory (Hostinger / cPanel "Setup Node.js App" often
 * do). Previously only <working directory>/.env was read, so the database
 * details and ADMIN_EMAIL / ADMIN_PASSWORD were silently missing and every
 * sign-in failed with "Could not sign in right now". Values already set by
 * the hosting panel always win over the file.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

declare const __filename: string | undefined;

const builtFile = typeof __filename === 'string' ? __filename : '';
const runningBuiltServer = /[\\/]dist[\\/]server\.cjs$/.test(builtFile);

function envCandidates(): string[] {
  // An explicit DOTENV_PATH is the only file read
  if (process.env.DOTENV_PATH) return [path.resolve(process.env.DOTENV_PATH)];
  const list: string[] = [];
  const add = (dir?: string) => {
    if (!dir) return;
    const file = path.resolve(dir, '.env');
    if (!list.includes(file)) list.push(file);
  };
  // The app's own folder first (dist/server.cjs → its parent), so a panel that
  // starts the app from another directory still reads the right file
  if (builtFile) {
    add(path.join(path.dirname(builtFile), '..'));
    add(path.dirname(builtFile));
  }
  add(process.cwd());
  const entry = process.argv[1];
  if (entry) {
    add(path.dirname(entry));
    add(path.join(path.dirname(entry), '..'));
  }
  return list;
}

/**
 * v3.11 — `ADMIN_PASSWORD=abc#123` or `DB_PASSWORD=Xy#9…` without quotes: dotenv
 * treats everything from the `#` on as a comment, so the password silently
 * became "abc" and the sign-in / database login failed. Generated hosting
 * passwords often contain a `#`. A comment needs a space (or nothing) before
 * the `#`, so a `#` inside the value is kept. Quoted values are untouched.
 */
function keepHashInValues(text: string, fromPanel: Set<string>) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rest] = match;
    if (fromPanel.has(key)) continue;
    const value = rest.trim();
    if (!value || value.startsWith('#') || /^['"`]/.test(value)) continue;
    const kept = value.replace(/\s+#.*$/, '').trim();
    if (kept.includes('#') && process.env[key] !== kept) process.env[key] = kept;
  }
}

/** The .env file that was read (shown on /api/health as loaded / not found) */
export const LOADED_ENV_FILES: string[] = [];

// Only the first .env found is read — two files are never mixed together
for (const file of envCandidates()) {
  try {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const fromPanel = new Set(Object.keys(process.env));
    // override:false — the hosting panel's own variables are never replaced
    dotenv.config({ path: file, override: false, quiet: true } as any);
    keepHashInValues(fs.readFileSync(file, 'utf8'), fromPanel);
    LOADED_ENV_FILES.push(file);
    break;
  } catch {
    /* unreadable file: try the next place */
  }
}

if (runningBuiltServer && process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_SERVER !== '1') {
  if (process.env.NODE_ENV) {
    console.warn(`[env] NODE_ENV=${process.env.NODE_ENV} in .env is ignored: the built server always runs in production mode. Set NODE_ENV=production in .env to remove this note.`);
  }
  process.env.NODE_ENV = 'production';
}

if (LOADED_ENV_FILES.length === 0) {
  console.warn(`[env] No .env file found (looked in: ${envCandidates().join(', ')}). Using the hosting panel's environment variables only.`);
}

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * v3.11 — the app's own folder (the one holding package.json and dist/).
 * The built server finds its files next to itself, so the site also works
 * when the hosting panel starts it from another working directory.
 */
export const APP_DIR = runningBuiltServer ? path.resolve(path.dirname(builtFile), '..') : process.cwd();
