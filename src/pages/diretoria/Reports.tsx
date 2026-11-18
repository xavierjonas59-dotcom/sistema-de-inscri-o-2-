import { useState } from 'react';
import { useQuery, useSession, useUser } from '@/app/session';
import { csvMoney, downloadCsv } from '@/domain/csv';
import { date, money, monthLabel, pct } from '@/domain/format';
import { ALERT, EXPENSE_STATUS, TRANSFER_STATUS } from '@/domain/labels';
import { api } from '@/services/api';
import { Button, Card, CardHeader, PageHeader, Select, Table, Td, Th } from '@/components/ui/primitives';
import { useLookups } from '../shared/lookups';

export default function Reports() {
  const user = useUser();
  const { month } = useSession();
  const lk = useLookups();
  const [sectorId, setSectorId] = useState('');

  const { data: budgets = [] } = useQuery(() => api.getAllBudgets(user, month), [month]);
  const { data: expenses = [] } = useQuery(() => api.listExpenses(user, { month, sectorId: sectorId || undefined }), [month, sectorId]);
  const { data: transfers = [] } = useQuery(() => api.listTransfers(user, { month, sectorId: sectorId || undefined }), [month, sectorId]);

  const rows = budgets.filter((b) => !sectorId || b.sectorId === sectorId);
  const approved = expenses.filter((e) => e.status === 'APROVADA');
  const byCat = new Map<string, number>();
  approved.forEach((e) => byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.amount));
  const catRows = [...byCat].sort((a, b) => b[1] - a[1]);
  const catTotal = catRows.reduce((s, [, v]) => s + v, 0);
  const scope = sectorId ? lk.sector(sectorId) : 'todos-setores';

  const exportSectors = () =>
    downloadCsv(`consolidado-setores-${month}.csv`,
      ['Setor', 'Teto base', 'Recebido (transf.)', 'Cedido (transf.)', 'Teto efetivo', 'Gasto aprovado', 'Em análise', 'Saldo disponível', '% comprometido', 'Situação'],
      rows.map((b) => [lk.sector(b.sectorId), csvMoney(b.baseCeiling), csvMoney(b.transfersIn), csvMoney(b.transfersOut), csvMoney(b.ceiling),
        csvMoney(b.approved), csvMoney(b.pending), csvMoney(b.available), (b.usage * 100).toFixed(1).replace('.', ','), ALERT[b.alert].label]));

  const exportCategories = () =>
    downloadCsv(`naturezas-${scope}-${month}.csv`, ['Natureza', 'Valor aprovado (R$)', '% do total'],
      catRows.map(([id, v]) => [lk.category(id), csvMoney(v), ((v / catTotal) * 100).toFixed(1).replace('.', ',')]));

  const exportExpenses = () =>
    downloadCsv(`despesas-${scope}-${month}.csv`,
      ['Data', 'Setor', 'Solicitante', 'Descrição', 'Natureza', 'Valor (R$)', 'Status', 'Justificativa', 'Motivo decisão'],
      expenses.map((e) => [date(e.createdAt), lk.sector(e.sectorId), e.requesterName, e.description, lk.category(e.categoryId),
        csvMoney(e.amount), EXPENSE_STATUS[e.status].label, e.justification, e.decisionReason ?? '']));

  const exportTransfers = () =>
    downloadCsv(`transferencias-${scope}-${month}.csv`,
      ['Data', 'Cedente', 'Solicitante (setor)', 'Solicitante', 'Valor (R$)', 'Status', 'Justificativa'],
      transfers.map((t) => [date(t.createdAt), lk.sector(t.grantingSectorId), lk.sector(t.requestingSectorId), t.requesterName,
        csvMoney(t.amount), TRANSFER_STATUS[t.status].label, t.justification]));

  return (
    <>
      <PageHeader
        title="Relatórios"
        description={`Competência ${monthLabel(month)}${sectorId ? ` · ${lk.sector(sectorId)}` : ' · todos os setores'}`}
        actions={<Button variant="secondary" icon="printer" onClick={() => window.print()}>Imprimir / salvar PDF</Button>}
      />
      <div className="no-print mb-6 grid gap-3 sm:grid-cols-[220px_1fr]">
        <Select value={sectorId} onChange={(e) => setSectorId(e.target.value)} aria-label="Filtrar setor">
          <option value="">Todos os setores</option>
          {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon="download" onClick={exportSectors}>Consolidado por setor</Button>
          <Button size="sm" variant="secondary" icon="download" onClick={exportCategories} disabled={!catRows.length}>Por natureza</Button>
          <Button size="sm" variant="secondary" icon="download" onClick={exportExpenses} disabled={!expenses.length}>Despesas detalhadas</Button>
          <Button size="sm" variant="secondary" icon="download" onClick={exportTransfers} disabled={!transfers.length}>Transferências</Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Consolidado por setor" />
          <Table>
            <thead>
              <tr><Th>Setor</Th><Th right>Teto efetivo</Th><Th right>Gasto</Th><Th right>Em análise</Th><Th right>Disponível</Th><Th right>%</Th><Th>Situação</Th></tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.sectorId}>
                  <Td className="font-medium">{lk.sector(b.sectorId)}</Td>
                  <Td right>{money(b.ceiling)}</Td>
                  <Td right>{money(b.approved)}</Td>
                  <Td right>{money(b.pending)}</Td>
                  <Td right className={b.available < 0 ? 'text-red-700' : ''}>{money(b.available)}</Td>
                  <Td right>{pct(b.usage)}</Td>
                  <Td>{ALERT[b.alert].label}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Gastos por natureza de despesa" subtitle="Somente despesas aprovadas" />
          <Table>
            <thead><tr><Th>Natureza</Th><Th right>Valor</Th><Th right>% do total</Th></tr></thead>
            <tbody>
              {catRows.map(([id, v]) => (
                <tr key={id}><Td>{lk.category(id)}</Td><Td right>{money(v)}</Td><Td right>{pct(v / catTotal)}</Td></tr>
              ))}
              {catRows.length > 0 && (
                <tr className="font-semibold"><Td>Total</Td><Td right>{money(catTotal)}</Td><Td right>100%</Td></tr>
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Despesas do período" subtitle={`${expenses.length} registro(s)`} />
          <Table>
            <thead><tr><Th>Data</Th><Th>Setor</Th><Th>Descrição</Th><Th>Natureza</Th><Th right>Valor</Th><Th>Status</Th></tr></thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap">{date(e.createdAt)}</Td>
                  <Td>{lk.sector(e.sectorId)}</Td>
                  <Td>{e.description}</Td>
                  <Td>{lk.category(e.categoryId)}</Td>
                  <Td right>{money(e.amount)}</Td>
                  <Td>{EXPENSE_STATUS[e.status].label}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
