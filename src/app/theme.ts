import { useSyncExternalStore } from 'react';

/** Preferência de tema por navegador: claro, automático (segue o sistema) ou escuro. */
export type ThemePref = 'light' | 'system' | 'dark';
const KEY = 'amc:theme';
const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}
let pref: ThemePref = read();

const media = () => (typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null);

/** Aplica a classe `dark` no <html> conforme a preferência e o sistema. */
export function applyTheme() {
  const dark = pref === 'dark' || (pref === 'system' && !!media()?.matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function setTheme(p: ThemePref) {
  pref = p;
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  applyTheme();
  listeners.forEach((l) => l());
}

media()?.addEventListener?.('change', () => pref === 'system' && applyTheme());

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const value = useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => pref,
  );
  return [value, setTheme];
}

/** O tema escuro está ativo agora (considerando o automático). */
export const isDark = () => document.documentElement.classList.contains('dark');
