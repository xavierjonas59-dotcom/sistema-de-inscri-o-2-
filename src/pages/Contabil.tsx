import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useSession, useUser } from '@/app/session';
import { alertLevel } from '@/domain/budget';
import { centsToInput, money, monthLabel, parseMoney, pct } from '@/domain/format';
import type { LedgerAccount, User } from '@/domain/types';
import { api } from '@/services/api';
import type { AccountBudgetView } from '@/services/DataService';
import { Icon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/overlay';
import { Badge, BudgetBar, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select, Table, Tabs, Td, Th, cx } from '@/components/ui/primitives';
import { errMsg, useLookups } from './shared/lookups';

type Tab = 'orcamento' | 'naturezas';

/** Quem altera limites e orçamentos: o Admin e a diretoria marcada (Antônio, Manoel e Ana). O serviço confere de novo. */
export const canEditBudget = (u: User) => u.role === 'ADMIN' || (u.role === 'DIRETORIA' && !!u.budgetEditor);

/**
 * Contábil: o limite de cada setor dividido em contas contábeis.
 * Gestor vê só o próprio setor (sem alterar); diretoria e Admin veem todos; só quem tem permissão altera.
 */
export default function Contabil({ query }: { query: URLSearchParams }) {
  const user = useUser();
  const lk = useLookups();
  const wide = user.role !== 'GESTOR';
  const [tab, setTab] = useState<Tab>(query.get('aba') === 'naturezas' ? 'naturezas' : 'orcamento');
  const [sectorId, setSectorId] = useState<string>(wide ? (query.get('setor') ?? '') : user.sectorId!);
  const editor = canEditBudget(user);

  return (
    <>
      <PageHeader
        title="Contábil"
        description={
          wide
            ? editor
              ? 'Defina o limite de cada setor e quanto dele vai para cada conta contábil.'
              : 'Limite de cada setor e orçamento por conta contábil. Só a diretoria responsável altera.'
            : `Orçamento do setor ${lk.sector(user.sectorId!)} por conta contábil. Só a diretoria altera.`
        }
        actions={
          wide &&
          tab === 'orcamento' && (
            <Select className="h-10 w-56" value={sectorId} onChange={(e) => setSectorId(e.target.value)} aria-label="Setor">
              <option value="">Todos os setores</option>
              {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )
        }
      />
      <div className="mb-5">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'orcamento', label: 'Orçamento por conta' },
            { value: 'naturezas', label: 'Naturezas e contas' },
          ]}
        />
      </div>
      {tab === 'naturezas' ? <NaturesTab editor={editor} /> : sectorId ? <SectorBudget sectorId={sectorId} onBack={wide ? () => setSectorId('') : undefined} /> : <Overview onPick={setSectorId} />}
    </>
  );
}

