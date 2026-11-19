import { useState } from 'react';
import { useQuery, useUser } from '@/app/session';
import { money } from '@/domain/format';
import { scTotal } from '@/domain/sc';
import { api } from '@/services/api';
import { Card, Input, PageHeader, Select, Tabs, Field } from '@/components/ui/primitives';
import { useLookups } from './shared/lookups';
import { ScTable, dueDate } from './sc/ScTable';

type Tab = 'pagar' | 'pagas';

/** Contas a Pagar: fila do financeiro com filtro por vencimento e setor. */
export default function Payables() {
  const user = useUser();
  const lk = useLookups();
  const [tab, setTab] = useState<Tab>('pagar');
  const [sectorId, setSectorId] = useState('');
  const [until, setUntil] = useState('');
  const { data: all = [] } = useQuery(() => api.listRequests(user), [user.id]);
  const toPay = all.filter((r) => r.status === 'ENVIADA_FINANCEIRO');
  const paid = all.filter((r) => r.status === 'PAGA');
  const items = (tab === 'pagar' ? toPay : paid)
    .filter((r) => (!sectorId || r.sectorId === sectorId) && (!until || dueDate(r) <= until))
    .sort((a, b) => (tab === 'pagar' ? dueDate(a).localeCompare(dueDate(b)) : (b.paidAt ?? '').localeCompare(a.paidAt ?? '')));

  return (
    <>
      <PageHeader title="Contas a Pagar" description={`${items.length} SC · ${money(items.reduce((s, r) => s + scTotal(r), 0))}`} />
      <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
        <Tabs<Tab> value={tab} onChange={setTab} items={[{ value: 'pagar', label: 'A pagar', count: toPay.length }, { value: 'pagas', label: 'Pagas', count: paid.length }]} />
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Vencimento até">
            <Input id="due-until" type="date" className="h-8 w-40 text-xs" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
          <Field label="Setor">
            <Select className="h-8 w-44 text-xs" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
              <option value="">Todos</option>
              {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
      </div>
      <Card>
        <ScTable items={items} showSector showDue empty={tab === 'pagar' ? 'Nenhuma SC aguardando pagamento.' : 'Nenhuma SC paga.'} />
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">Abra uma SC para imprimir o pacote (Solicitação assinada + NF + boletos + comprovantes) e marcar como paga.</p>
    </>
  );
}
