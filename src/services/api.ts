import { useSyncExternalStore } from 'react';
import type { DataService } from './DataService';
import { LocalDataService, type KeyValueStore } from './LocalDataService';

/** IndexedDB: comporta anexos maiores que o localStorage. Cai para memória se indisponível. */
function idbStore(): KeyValueStore {
  const memory = new Map<string, string>();
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('amc-demo', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const r = fn(db.transaction('kv', mode).objectStore('kv'));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  };
  return {
    async get(key) {
      try {
        return ((await tx('readonly', (s) => s.get(key))) as string | undefined) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    async set(key, value) {
      memory.set(key, value);
      try {
        await tx('readwrite', (s) => s.put(value, key));
      } catch {
        /* sem IndexedDB (janela privada): mantém em memória */
      }
    },
  };
}

/**
 * Ponto único de acesso à camada de dados. Em produção, troque por uma implementação
 * que chame o servidor (mesma interface) — a UI não muda.
 */
export const localService = new LocalDataService(idbStore());
export const api: DataService = localService;

let version = 0;
api.subscribe(() => version++);

export function useDataVersion() {
  return useSyncExternalStore(api.subscribe.bind(api), () => version);
}

/** IP do cliente: só o servidor conhece de verdade; no modo demonstração fica indicado. */
export const requestContext = () => ({ ip: 'não registrado (modo demonstração)' });
