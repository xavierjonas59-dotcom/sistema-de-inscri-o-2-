import { useState } from 'react';
import { useQuery, useSession, useUser } from '@/app/session';
import { csvMoney, downloadCsv } from '@/domain/csv';
import { date, money, monthLabel } from '@/domain/format';
import { EXPENSE_STATUS } from '@/domain/labels';
import type { Expense, ExpenseStatus } from '@/domain/types';
import { api } from '@/services/api';
import { Button, Card, PageHeader, Select } from '@/components/ui/primitives';
import { ExpenseDetailModal, ExpenseTable, NewExpenseModal } from './expenses';
import { useLookups } from './lookups';

export default function ExpensesPage() {
  const user = useUser();
  const { month } = useSession();
  const lk = useLookups();
  const isDir = user.role === 'DIRETORIA';
  const [status, setStatus] = useState<ExpenseStatus | ''>('');
  const [sectorId, setSectorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Expense | null>(null);

  const { data: items = [] } = useQuery(
    () => api.listExpenses(user, { month, status: status || undefined, sectorId: sectorId || undefined, categoryId: categoryId || undefined }),
    [month, status, sectorId, categoryId],
  );
  const total = items.reduce((s, e) => s + e.amount, 0);

  const exportCsv = () =>
    downloadCsv(
      `despesas-${month}.csv`,
      ['Data', 'Competência', 'Setor', 'Solicitante', 'Descrição', 'Natureza', 'Valor (R$)', 'Status', 'Justificativa', 'Motivo decisão'],
      items.map((e) => [
        date(e.createdAt), e.month, lk.sector(e.sectorId), e.requesterName, e.description, lk.category(e.categoryId),
        csvMoney(e.amount), EXPENSE_STATUS[e.status].label, e.justification, e.decisionReason ?? '',
      ]),
    );

  return (
    <>
      <PageHeader
        title={isDir ? 'Despesas' : 'Minhas solicitações'}
        description={`${monthLabel(month)} · ${items.length} registro(s) · ${money(total)}`}
        actions={
          <>
            <Button variant="secondary" icon="download" onClick={exportCsv} disabled={!items.length}>Exportar Excel (CSV)</Button>
            {!isDir && <Button icon="plus" onClick={() => setCreating(true)}>Nova solicitação</Button>}
          </>
        }
      />
      <div className="no-print mb-4 grid gap-3 sm:grid-cols-3 lg:max-w-3xl">
        {isDir && (
          <Select value={sectorId} onChange={(e) => setSectorId(e.target.value)} aria-label="Filtrar setor">
            <option value="">Todos os setores</option>
            {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
        <Select value={status} onChange={(e) => setStatus(e.target.value as ExpenseStatus | '')} aria-label="Filtrar status">
          <option value="">Todos os status</option>
          {Object.entries(EXPENSE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filtrar natureza">
          <option value="">Todas as naturezas</option>
          {lk.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <Card>
        <ExpenseTable items={items} showSector={isDir} onOpen={setOpen} />
      </Card>
      {!isDir && <NewExpenseModal open={creating} onClose={() => setCreating(false)} month={month} />}
      <ExpenseDetailModal expense={open} onClose={() => setOpen(null)} />
    </>
  );
}
