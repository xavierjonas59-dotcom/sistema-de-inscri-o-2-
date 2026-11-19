import { useMemo } from 'react';
import { useQuery, useUser } from '@/app/session';
import type { PdfNames } from '@/pdf/scPdf';
import type { PurchaseRequest } from '@/domain/types';
import { api } from '@/services/api';

/** Cadastros de apoio e funções id → nome para exibição. */
export function useLookups() {
  const user = useUser();
  const { data: sectors = [] } = useQuery(() => api.sectorDirectory(user), [user.id]);
  const { data: costCenters = [] } = useQuery(() => api.listCostCenters(user, true), [user.id]);
  const { data: natures = [] } = useQuery(() => api.listNatures(user, true), [user.id]);
  const { data: suppliers = [] } = useQuery(() => api.listSuppliers(user), [user.id]);
  return useMemo(() => {
    const s = new Map(sectors.map((x) => [x.id, x.name]));
    const c = new Map(costCenters.map((x) => [x.id, `${x.code} - ${x.name}`]));
    const n = new Map(natures.map((x) => [x.id, `${x.code} - ${x.name}`]));
    const sector = (id: string) => s.get(id) ?? '—';
    const costCenter = (id: string) => c.get(id) ?? '—';
    const nature = (id: string | null) => (id && n.get(id)) || '—';
    const pdfNames = (sc: PurchaseRequest): PdfNames => ({ sector: sector(sc.sectorId), nature: nature(sc.natureId), costCenter });
    return { sectors, costCenters, natures, suppliers, sector, costCenter, nature, pdfNames };
  }, [sectors, costCenters, natures, suppliers]);
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado.');
