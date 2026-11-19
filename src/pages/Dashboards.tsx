import { navigate, useQuery, useSession, useUser } from '@/app/session';
import { alertLevel } from '@/domain/budget';
import { money, monthLabel, pct } from '@/domain/format';
import { scTotal } from '@/domain/sc';
import type { BudgetSummary } from '@/domain/types';
import { api } from '@/services/api';
import { AlertBadge, BudgetBar, Button, Card, CardHeader, PageHeader, StatCard, Table, Td, Th } from '@/components/ui/primitives';
import { useLookups } from './shared/lookups';
import { ScTable } from './sc/ScTable';

function LimitNumbers({ b }: { b: BudgetSummary }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Limite total"
          value={money(b.limit)}
          hint={b.transfersIn || b.transfersOut ? `Base ${money(b.baseLimit)}${b.transfersIn ? ` +${money(b.transfersIn)}` : ''}${b.transfersOut ? ` −${money(b.transfersOut)}` : ''}` : 'Limite mensal do setor'}
        />
        <StatCard label="Reservado" value={money(b.reserved)} hint="Aprovado pelo gestor, aguardando diretoria" />
        <StatCard label="Consumido" value={money(b.consumed)} hint="Aprovado pela diretoria" />
        <StatCard label="Disponível" value={money(b.available)} emphasis={b.available < 0 ? 'critical' : b.alert !== 'ok' ? 'warning' : undefined} hint={`${pct(Math.min(b.usage, 9.99))} do limite em uso`} />
      </div>
      <div className="mt-3 rounded border bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">Uso do limite</span>
          <AlertBadge level={b.alert} />
        </div>
        <BudgetBar consumed={b.consumed} reserved={b.reserved} limit={b.limit} alert={b.alert} showLegend />
      </div>
    </>
  );
}

/** Painel do setor: todos os usuários do setor veem os mesmos números. */
export function SectorDashboard() {
  const user = useUser();
  const { month } = useSession();
  const lk = useLookups();
  const { data: b } = useQuery(() => api.getBudget(user, user.sectorId!, month), [month]);
  const { data: requests = [] } = useQuery(() => api.listRequests(user), [user.id]);
  const isManager = user.role === 'GESTOR';
  const waiting = requests.filter((r) => r.status === 'AGUARDANDO_GESTOR');
  const mine = requests.filter((r) => r.requesterId === user.id && !['PAGA', 'REPROVADA', 'CANCELADA'].includes(r.status));
  const needsNf = requests.filter((r) => r.status === 'AGUARDANDO_NF' && (isManager || r.requesterId === user.id));

  return (
    <>
      <PageHeader title={`Setor ${lk.sector(user.sectorId!)}`} description={`Limite de ${monthLabel(month)}`} actions={<Button icon="plus" onClick={() => navigate('/sc/nova')}>Nova SC</Button>} />
      {b && <LimitNumbers b={b} />}
      <div className="mt-5 space-y-4">
        {isManager && (
          <Card>
            <CardHeader title="Aguardando a sua aprovação" subtitle={`${waiting.length} SC · ${money(waiting.reduce((s, r) => s + scTotal(r), 0))}`} />
            <ScTable items={waiting} empty="Nenhuma SC aguardando você." />
          </Card>
        )}
        {needsNf.length > 0 && (
          <Card>
            <CardHeader title="Aprovadas: anexar NF e enviar para pagamento" />
            <ScTable items={needsNf} />
          </Card>
        )}
        <Card>
          <CardHeader title="Minhas solicitações em andamento" action={<a className="text-sm text-primary hover:underline" href="#/sc">Ver todas</a>} />
          <ScTable items={mine} empty="Nenhuma solicitação em andamento." />
        </Card>
      </div>
    </>
  );
}

