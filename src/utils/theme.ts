import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface Theme {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  textDim: string;
  surface: string;
  background: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
}

export const themes: Record<string, Theme> = {
  'one-dark': {
    name: 'One Dark',
    primary: '#61AFEF',
    secondary: '#C678DD',
    accent: '#56B6C2',
    text: '#ABB2BF',
    textDim: '#5C6370',
    surface: '#3E4452',
    background: '#282C34',
    success: '#98C379',
    danger: '#E06C75',
    warning: '#E5C07B',
    info: '#D19A66',
  },
  dracula: {
    name: 'Dracula',
    primary: '#BD93F9',
    secondary: '#FF79C6',
    accent: '#8BE9FD',
    text: '#F8F8F2',
    textDim: '#6272A4',
    surface: '#44475A',
    background: '#282A36',
    success: '#50FA7B',
    danger: '#FF5555',
    warning: '#F1FA8C',
    info: '#FFB86C',
  },
  tokyonight: {
    name: 'Tokyo Night',
    primary: '#82AAFF',
    secondary: '#C099FF',
    accent: '#FF966C',
    text: '#C8D3F5',
    textDim: '#828BB8',
    surface: '#2F334D',
    background: '#1A1B26',
    success: '#C3E88D',
    danger: '#FF757F',
    warning: '#FF966C',
    info: '#82AAFF',
  },
  catppuccin: {
    name: 'Catppuccin',
    primary: '#89B4FA',
    secondary: '#CBA6F7',
    accent: '#F5C2E7',
    text: '#CDD6F4',
    textDim: '#BAC2DE',
    surface: '#313244',
    background: '#1E1E2E',
    success: '#A6E3A1',
    danger: '#F38BA8',
    warning: '#F9E2AF',
    info: '#94E2D5',
  },
  nord: {
    name: 'Nord',
    primary: '#88C0D0',
    secondary: '#81A1C1',
    accent: '#8FBCBB',
    text: '#ECEFF4',
    textDim: '#8B95A7',
    surface: '#434C5E',
    background: '#2E3440',
    success: '#A3BE8C',
    danger: '#BF616A',
    warning: '#D08770',
    info: '#88C0D0',
  },
  gruvbox: {
    name: 'Gruvbox',
    primary: '#83A598',
    secondary: '#D3869B',
    accent: '#8EC07C',
    text: '#EBDBB2',
    textDim: '#928374',
    surface: '#3C3836',
    background: '#282828',
    success: '#B8BB26',
    danger: '#FB4934',
    warning: '#FE8019',
    info: '#FABD2F',
  },
  monokai: {
    name: 'Monokai',
    primary: '#66D9EF',
    secondary: '#AE81FF',
    accent: '#A6E22E',
    text: '#F8F8F2',
    textDim: '#75715E',
    surface: '#3E3D32',
    background: '#272822',
    success: '#A6E22E',
    danger: '#F92672',
    warning: '#E6DB74',
    info: '#FD971F',
  },
  solarized: {
    name: 'Solarized',
    primary: '#268BD2',
    secondary: '#6C71C4',
    accent: '#2AA198',
    text: '#839496',
    textDim: '#586E75',
    surface: '#073642',
    background: '#002B36',
    success: '#859900',
    danger: '#DC322F',
    warning: '#B58900',
    info: '#CB4B16',
  },
  ayu: {
    name: 'Ayu',
    primary: '#59C2FF',
    secondary: '#D2A6FF',
    accent: '#E6B450',
    text: '#BFBDB6',
    textDim: '#565B66',
    surface: '#1A1F29',
    background: '#0B0E14',
    success: '#7FD962',
    danger: '#D95757',
    warning: '#E6B673',
    info: '#39BAE6',
  },
  vesper: {
    name: 'Vesper',
    primary: '#FFC799',
    secondary: '#99FFE4',
    accent: '#FFC799',
    text: '#FFFFFF',
    textDim: '#A0A0A0',
    surface: '#282828',
    background: '#101010',
    success: '#99FFE4',
    danger: '#FF8080',
    warning: '#FFC799',
    info: '#FFC799',
  },
  aura: {
    name: 'Aura',
    primary: '#A277FF',
    secondary: '#F694FF',
    accent: '#A277FF',
    text: '#EDECEE',
    textDim: '#6D6D6D',
    surface: '#2D2D2D',
    background: '#0F0F0F',
    success: '#61FFCA',
    danger: '#FF6767',
    warning: '#FFCA85',
    info: '#A277FF',
  },
  nightowl: {
    name: 'Night Owl',
    primary: '#82AAFF',
    secondary: '#7FDBCA',
    accent: '#C792EA',
    text: '#D6DEEB',
    textDim: '#5F7E97',
    surface: '#1D3B53',
    background: '#011627',
    success: '#C5E478',
    danger: '#EF5350',
    warning: '#ECC48D',
    info: '#82AAFF',
  },
  synthwave: {
    name: 'Synthwave 84',
    primary: '#36F9F6',
    secondary: '#FF7EDB',
    accent: '#B084EB',
    text: '#FFFFFF',
    textDim: '#848BBD',
    surface: '#495495',
    background: '#262335',
    success: '#72F1B8',
    danger: '#FE4450',
    warning: '#FEDE5D',
    info: '#FF8B39',
  },
  rosepine: {
    name: 'Rose Pine',
    primary: '#9CCFD8',
    secondary: '#C4A7E7',
    accent: '#EBBCBA',
    text: '#E0DEF4',
    textDim: '#6E6A86',
    surface: '#403D52',
    background: '#191724',
    success: '#31748F',
    danger: '#EB6F92',
    warning: '#F6C177',
    info: '#9CCFD8',
  },
  github: {
    name: 'GitHub Dark',
    primary: '#58A6FF',
    secondary: '#BC8CFF',
    accent: '#39C5CF',
    text: '#C9D1D9',
    textDim: '#8B949E',
    surface: '#30363D',
    background: '#0D1117',
    success: '#3FB950',
    danger: '#F85149',
    warning: '#E3B341',
    info: '#D29922',
  },
  vercel: {
    name: 'Vercel',
    primary: '#0070F3',
    secondary: '#52A8FF',
    accent: '#8E4EC6',
    text: '#EDEDED',
    textDim: '#878787',
    surface: '#1F1F1F',
    background: '#000000',
    success: '#46A758',
    danger: '#E5484D',
    warning: '#FFB224',
    info: '#52A8FF',
  },
};

