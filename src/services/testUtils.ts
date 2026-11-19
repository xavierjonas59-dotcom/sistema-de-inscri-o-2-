import type { KeyValueStore } from './LocalDataService';

/** Armazenamento em memória para testes. */
export const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) };
};
