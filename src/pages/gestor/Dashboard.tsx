import { useState } from 'react';
import { useQuery, useSession, useUser } from '@/app/session';
import { money, monthLabel, pct } from '@/domain/format';
import type { Expense, Transfer } from '@/domain/types';
import { api } from '@/services/api';
import { BarList } from '@/components/charts/BarList';
import { AlertBadge, BudgetBar, Button, Card, CardHeader, PageHeader, StatCard } from '@/components/ui/primitives';
import { ExpenseDetailModal, ExpenseTable, NewExpenseModal } from '../shared/expenses';
import { useLookups } from '../shared/lookups';
import { TransferDetailModal, TransferTable } from '../shared/transfers';

export default function GestorDashboard() {
  const user = useUser();
  const { month } = useSession();
  const lk = useLookups();
  const [creating, setCreating] = useState(false);
  const [openExp, setOpenExp] = useState<Expense | null>(null);
  const [openTrf, setOpenTrf] = useState<Transfer | null>(null);

  const { data: b } = useQuery(() => api.getBudget(user, user.sectorId!, month), [month]);
  const { data: expenses = [] } = useQuery(() => api.listExpenses(user, { month }), [month]);
  const { data: transfers = [] } = useQuery(() => api.listTransfers(user), []);

  const byCategory = new Map<string, number>();
  expenses.filter((e) => e.status === 'APROVADA').forEach((e) => byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + e.amount));
  const toDecide = transfers.filter((t) => t.status === 'PENDENTE_CEDENTE' && t.grantingSectorId === user.sectorId);

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(' ')[0]}`}
        description={`Orçamento de ${lk.sector(user.sectorId!)} em ${monthLabel(month)}`}
        actions={<Button icon="plus" onClick={() => setCreating(true)}>Nova solicitação</Button>}
      />

      {toDecide.length > 0 && (
        <a href="#/transferencias" className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <span><strong>{toDecide.length}</strong> pedido(s) de transferência aguardam a sua decisão como setor cedente.</span>
          <span className="font-medium underline">Analisar</span>
        </a>
      )}

      {b && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Teto do mês"
              icon="target"
              value={money(b.ceiling)}
              hint={
                b.transfersIn || b.transfersOut
                  ? `Base ${money(b.baseCeiling)}${b.transfersIn ? ` · +${money(b.transfersIn)} recebido` : ''}${b.transfersOut ? ` · −${money(b.transfersOut)} cedido` : ''}`
                  : 'Teto padrão do setor'
              }
            />
            <StatCard label="Total gasto (aprovado)" icon="receipt" value={money(b.approved)} hint={`${pct(b.ceiling ? b.approved / b.ceiling : 0)} do teto`} />
            <StatCard label="Pendente de aprovação" icon="clock" emphasis={b.pending ? 'warning' : undefined} value={money(b.pending)} hint="Reservado do saldo até a decisão" />
            <StatCard
              label="Saldo disponível"
              icon="wallet"
              emphasis={b.alert === 'ok' ? 'good' : b.alert === 'attention' ? 'warning' : b.alert === 'critical' ? 'serious' : 'critical'}
              value={money(b.available)}
              hint="Teto − gasto − pendente"
            />
          </div>

          <Card className="mt-4 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">
                Consumo do orçamento <span className="tabular text-muted-foreground">· {pct(Math.min(b.usage, 9.99))}</span>
              </div>
              <AlertBadge level={b.alert} />
            </div>
            <BudgetBar approved={b.approved} pending={b.pending} ceiling={b.ceiling} alert={b.alert} showLegend />
          </Card>
        </>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Gastos por natureza" subtitle="Despesas aprovadas no mês" />
          <div className="p-5">
            <BarList items={[...byCategory].map(([id, value]) => ({ key: id, label: lk.category(id), value }))} />
          </div>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Solicitações recentes" subtitle={monthLabel(month)} action={<a href="#/despesas" className="text-sm font-medium text-primary hover:underline">Ver todas</a>} />
          <ExpenseTable items={expenses.slice(0, 6)} onOpen={setOpenExp} empty="Nenhuma solicitação neste mês." />
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Histórico de transferências de limite" subtitle="Pedidos feitos e recebidos pelo seu setor" action={<a href="#/transferencias" className="text-sm font-medium text-primary hover:underline">Gerenciar</a>} />
        <TransferTable items={transfers.slice(0, 5)} onOpen={setOpenTrf} />
      </Card>

      <NewExpenseModal open={creating} onClose={() => setCreating(false)} month={month} />
      <ExpenseDetailModal expense={openExp} onClose={() => setOpenExp(null)} />
      <TransferDetailModal transfer={openTrf} onClose={() => setOpenTrf(null)} />
    </>
  );
}