/** Visão consolidada da Diretoria. */
export function DirectorDashboard() {
  const user = useUser();
  const { month } = useSession();
  const lk = useLookups();
  const { data: budgets = [] } = useQuery(() => api.getAllBudgets(user, month), [month]);
  const { data: waiting = [] } = useQuery(() => api.listRequests(user, { status: 'AGUARDANDO_DIRETORIA' }), []);
  const { data: sectorWaiting = [] } = useQuery(
    async () => (user.sectorId ? (await api.listRequests(user, { status: 'AGUARDANDO_GESTOR' })).filter((r) => r.sectorId === user.sectorId) : []),
    [],
  );
  const mine = waiting.filter((r) => r.assignedDirectorId === user.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const { data: monthReqs = [] } = useQuery(() => api.listRequests(user, { month }), [month]);
  const g = budgets.reduce((s, b) => ({ limit: s.limit + b.limit, reserved: s.reserved + b.reserved, consumed: s.consumed + b.consumed, available: s.available + b.available }), { limit: 0, reserved: 0, consumed: 0, available: 0 });
  const gAlert = alertLevel(g.limit ? (g.reserved + g.consumed) / g.limit : 0);

  const byNature = new Map<string, number>();
  monthReqs.filter((r) => ['AGUARDANDO_NF', 'ENVIADA_FINANCEIRO', 'PAGA'].includes(r.status)).forEach((r) => byNature.set(r.natureId ?? '', (byNature.get(r.natureId ?? '') ?? 0) + scTotal(r)));
  const natureRows = [...byNature].sort((a, b) => b[1] - a[1]);
  const natureTotal = natureRows.reduce((s, [, v]) => s + v, 0);

  return (
    <>
      <PageHeader title="Visão geral" description={`Todos os setores · ${monthLabel(month)}`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Limite total" value={money(g.limit)} hint={`${budgets.length} setores`} />
        <StatCard label="Reservado" value={money(g.reserved)} hint={`${waiting.length} SC na diretoria`} />
        <StatCard label="Consumido" value={money(g.consumed)} />
        <StatCard label="Disponível" value={money(g.available)} emphasis={gAlert !== 'ok' ? 'warning' : undefined} />
      </div>
      <div className="mt-3 rounded border bg-white p-4">
        <BudgetBar consumed={g.consumed} reserved={g.reserved} limit={g.limit} alert={gAlert} showLegend />
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Aguardando a minha liberação de pagamento"
          subtitle={user.paymentLimit === null ? 'Você libera qualquer valor' : `Você libera até ${money(user.paymentLimit)}; acima disso, encaminhe`}
          action={<a className="text-sm text-primary hover:underline" href="#/aprovacoes">Abrir aprovações</a>}
        />
        <ScTable items={mine} showSector empty="Nenhuma SC aguardando você." />
      </Card>
      {user.sectorId && (
        <Card className="mt-4">
          <CardHeader title={`Aprovação do setor ${lk.sector(user.sectorId)}`} subtitle="Como diretor do setor, você também pode aprovar (Autorização de Compra)" />
          <ScTable items={sectorWaiting} empty="Nenhuma SC do setor aguardando aprovação." />
        </Card>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Limite por setor" />
          <Table min={620}>
            <thead><tr><Th>Setor</Th><Th right>Limite</Th><Th right>Reservado</Th><Th right>Consumido</Th><Th right>Disponível</Th><Th>Uso</Th></tr></thead>
            <tbody>
              {[...budgets].sort((a, b) => b.usage - a.usage).map((b) => (
                <tr key={b.sectorId}>
                  <Td className="font-medium">{lk.sector(b.sectorId)}</Td>
                  <Td right>{money(b.limit)}</Td>
                  <Td right>{money(b.reserved)}</Td>
                  <Td right>{money(b.consumed)}</Td>
                  <Td right className={b.available < 0 ? 'text-[#a12626]' : ''}>{money(b.available)}</Td>
                  <Td className="w-40">
                    <div className="mb-1 flex justify-between text-xs"><span className="tabular">{pct(b.usage)}</span>{b.alert !== 'ok' && <AlertBadge level={b.alert} />}</div>
                    <BudgetBar consumed={b.consumed} reserved={b.reserved} limit={b.limit} alert={b.alert} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Consumido por natureza" subtitle="Aprovadas pela diretoria no mês" />
          <Table min={300}>
            <thead><tr><Th>Natureza</Th><Th right>Valor</Th><Th right>%</Th></tr></thead>
            <tbody>
              {natureRows.map(([id, v]) => (
                <tr key={id}><Td>{lk.nature(id || null)}</Td><Td right>{money(v)}</Td><Td right>{pct(v / natureTotal)}</Td></tr>
              ))}
              {!natureRows.length && <tr><Td className="text-muted-foreground">Sem consumo no mês.</Td><Td /><Td /></tr>}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
