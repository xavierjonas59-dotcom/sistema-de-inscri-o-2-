import { useState } from 'react';
import { useQuery, useSession, useUser } from '@/app/session';
import { alertLevel } from '@/domain/budget';
import { money, monthLabel, pct } from '@/domain/format';
import { api } from '@/services/api';
import { BarList } from '@/components/charts/BarList';
import { Icon } from '@/components/ui/icons';
import { AlertBadge, BudgetBar, Card, CardHeader, PageHeader, Select, StatCard, cx } from '@/components/ui/primitives';
import { useLookups } from '../shared/lookups';

export default function DiretoriaDashboard() {
  const user = useUser();
  const { month } = useSession();
  const lk = useLookups();
  const [rankSector, setRankSector] = useState('');

  const { data: budgets = [] } = useQuery(() => api.getAllBudgets(user, month), [month]);
  const { data: expenses = [] } = useQuery(() => api.listExpenses(user, { month }), [month]);
  const { data: pendingT = [] } = useQuery(() => api.listTransfers(user, { status: 'PENDENTE_DIRETORIA' }), []);

  const g = budgets.reduce(
    (s, b) => ({ ceiling: s.ceiling + b.ceiling, approved: s.approved + b.approved, pending: s.pending + b.pending, available: s.available + b.available }),
    { ceiling: 0, approved: 0, pending: 0, available: 0 },
  );
  const gUsage = g.ceiling ? (g.approved + g.pending) / g.ceiling : 0;
  const gAlert = alertLevel(gUsage);
  const pendingE = expenses.filter((e) => e.status === 'PENDENTE_DIRETORIA');
  const atRisk = budgets.filter((b) => b.alert !== 'ok').length;

  const byCat = new Map<string, number>();
  expenses
    .filter((e) => e.status === 'APROVADA' && (!rankSector || e.sectorId === rankSector))
    .forEach((e) => byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.amount));

  const sortedBudgets = [...budgets].sort((a, b) => b.usage - a.usage);

  return (
    <>
      <PageHeader title="Visão geral da empresa" description={`Consolidado de todos os setores · ${monthLabel(month)}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Teto global" icon="target" value={money(g.ceiling)} hint={`${budgets.length} setores ativos`} />
        <StatCard label="Gasto total (aprovado)" icon="receipt" value={money(g.approved)} hint={`${pct(g.ceiling ? g.approved / g.ceiling : 0)} do teto global`} />
        <StatCard label="Em análise" icon="clock" emphasis={g.pending ? 'warning' : undefined} value={money(g.pending)} hint={`${pendingE.length} despesa(s) pendente(s)`} />
        <StatCard label="Saldo global" icon="wallet" emphasis={atRisk ? 'warning' : 'good'} value={money(g.available)} hint={atRisk ? `${atRisk} setor(es) acima de 80%` : 'Todos os setores abaixo de 80%'} />
      </div>

      <Card className="mt-4 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">
            Gasto da empresa vs. teto global <span className="tabular text-muted-foreground">· {pct(gUsage)} comprometido</span>
          </div>
          <AlertBadge level={gAlert} />
        </div>
        <BudgetBar approved={g.approved} pending={g.pending} ceiling={g.ceiling} alert={gAlert} showLegend />
      </Card>

      {(pendingE.length > 0 || pendingT.length > 0) && (
        <a href="#/aprovacoes" className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <Icon name="inbox" />
          <span className="flex-1">
            Central de aprovações: <strong>{pendingE.length}</strong> despesa(s) e <strong>{pendingT.length}</strong> transferência(s) aguardando sua decisão.
          </span>
          <span className="font-medium underline">Abrir</span>
        </a>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Comparativo por setor" subtitle="Consumo do teto mensal, do maior para o menor" />
          <ul className="divide-y">
            {sortedBudgets.map((b) => (
              <li key={b.sectorId}>
                <button
                  onClick={() => setRankSector(rankSector === b.sectorId ? '' : b.sectorId)}
                  className={cx('w-full px-5 py-4 text-left transition-colors hover:bg-muted/40', rankSector === b.sectorId && 'bg-primary/5')}
                  title="Clique para filtrar o ranking de naturezas por este setor"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{lk.sector(b.sectorId)}</span>
                      <AlertBadge level={b.alert} />
                    </div>
                    <span className="tabular text-sm font-medium">{pct(b.usage)}</span>
                  </div>
                  <BudgetBar approved={b.approved} pending={b.pending} ceiling={b.ceiling} alert={b.alert} />
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular text-muted-foreground sm:grid-cols-4">
                    <span>Teto <strong className="text-foreground">{money(b.ceiling)}</strong></span>
                    <span>Gasto <strong className="text-foreground">{money(b.approved)}</strong></span>
                    <span>Em análise <strong className="text-foreground">{money(b.pending)}</strong></span>
                    <span>Disponível <strong className={b.available < 0 ? 'text-red-700' : 'text-foreground'}>{money(b.available)}</strong></span>
                  </div>
                  {(b.transfersIn > 0 || b.transfersOut > 0) && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Transferências: {b.transfersIn > 0 && `+${money(b.transfersIn)} recebido `}
                      {b.transfersOut > 0 && `−${money(b.transfersOut)} cedido`}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Ranking de naturezas de despesa"
            subtitle={rankSector ? `Setor ${lk.sector(rankSector)}` : 'Empresa toda · despesas aprovadas'}
            action={
              <Select className="h-8 w-auto text-xs" value={rankSector} onChange={(e) => setRankSector(e.target.value)} aria-label="Filtrar setor do ranking">
                <option value="">Todos</option>
                {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            }
          />
          <div className="p-5">
            <BarList items={[...byCat].map(([id, value]) => ({ key: id, label: lk.category(id), value }))} />
          </div>
        </Card>
      </div>
    </>
  );
}
