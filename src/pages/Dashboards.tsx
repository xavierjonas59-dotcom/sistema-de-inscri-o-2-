import { navigate, useQuery, useSession, useUser } from '@/app/session';
import { alertLevel } from '@/domain/budget';
import { money, monthLabel, pct } from '@/domain/format';
import { scSummary, scTotal } from '@/domain/sc';
import type { BudgetSummary } from '@/domain/types';
import { api } from '@/services/api';
import { AlertBadge, BudgetBar, Button, Card, CardHeader, PageHeader, Ledger, Table, Td, Th } from '@/components/ui/primitives';
import { useLookups } from './shared/lookups';
import { ScTable } from './sc/ScTable';

function LimitNumbers({ b }: { b: BudgetSummary }) {
  const note = b.transfersIn || b.transfersOut
    ? `base ${money(b.baseLimit)}${b.transfersIn ? `, +${money(b.transfersIn)} recebido` : ''}${b.transfersOut ? `, −${money(b.transfersOut)} cedido` : ''}`
    : undefined;
  return (
    <Ledger limit={b.limit} reserved={b.reserved} consumed={b.consumed} available={b.available} limitNote={note}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular">{pct(Math.min(b.usage, 9.99))} do limite em uso</span>
        {b.alert !== 'ok' && <AlertBadge level={b.alert} />}
      </div>
      <BudgetBar consumed={b.consumed} reserved={b.reserved} limit={b.limit} alert={b.alert} showLegend />
    </Ledger>
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
      <PageHeader title={`Setor ${lk.sector(user.sectorId!)}`} description={`Limite de ${monthLabel(month).toLowerCase()}`} actions={<Button icon="plus" onClick={() => navigate('/sc/nova')}>Nova SC</Button>} />
      {b && <LimitNumbers b={b} />}
      <div className="mt-5 space-y-4">
        {isManager && (
          <Card>
            <CardHeader title="Aguardando a sua aprovação" subtitle={scSummary(waiting)} />
            <ScTable items={waiting} empty="Nenhuma SC aguardando você." />
          </Card>
        )}
        {needsNf.length > 0 && (
          <Card>
            <CardHeader title="Aprovadas: anexar NF e enviar para pagamento" />
            <ScTable items={needsNf} />
          </Card>
        )}
        {(!isManager || mine.length > 0) && (
          <Card>
            <CardHeader title="Minhas solicitações em andamento" action={<a className="text-sm text-primary hover:underline" href="#/sc">Ver todas</a>} />
            <ScTable items={mine} empty="Você não tem solicitações em andamento. Use “Nova SC” para começar." />
          </Card>
        )}
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
      <PageHeader title="Visão geral" description={`Todos os setores em ${monthLabel(month).toLowerCase()}`} />
      <Ledger limit={g.limit} reserved={g.reserved} consumed={g.consumed} available={g.available} limitNote={`soma de ${budgets.length} setores`}>
        <BudgetBar consumed={g.consumed} reserved={g.reserved} limit={g.limit} alert={gAlert} showLegend />
      </Ledger>

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
                  <Td right className={b.available < 0 ? 'text-danger' : ''}>{money(b.available)}</Td>
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
