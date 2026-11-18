import { useSyncExternalStore } from 'react';
import type { DataService } from './DataService';
import { LocalDataService } from './LocalDataService';

/**
 * Ponto único de acesso à camada de dados.
 * Para usar o backend Supabase, implemente `SupabaseDataService` (mesma interface)
 * e troque a instância abaixo — a UI não muda.
 */
export const localService = new LocalDataService(window.localStorage);
export const api: DataService = localService;

let version = 0;
api.subscribe(() => version++);

/** Retorna um contador que muda a cada alteração de dados (para recarregar consultas). */
export function useDataVersion() {
  return useSyncExternalStore(api.subscribe.bind(api), () => version);
}
