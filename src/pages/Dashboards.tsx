import { useState } from 'react';
import { navigate, useQuery, useSession, useUser } from '@/app/session';
import { alertLevel } from '@/domain/budget';
import { money, monthLabel, pct } from '@/domain/format';
import { scSummary } from '@/domain/sc';
import { api } from '@/services/api';
import { BalanceCard, MonthlyChart } from '@/components/charts/SpendingCharts';
import { FlowChart } from '@/components/charts/FlowChart';
import { MonthCalendar } from '@/components/charts/MonthCalendar';
import { SpendingDetailModal, type DetailFilter } from '@/components/charts/SpendingDetailModal';
import { Modal } from '@/components/ui/overlay';
import { AccountsTable } from './Contabil';
import { AlertBadge, BudgetBar, Button, Card, CardHeader, PageHeader, Select, Table, Td, Th } from '@/components/ui/primitives';
import { useLookups } from './shared/lookups';
import { ScTable } from './sc/ScTable';

/**
 * Início, igual para todos: saldo do mês em destaque, gastos por mês e por natureza, e as listas de ação.
 * Funcionário e gestor veem o próprio setor (o serviço garante); diretoria e admin veem a empresa com filtro de setor.
 */
export default function Home() {
  const user = useUser();
  const { month, setMonth } = useSession();
  const lk = useLookups();
  const wide = user.role === 'DIRETORIA' || user.role === 'ADMIN';
  const [filter, setFilter] = useState<string>(''); // '' = empresa toda
  const sectorId = wide ? filter || null : user.sectorId;

  const { data: budgets = [] } = useQuery(async () => (wide ? api.getAllBudgets(user, month) : [await api.getBudget(user, user.sectorId!, month)]), [month]);
  const { data: monthly = [] } = useQuery(() => api.spendingByMonth(user, sectorId, 12), [sectorId]);
  const { data: details = [] } = useQuery(() => api.spendingDetails(user, sectorId, month), [sectorId, month]);
  const [detail, setDetail] = useState<DetailFilter | null>(null);
  // Orçamento por conta contábil: gestor (o próprio setor), diretoria e admin. Funcionário não vê.
  const seesAccounts = user.role !== 'FUNCIONARIO';
  const [accountsOpen, setAccountsOpen] = useState(false);
  const spentByDay = new Map<string, number>();
  for (const r of details) spentByDay.set(r.date, (spentByDay.get(r.date) ?? 0) + r.total);
  const scoped = sectorId ? budgets.filter((b) => b.sectorId === sectorId) : budgets;
  const g = scoped.reduce(
    (s, b) => ({ limit: s.limit + b.limit, reserved: s.reserved + b.reserved, consumed: s.consumed + b.consumed, available: s.available + b.available }),
    { limit: 0, reserved: 0, consumed: 0, available: 0 },
  );
  const scopeName = sectorId ? `Setor ${lk.sector(sectorId)}` : 'Empresa toda';

  return (
    <>
      <PageHeader
        title="Início"
        description={wide ? scopeName : `Setor ${lk.sector(user.sectorId!)}`}
        actions={
          <>
            {wide && (
              <Select className="h-10 w-52" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por setor">
                <option value="">Empresa toda</option>
                {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
            {user.role !== 'ADMIN' && (user.role !== 'DIRETORIA' || user.sectorId) && <Button icon="plus" onClick={() => navigate('/sc/nova')}>Nova SC</Button>}
          </>
        }
      />
      {scoped.length > 0 && (
        <BalanceCard month={month} {...g} alert={alertLevel(g.limit ? (g.consumed + g.reserved) / g.limit : 0)} onOpen={seesAccounts ? () => setAccountsOpen(true) : undefined} />
      )}
      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Gastos por mês" subtitle="Aprovado pela diretoria nos últimos 12 meses. Clique num mês para ver o que foi gasto." />
          <div className="px-5 py-5">
            <MonthlyChart
              data={monthly}
              selected={month}
              onSelect={(m) => {
                setMonth(m);
                setDetail({});
              }}
            />
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Calendário" subtitle="Feriados nacionais e dias com gastos" />
          <div className="px-5 py-5">
            <MonthCalendar month={month} onMonth={setMonth} spent={spentByDay} onDay={(day) => setDetail({ day })} />
          </div>
        </Card>
        <div className="xl:col-span-5">
          <FlowChart
            sectorId={sectorId}
            onDay={(day) => {
              setMonth(day.slice(0, 7));
              setDetail({ day });
            }}
          />
        </div>
      </div>
      {seesAccounts && <AccountsModal open={accountsOpen} onClose={() => setAccountsOpen(false)} sectorId={sectorId} title={scopeName} />}
      <SpendingDetailModal month={month} sectorId={sectorId} filter={detail} onFilter={setDetail} onClose={() => setDetail(null)} />
      <div className="mt-5 space-y-5">
        <ActionLists />
        {wide && !filter && budgets.length > 0 && <SectorTable budgets={budgets} onPick={setFilter} />}
      </div>
    </>
  );
}

/** Listas do que espera a pessoa (variam por perfil). */
function ActionLists() {
  const user = useUser();
  const lk = useLookups();
  const { data: requests = [] } = useQuery(() => (user.role === 'ADMIN' ? Promise.resolve([]) : api.listRequests(user)), [user.id]);
  if (user.role === 'ADMIN') return null;
  const isManager = user.role === 'GESTOR';
  if (user.role === 'DIRETORIA') {
    const mine = requests.filter((r) => r.status === 'AGUARDANDO_DIRETORIA' && r.assignedDirectorId === user.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const sector = user.sectorId ? requests.filter((r) => r.status === 'AGUARDANDO_GESTOR' && r.sectorId === user.sectorId) : [];
    return (
      <>
        <Card>
          <CardHeader title="Aguardando a sua liberação de pagamento" subtitle={scSummary(mine)} action={<a className="text-sm text-primary hover:underline" href="#/aprovacoes">Abrir aprovações</a>} />
          <ScTable items={mine} showSector empty="Nenhuma SC aguardando você." />
        </Card>
        {user.sectorId && (
          <Card>
            <CardHeader title={`Aprovação do setor ${lk.sector(user.sectorId)}`} subtitle="Como diretor do setor, você também pode aprovar (Autorização de Compra)" />
            <ScTable items={sector} empty="Nenhuma SC do setor aguardando aprovação." />
          </Card>
        )}
      </>
    );
  }
  const waiting = requests.filter((r) => r.status === 'AGUARDANDO_GESTOR');
  const mine = requests.filter((r) => r.requesterId === user.id && !['PAGA', 'REPROVADA', 'CANCELADA'].includes(r.status));
  const needsNf = requests.filter((r) => r.status === 'AGUARDANDO_NF' && (isManager || r.requesterId === user.id));
  return (
    <>
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
    </>
  );
}

function SectorTable({ budgets, onPick }: { budgets: { sectorId: string; limit: number; reserved: number; consumed: number; available: number; usage: number; alert: ReturnType<typeof alertLevel> }[]; onPick: (id: string) => void }) {
  const lk = useLookups();
  return (
    <Card>
      <CardHeader title="Limite por setor" subtitle="Clique num setor para filtrar o Início por ele." />
      <Table min={620}>
        <thead><tr><Th>Setor</Th><Th right>Limite</Th><Th right>Reservado</Th><Th right>Consumido</Th><Th right>Disponível</Th><Th>Uso</Th></tr></thead>
        <tbody>
          {[...budgets].sort((a, b) => b.usage - a.usage).map((b) => (
            <tr key={b.sectorId} className="cursor-pointer hover:bg-foreground/[0.03]" onClick={() => onPick(b.sectorId)}>
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
  );
}

/** Ao clicar no saldo: quanto cada conta contábil ainda pode gastar no mês. */
function AccountsModal({ open, onClose, sectorId, title }: { open: boolean; onClose: () => void; sectorId: string | null; title: string }) {
  const user = useUser();
  const { month } = useSession();
  const { data: v } = useQuery(() => (open ? api.getAccountBudget(user, sectorId, month) : Promise.resolve(undefined)), [open, sectorId, month]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Orçamento por conta contábil · ${monthLabel(month).toLowerCase()}`}
      description={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          <Button
            onClick={() => {
              onClose();
              navigate(sectorId && user.role !== 'GESTOR' ? `/contabil?setor=${sectorId}` : '/contabil');
            }}
          >
            Abrir no Contábil
          </Button>
        </>
      }
    >
      {!v ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
            <div><div className="text-[13px] text-muted-foreground">Orçado em contas</div><div className="tabular text-lg font-semibold">{money(v.distributed)}</div></div>
            <div><div className="text-[13px] text-muted-foreground">Gasto</div><div className="tabular text-lg font-semibold">{money(v.consumed + v.reserved)}</div></div>
            <div><div className="text-[13px] text-muted-foreground">Não distribuído</div><div className="tabular text-lg font-semibold">{money(v.undistributed)}</div></div>
          </div>
          <div className="-mx-6 border-t"><AccountsTable v={v} compact /></div>
        </>
      )}
    </Modal>
  );
}
