import { useState } from 'react';
import { useQuery, useUser } from '@/app/session';
import { money } from '@/domain/format';
import type { Expense, Transfer } from '@/domain/types';
import { api } from '@/services/api';
import { Card, PageHeader, Select, Tabs } from '@/components/ui/primitives';
import { ExpenseDetailModal, ExpenseTable } from '../shared/expenses';
import { useLookups } from '../shared/lookups';
import { TransferDetailModal, TransferTable } from '../shared/transfers';

type Tab = 'despesas' | 'transferencias';

/** Central unificada: despesas pendentes + transferências já aceitas pelo cedente. Todas as competências. */
export default function Approvals() {
  const user = useUser();
  const lk = useLookups();
  const [tab, setTab] = useState<Tab>('despesas');
  const [sectorId, setSectorId] = useState('');
  const [requester, setRequester] = useState('');
  const [openE, setOpenE] = useState<Expense | null>(null);
  const [openT, setOpenT] = useState<Transfer | null>(null);

  const { data: expenses = [] } = useQuery(() => api.listExpenses(user, { status: 'PENDENTE_DIRETORIA' }), []);
  const { data: transfers = [] } = useQuery(() => api.listTransfers(user, { status: 'PENDENTE_DIRETORIA' }), []);

  const requesters = [...new Map(expenses.map((e) => [e.requesterId, e.requesterName])).entries()];
  const fe = expenses
    .filter((e) => (!sectorId || e.sectorId === sectorId) && (!requester || e.requesterId === requester))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ft = transfers.filter((t) => !sectorId || t.requestingSectorId === sectorId || t.grantingSectorId === sectorId);

  return (
    <>
      <PageHeader
        title="Central de aprovações"
        description="Fila única de decisões da Diretoria, da mais antiga para a mais recente"
      />
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'despesas', label: 'Despesas', count: expenses.length },
            { value: 'transferencias', label: 'Transferências de limite', count: transfers.length },
          ]}
        />
        <Select className="w-auto" value={sectorId} onChange={(e) => setSectorId(e.target.value)} aria-label="Filtrar setor">
          <option value="">Todos os setores</option>
          {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {tab === 'despesas' && (
          <Select className="w-auto" value={requester} onChange={(e) => setRequester(e.target.value)} aria-label="Filtrar gestor">
            <option value="">Todos os gestores</option>
            {requesters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        )}
        <span className="text-sm text-muted-foreground tabular">
          {tab === 'despesas' ? `${fe.length} item(ns) · ${money(fe.reduce((s, e) => s + e.amount, 0))}` : `${ft.length} item(ns)`}
        </span>
      </div>
      <Card>
        {tab === 'despesas' ? (
          <ExpenseTable items={fe} showSector onOpen={setOpenE} empty="Nenhuma despesa aguardando aprovação. 🎉" />
        ) : (
          <TransferTable items={ft} onOpen={setOpenT} empty="Nenhuma transferência aguardando a Diretoria." />
        )}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Transferências só aparecem aqui depois do aceite do gestor do setor cedente.
      </p>
      <ExpenseDetailModal expense={openE} onClose={() => setOpenE(null)} />
      <TransferDetailModal transfer={openT} onClose={() => setOpenT(null)} />
    </>
  );
}