export const themeIds = Object.keys(themes);

// --- Active theme (mutable, swapped on theme change) ---

let activeTheme: Theme = themes['one-dark']!;

export const colors = {
  get primary() { return activeTheme.primary; },
  get secondary() { return activeTheme.secondary; },
  get accent() { return activeTheme.accent; },
  get surface() { return activeTheme.surface; },
  get background() { return activeTheme.background; },
  get text() { return activeTheme.text; },
  get textDim() { return activeTheme.textDim; },
  get success() { return activeTheme.success; },
  get danger() { return activeTheme.danger; },
  get warning() { return activeTheme.warning; },
  get info() { return activeTheme.info; },
  get statusNew() { return activeTheme.primary; },
  get statusSaved() { return activeTheme.warning; },
  get statusApplied() { return activeTheme.success; },
  get statusIgnored() { return activeTheme.textDim; },
  /** Opened rows: muted, but lifted to a readable contrast (plain textDim is too faint). */
  get textOpened() { return ensureContrast(activeTheme.textDim, activeTheme.background, 4.5); },
};

// Source colors derived from theme
export const sourceColors: Record<string, string> = {};
export const sourceLabels: Record<string, string> = {
  remoteok: 'RemoteOK',
  weworkremotely: 'WeWorkRemotely',
  remotive: 'Remotive',
  linkedin: 'LinkedIn',
  justjoinit: 'JustJoin.IT',
  workable: 'Workable',
  jobicy: 'Jobicy',
  himalayas: 'Himalayas',
};
/** Used wherever the full labels would push a one-row bar onto a second row. */
export const sourceShortLabels: Record<string, string> = {
  remoteok: 'RO',
  weworkremotely: 'WWR',
  remotive: 'REM',
  linkedin: 'LI',
  justjoinit: 'JJ',
  workable: 'WK',
  jobicy: 'JC',
  himalayas: 'HM',
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Brand colors (LinkedIn blue, JustJoin red, Workable green) keep each source
 * recognisable across themes, but several are too dark for the near-black
 * backgrounds: Workable's #1F7A5A was unreadable on Vercel. Mix toward white
 * (or black, on a light background) until the text is legible.
 */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  const target: [number, number, number] = luminance(bg) < 0.5 ? [255, 255, 255] : [0, 0, 0];
  const base = hexToRgb(fg);
  for (let t = 0; t <= 1; t += 0.05) {
    const mixed = rgbToHex(base.map((c, i) => c + (target[i]! - c) * t) as [number, number, number]);
    if (contrastRatio(mixed, bg) >= min) return mixed;
  }
  return rgbToHex(target);
}

function updateSourceColors() {
  const raw: Record<string, string> = {
    remoteok: activeTheme.info,
    weworkremotely: activeTheme.primary,
    remotive: activeTheme.danger,
    linkedin: '#0A66C2',
    justjoinit: '#FF4D4D',
    workable: '#1F7A5A',
    jobicy: activeTheme.secondary,
    himalayas: activeTheme.warning,
  };
  for (const [source, color] of Object.entries(raw)) {
    sourceColors[source] = ensureContrast(color, activeTheme.background);
  }
}

// --- Persistence ---

const CONFIG_DIR = join(homedir(), '.flex-me-in');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function loadConfig(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(config: Record<string, string>) {
  // A read-only or missing HOME must not take the app down: the theme simply
  // isn't remembered.
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch {
    // Best effort.
  }
}

export function getActiveThemeId(): string {
  const config = loadConfig();
  return config.theme && themes[config.theme] ? config.theme : 'one-dark';
}

/** Switches the in-memory theme only. */
export function applyTheme(id: string): void {
  const theme = themes[id];
  if (!theme) return;
  activeTheme = theme;
  updateSourceColors();
}

/** Switches the theme and remembers it in config.json. */
export function setTheme(id: string): void {
  if (!themes[id]) return;
  applyTheme(id);
  const config = loadConfig();
  config.theme = id;
  saveConfig(config);
}

// Initialize on import. Read-only: importing a module must not write files.
applyTheme(getActiveThemeId());