// ------------------------------------------------------------------ visão geral (todos os setores)
function Overview({ onPick }: { onPick: (id: string) => void }) {
  const user = useUser();
  const { month } = useSession();
  const lk = useLookups();
  const ids = lk.sectors.map((s) => s.id).join(',');
  const { data: views = [] } = useQuery(() => Promise.all(lk.sectors.map((s) => api.getAccountBudget(user, s.id, month))), [month, ids]);
  const { data: company } = useQuery(() => api.getAccountBudget(user, null, month), [month]);
  return (
    <div className="space-y-5">
      {company && <Summary v={company} />}
      <Card>
        <CardHeader title="Setores" subtitle={`${monthLabel(month)}. Clique num setor para ver e ajustar as contas dele.`} />
        <Table min={760}>
          <thead>
            <tr><Th>Setor</Th><Th right>Limite</Th><Th>Distribuído em contas</Th><Th right>Não distribuído</Th><Th right>Gasto</Th><Th right>Disponível</Th><Th /></tr>
          </thead>
          <tbody>
            {views.map((v) => {
              const share = v.baseLimit ? v.distributed / v.baseLimit : 0;
              const spent = v.consumed + v.reserved;
              return (
                <tr key={v.sectorId} className="cursor-pointer hover:bg-foreground/[0.03]" onClick={() => onPick(v.sectorId!)}>
                  <Td className="font-medium">{lk.sector(v.sectorId!)}</Td>
                  <Td right>{money(v.baseLimit)}</Td>
                  <Td className="w-56">
                    <div className="mb-1 flex justify-between text-[13px]"><span className="tabular">{money(v.distributed)}</span><span className="tabular text-muted-foreground">{pct(share)}</span></div>
                    <div className="h-1.5 rounded-full bg-track"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.min(100, share * 100)}%` }} /></div>
                  </Td>
                  <Td right className={cx('font-normal', v.undistributed < 0 ? 'text-danger' : 'text-muted-foreground')}>{money(v.undistributed)}</Td>
                  <Td right>{money(spent)}</Td>
                  <Td right className={v.limit - spent < 0 ? 'text-danger' : ''}>{money(v.limit - spent)}</Td>
                  <Td right><Icon name="chevronRight" size={16} className="inline text-muted-foreground" /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      {company && (
        <Card>
          <CardHeader title="Contas da empresa" subtitle="Soma de todos os setores." />
          <AccountsTable v={company} />
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ resumo em números
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: 'brand' | 'danger' }) {
  return (
    <div className="min-w-0 px-5 py-4 sm:px-6">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className={cx('tabular mt-1 truncate text-[22px] font-semibold tracking-[-0.02em]', tone === 'brand' && 'text-brand', tone === 'danger' && 'text-danger')}>{value}</div>
      {sub && <div className="tabular mt-0.5 text-[13px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Summary({ v, limitSlot }: { v: AccountBudgetView; limitSlot?: ReactNode }) {
  const spent = v.consumed + v.reserved;
  const share = v.baseLimit ? v.distributed / v.baseLimit : 0;
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4 [&>*]:bg-card">
        {limitSlot ?? <Stat label="Limite do mês" value={money(v.baseLimit)} sub={v.limit !== v.baseLimit ? `${money(v.limit)} com transferências` : undefined} />}
        <Stat label="Distribuído em contas" value={money(v.distributed)} sub={`${pct(share)} do limite`} />
        <Stat label="Não distribuído" value={money(v.undistributed)} tone={v.undistributed < 0 ? 'danger' : undefined} sub={v.undistributed >= 0 ? 'Sem conta definida' : 'Passou do limite'} />
        <Stat label="Disponível para gastar" value={money(v.limit - spent)} tone={v.limit - spent < 0 ? 'danger' : 'brand'} sub={`Gasto ${money(spent)}`} />
      </div>
      <div className="border-t px-5 py-4 sm:px-6">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-track" role="img" aria-label={`${pct(share)} do limite distribuído em contas`}>
          <div className="h-full bg-brand" style={{ width: `${Math.min(100, share * 100)}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand" />Distribuído em contas</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-track ring-1 ring-inset ring-border" />Não distribuído</span>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ tabela de contas (leitura)
const groupOf = (rows: AccountBudgetView['rows']) => {
  const out = new Map<string, AccountBudgetView['rows']>();
  for (const r of rows) out.set(r.group, [...(out.get(r.group) ?? []), r]);
  return [...out];
};

export function AccountsTable({ v, compact }: { v: AccountBudgetView; compact?: boolean }) {
  if (!v.rows.length) return <EmptyState title="Nenhuma conta contábil com orçamento neste mês." />;
  return (
    <Table min={compact ? 560 : 760}>
      <thead>
        <tr>
          <Th>Conta contábil</Th>
          <Th right>Orçamento</Th>
          {!compact && <Th right>% do limite</Th>}
          <Th right>Gasto</Th>
          <Th right>Disponível</Th>
          {!compact && <Th className="w-40">Uso</Th>}
        </tr>
      </thead>
      <tbody>
        {groupOf(v.rows).map(([group, rows]) => (
          <Fragment key={group}>
            <tr>
              <td colSpan={compact ? 4 : 6} className="border-b bg-muted/40 px-5 py-2 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                {group}
              </td>
            </tr>
            {rows.map((r) => {
              const spent = r.consumed + r.reserved;
              const use = r.budget ? spent / r.budget : spent ? Infinity : 0;
              return (
                <tr key={r.accountId ?? 'sem'}>
                  <Td>
                    <div className="font-medium">{r.name}</div>
                    {r.code && <div className="tabular text-[12px] text-muted-foreground">{r.code}</div>}
                  </Td>
                  <Td right>{r.budget ? money(r.budget) : <Badge tone="warning">Sem orçamento</Badge>}</Td>
                  {!compact && <Td right className="font-normal text-muted-foreground">{r.budget ? pct(r.share) : '—'}</Td>}
                  <Td right className="font-normal">
                    {money(spent)}
                    {r.reserved > 0 && <div className="text-[12px] text-muted-foreground">{money(r.reserved)} reservado</div>}
                  </Td>
                  <Td right className={r.available < 0 ? 'text-danger' : 'text-brand'}>{money(r.available)}</Td>
                  {!compact && (
                    <Td className="w-40">
                      <div className="mb-1 text-right text-[12px] tabular text-muted-foreground">{r.budget ? pct(Math.min(use, 9.99)) : '—'}</div>
                      <BudgetBar consumed={r.consumed} reserved={r.reserved} limit={r.budget} alert={alertLevel(use)} />
                    </Td>
                  )}
                </tr>
              );
            })}
          </Fragment>
        ))}
      </tbody>
    </Table>
  );
}

// ------------------------------------------------------------------ um setor (ver e editar)
function SectorBudget({ sectorId, onBack }: { sectorId: string; onBack?: () => void }) {
  const user = useUser();
  const { month } = useSession();
  const lk = useLookups();
  const toast = useToast();
  const { data: v } = useQuery(() => api.getAccountBudget(user, sectorId, month), [sectorId, month]);
  const { data: accounts = [] } = useQuery(() => api.listAccounts(user), [user.id]);
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [sectorId, month]);
  if (!v) return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  return (
    <div className="space-y-5">
      {onBack && (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="chevronLeft" size={16} /> Todos os setores
        </button>
      )}
      {editing ? (
        <BudgetEditor v={v} accounts={accounts} sectorName={lk.sector(sectorId)} onDone={() => setEditing(false)} onSaved={() => (setEditing(false), toast('success', 'Orçamento salvo.'))} />
      ) : (
        <>
          <Summary v={v} />
          <Card>
            <CardHeader
              title={`Contas contábeis · ${lk.sector(sectorId)}`}
              subtitle={`${monthLabel(month)}. Os gastos entram pela natureza de cada solicitação aprovada.`}
              action={v.canEdit && <Button icon="pencil" onClick={() => setEditing(true)}>Editar limite e contas</Button>}
            />
            <AccountsTable v={v} />
          </Card>
        </>
      )}
    </div>
  );
}

function BudgetEditor({ v, accounts, sectorName, onDone, onSaved }: { v: AccountBudgetView; accounts: LedgerAccount[]; sectorName: string; onDone: () => void; onSaved: () => void }) {
  const user = useUser();
  const { month } = useSession();
  const [limitText, setLimitText] = useState(centsToInput(v.baseLimit));
  const [rows, setRows] = useState(() => v.rows.filter((r) => r.accountId && r.budget > 0).map((r) => ({ accountId: r.accountId!, text: centsToInput(r.budget) })));
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const limit = parseMoney(limitText);
  const amounts = rows.map((r) => (r.text.trim() ? parseMoney(r.text) : 0));
  const total = amounts.reduce((s, a) => s + (Number.isNaN(a) ? 0 : a), 0);
  const over = !Number.isNaN(limit) && total > limit;
  const invalid = Number.isNaN(limit) || amounts.some(Number.isNaN);
  const free = accounts.filter((a) => a.active && !rows.some((r) => r.accountId === a.id));
  const groups = [...new Set(free.map((a) => a.group))];

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      await api.saveAccountBudget(user, v.sectorId!, month, { limit, entries: rows.map((r, i) => ({ accountId: r.accountId, amount: amounts[i] })) }, repeat);
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={`Editar ${sectorName} · ${monthLabel(month)}`} subtitle="A porcentagem de cada conta é calculada sobre o limite do setor." />
      <div className="grid gap-5 border-b px-5 py-5 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-foreground/80">Limite do setor no mês (R$)</span>
          <Input id="ctb-limit" inputMode="decimal" className="tabular text-right text-base font-semibold" value={limitText} onChange={(e) => setLimitText(e.target.value)} />
        </label>
        <div>
          <div className="text-[13px] text-muted-foreground">Distribuído em contas</div>
          <div className={cx('tabular mt-1.5 text-[22px] font-semibold', over && 'text-danger')}>{money(total)}</div>
          <div className="tabular text-[13px] text-muted-foreground">{!Number.isNaN(limit) && limit > 0 ? `${pct(total / limit)} do limite` : '—'}</div>
        </div>
        <div>
          <div className="text-[13px] text-muted-foreground">Não distribuído</div>
          <div className={cx('tabular mt-1.5 text-[22px] font-semibold', over ? 'text-danger' : 'text-brand')}>{Number.isNaN(limit) ? '—' : money(limit - total)}</div>
          <div className="text-[13px] text-muted-foreground">{over ? 'A soma passou do limite' : 'Ainda pode ir para contas'}</div>
        </div>
      </div>
      <Table min={620}>
        <thead>
          <tr><Th>Conta contábil</Th><Th right className="w-48">Orçamento (R$)</Th><Th right className="w-32">% do limite</Th><Th className="w-12" /></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const a = byId.get(r.accountId);
            const amt = amounts[i];
            return (
              <tr key={r.accountId}>
                <Td>
                  <div className="font-medium">{a?.name}</div>
                  <div className="tabular text-[12px] text-muted-foreground">{a?.code} · {a?.group}</div>
                </Td>
                <Td right>
                  <Input
                    aria-label={`Orçamento de ${a?.name}`}
                    inputMode="decimal"
                    className={cx('tabular h-9 text-right', Number.isNaN(amt) && 'border-danger')}
                    value={r.text}
                    placeholder="0,00"
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  />
                </Td>
                <Td right className="font-normal text-muted-foreground">{!Number.isNaN(limit) && limit > 0 && !Number.isNaN(amt) ? pct(amt / limit) : '—'}</Td>
                <Td right>
                  <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger" aria-label={`Tirar ${a?.name}`}>
                    <Icon name="trash" size={16} />
                  </button>
                </Td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr><Td className="text-center text-muted-foreground"><span className="text-sm">Nenhuma conta ainda. Adicione abaixo.</span></Td><Td /><Td /><Td /></tr>
          )}
        </tbody>
      </Table>
      <div className="border-t px-5 py-4">
        <Select
          aria-label="Adicionar conta contábil"
          className="sm:w-[460px]"
          value=""
          onChange={(e) => e.target.value && setRows([...rows, { accountId: e.target.value, text: '' }])}
        >
          <option value="">+ Adicionar conta contábil…</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {free.filter((a) => a.group === g).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </optgroup>
          ))}
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-5 py-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          Repetir para os meses seguintes até dezembro
        </label>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>Cancelar</Button>
          <Button onClick={save} disabled={busy || invalid || over}>{busy ? 'Salvando…' : 'Salvar'}</Button>
        </div>
        {(error || over) && (
          <p className="w-full rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {error || `A soma das contas passa do limite em ${money(total - limit)}. Diminua alguma conta ou aumente o limite.`}
          </p>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ naturezas × contas
function NaturesTab({ editor }: { editor: boolean }) {
  const user = useUser();
  const toast = useToast();
  const { data: natures = [] } = useQuery(() => api.listNatures(user, true), [user.id]);
  const { data: accounts = [] } = useQuery(() => api.listAccounts(user), [user.id]);
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const groups = [...new Set(accounts.map((a) => a.group))];
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = natures.filter((n) => (!onlyMissing || !n.accountId) && (!q.trim() || norm(`${n.code} ${n.name}`).includes(norm(q.trim()))));
  const linked = natures.filter((n) => n.accountId).length;

  const change = async (natureId: string, accountId: string) => {
    try {
      await api.setNatureAccount(user, natureId, accountId || null);
      toast('success', 'Ligação salva.');
    } catch (e) {
      toast('error', errMsg(e));
    }
  };

  return (
    <Card>
      <CardHeader
        title="Natureza → conta contábil"
        subtitle={`${linked} de ${natures.length} naturezas ligadas. O valor de cada SC aprovada entra na conta ligada à natureza dela.`}
        action={
          <div className="flex items-center gap-4">
            <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Só sem conta
            </label>
            <Input aria-label="Buscar natureza" placeholder="Buscar natureza…" className="h-9 w-56" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />
      <Table min={720}>
        <thead>
          <tr><Th>Natureza</Th><Th>Conta contábil</Th><Th>Na SC</Th></tr>
        </thead>
        <tbody>
          {list.map((n) => {
            const a = n.accountId ? byId.get(n.accountId) : undefined;
            return (
              <tr key={n.id}>
                <Td>
                  <div className="font-medium">{n.name}</div>
                  <div className="tabular text-[12px] text-muted-foreground">{n.code}</div>
                </Td>
                <Td className="w-[440px]">
                  {editor ? (
                    <Select aria-label={`Conta de ${n.name}`} className="h-9" value={n.accountId ?? ''} onChange={(e) => change(n.id, e.target.value)}>
                      <option value="">Sem conta</option>
                      {groups.map((g) => (
                        <optgroup key={g} label={g}>
                          {accounts.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
                        </optgroup>
                      ))}
                    </Select>
                  ) : a ? (
                    <>
                      <div>{a.name}</div>
                      <div className="tabular text-[12px] text-muted-foreground">{a.code}</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Sem conta</span>
                  )}
                </Td>
                <Td>{n.active ? <Badge tone="good">Disponível</Badge> : <Badge tone="neutral">Inativa</Badge>}</Td>
              </tr>
            );
          })}
          {!list.length && <tr><Td className="text-center text-muted-foreground">Nenhuma natureza encontrada.</Td><Td /><Td /></tr>}
        </tbody>
      </Table>
    </Card>
  );
}
