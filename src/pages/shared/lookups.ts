import { useMemo } from 'react';
import { useQuery, useUser } from '@/app/session';
import { api } from '@/services/api';

/** Mapas id → nome de setores e naturezas, para exibição. */
export function useLookups() {
  const user = useUser();
  const { data: sectors = [] } = useQuery(() => api.sectorDirectory(user), [user.id]);
  const { data: categories = [] } = useQuery(() => api.listCategories(user, true), [user.id]);
  return useMemo(() => {
    const sectorName = new Map(sectors.map((s) => [s.id, s.name]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    return {
      sectors,
      categories,
      sector: (id: string) => sectorName.get(id) ?? '—',
      category: (id: string) => categoryName.get(id) ?? '—',
    };
  }, [sectors, categories]);
}

/** Lê erros de regra de negócio de forma uniforme. */
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado.');
