import { navigate, useQuery, useUser } from '@/app/session';
import { money, monthLabel } from '@/domain/format';
import { SC_STATUS } from '@/domain/sc';
import type { Month } from '@/domain/types';
import { api } from '@/services/api';
import type { SpendingDetail } from '@/services/DataService';
import { Modal } from '@/components/ui/overlay';
import { Badge, Button, EmptyState } from '@/components/ui/primitives';
import { useLookups } from '@/pages/shared/lookups';

/** Recorte do detalhe: o mês todo, uma natureza ou um dia. `natureId: null` = sem natureza. */
export type DetailFilter = { natureId?: string | null; day?: string };

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Detalhe do que foi gasto no mês: cada SC aprovada pela diretoria, agrupada por natureza,
 * com os itens, o valor e o link para abrir a solicitação (quando a pessoa pode vê-la).
 */
export function SpendingDetailModal({
  month,
  sectorId,
  filter,
  onFilter,
  onClose,
}: {
  month: Month;
  sectorId: string | null;
  filter: DetailFilter | null;
  onFilter: (f: DetailFilter) => void;
  onClose: () => void;
}) {
  const user = useUser();
  const lk = useLookups();
  const open = !!filter;
  const { data } = useQuery(() => (open ? api.spendingDetails(user, sectorId, month) : Promise.resolve(undefined)), [open, sectorId, month]);
  const rows = data ?? [];
  const loading = data === undefined;
  const f = filter ?? {};
  const shown = rows.filter((r) => (f.natureId === undefined || r.natureId === f.natureId) && (!f.day || r.date === f.day));
  const total = shown.reduce((s, r) => s + r.total, 0);
  const groups = new Map<string | null, SpendingDetail[]>();
  for (const r of shown) groups.set(r.natureId, [...(groups.get(r.natureId) ?? []), r]);
  const ordered = [...groups].sort((a, b) => sum(b[1]) - sum(a[1]));
  const showSector = !sectorId;
  const narrowed = f.natureId !== undefined || !!f.day;
  const label = f.day ? `Dia ${br(f.day)}` : f.natureId !== undefined ? lk.nature(f.natureId) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Gastos de ${monthLabel(month).toLowerCase()}`}
      description={`${showSector ? 'Empresa toda' : `Setor ${lk.sector(sectorId!)}`} · aprovado pela diretoria`}
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[13px] text-muted-foreground">{label ?? 'Total do mês'}</div>
          <div className="tabular text-[28px] font-semibold leading-tight tracking-[-0.02em]">{money(total)}</div>
          <div className="text-[13px] text-muted-foreground">{shown.length} {shown.length === 1 ? 'solicitação' : 'solicitações'}</div>
        </div>
        {narrowed && <Button size="sm" variant="secondary" onClick={() => onFilter({})}>Ver o mês todo</Button>}
      </div>
      {loading && !rows.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : !shown.length ? (
        <EmptyState title="Nenhum gasto aprovado aqui." />
      ) : (
        <div className="space-y-6">
          {ordered.map(([nat, list]) => (
            <section key={nat ?? 'sem'}>
              <div className="mb-2 flex items-baseline justify-between gap-3 border-b pb-2">
                <h3 className="min-w-0 truncate text-sm font-semibold">{lk.nature(nat)}</h3>
                <span className="tabular shrink-0 text-sm font-semibold">{money(sum(list))}</span>
              </div>
              <ul className="divide-y">
                {list.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="tabular text-[13px] text-muted-foreground">{br(r.date)}</span>
                      {r.canOpen ? (
                        <button
                          type="button"
                          className="tabular text-sm font-semibold text-primary hover:underline"
                          onClick={() => {
                            onClose();
                            navigate(`/sc/ver?id=${r.id}`);
                          }}
                        >
                          {r.number}
                        </button>
                      ) : (
                        <span className="tabular text-sm font-semibold">{r.number}</span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">{r.supplierName}</span>
                      <span className="tabular text-sm font-semibold">{money(r.total)}</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-[13px]">
                      {r.items.map((it, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">
                            <span className="tabular text-muted-foreground">{it.quantity} ×</span> {it.description}
                          </span>
                          {r.items.length > 1 && <span className="tabular shrink-0 text-muted-foreground">{money(it.total)}</span>}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                      <span>Pedido por {r.requesterName}</span>
                      {showSector && <span>{lk.sector(r.sectorId)}</span>}
                      <Badge tone={SC_STATUS[r.status].tone}>{SC_STATUS[r.status].label}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

const sum = (l: SpendingDetail[]) => l.reduce((s, r) => s + r.total, 0);
