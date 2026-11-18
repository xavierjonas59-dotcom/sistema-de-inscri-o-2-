import { useEffect, useState } from 'react';
import { useQuery, useUser } from '@/app/session';
import { date, money, monthLabel, parseMoney } from '@/domain/format';
import { TRANSFER_STATUS } from '@/domain/labels';
import type { Month, Transfer } from '@/domain/types';
import { api } from '@/services/api';
import { Icon } from '@/components/ui/icons';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge, Button, EmptyState, Field, Input, Select, Table, Td, Textarea, Th, cx } from '@/components/ui/primitives';
import { Detail, History } from './History';
import { errMsg, useLookups } from './lookups';

export function TransferTable({ items, onOpen, empty = 'Nenhuma transferência encontrada.' }: { items: Transfer[]; onOpen: (t: Transfer) => void; empty?: string }) {
  const lk = useLookups();
  if (!items.length) return <EmptyState icon="transfer" title={empty} />;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Data</Th>
          <Th>De (cedente) → Para (solicitante)</Th>
          <Th>Competência</Th>
          <Th right>Valor</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((t) => (
          <tr key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => onOpen(t)}>
            <Td className="whitespace-nowrap text-muted-foreground">{date(t.createdAt)}</Td>
            <Td>
              <div className="flex items-center gap-2 font-medium">
                {lk.sector(t.grantingSectorId)} <Icon name="chevronRight" size={14} className="text-muted-foreground" /> {lk.sector(t.requestingSectorId)}
              </div>
              <div className="text-xs text-muted-foreground">Solicitado por {t.requesterName}</div>
            </Td>
            <Td className="whitespace-nowrap text-muted-foreground">{monthLabel(t.month)}</Td>
            <Td right className="font-medium">{money(t.amount)}</Td>
            <Td><Badge tone={TRANSFER_STATUS[t.status].tone}>{TRANSFER_STATUS[t.status].label}</Badge></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** Indicador das duas etapas obrigatórias de aprovação. */
function Steps({ t }: { t: Transfer }) {
  const s = t.status;
  const step1 = s === 'PENDENTE_CEDENTE' ? 'current' : s === 'RECUSADA_CEDENTE' ? 'fail' : s === 'CANCELADA' && !t.grantorDecisionAt ? 'idle' : 'done';
  const step2 =
    s === 'APROVADA' ? 'done' : s === 'REJEITADA_DIRETORIA' ? 'fail' : s === 'PENDENTE_DIRETORIA' ? 'current' : 'idle';
  const node = (state: string, n: number, label: string, sub: string) => (
    <div className="flex flex-1 items-start gap-3">
      <span
        className={cx(
          'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
          state === 'done' && 'bg-status-good text-white',
          state === 'fail' && 'bg-status-critical text-white',
          state === 'current' && 'bg-status-warning text-slate-900',
          state === 'idle' && 'bg-muted text-muted-foreground',
        )}
      >
        {state === 'done' ? <Icon name="check" size={14} /> : state === 'fail' ? <Icon name="x" size={14} /> : n}
      </span>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
  const sub = (st: string) => ({ done: 'Aprovado', fail: 'Recusado', current: 'Aguardando decisão', idle: 'Não iniciado' })[st]!;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
      {node(step1, 1, 'Gestor cedente', sub(step1))}
      <div className="hidden h-px flex-1 bg-border sm:block" />
      {node(step2, 2, 'Diretoria', step2 === 'done' ? 'Limite transferido' : sub(step2))}
    </div>
  );
}

export function TransferDetailModal({ transfer, onClose }: { transfer: Transfer | null; onClose: () => void }) {
  const user = useUser();
  const lk = useLookups();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [refusing, setRefusing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNote('');
    setRefusing(false);
  }, [transfer?.id]);

  const isGrantor = !!transfer && user.role === 'GESTOR' && transfer.grantingSectorId === user.sectorId;
  const { data: grantorBudget } = useQuery(
    async () =>
      transfer && (isGrantor || user.role === 'DIRETORIA') ? api.getBudget(user, transfer.grantingSectorId, transfer.month) : null,
    [transfer?.id],
  );
  if (!transfer) return null;
  const t = transfer;
  const grantorTurn = isGrantor && t.status === 'PENDENTE_CEDENTE';
  const directorTurn = user.role === 'DIRETORIA' && t.status === 'PENDENTE_DIRETORIA';
  const canDecide = grantorTurn || directorTurn;
  const canCancel =
    user.role === 'GESTOR' && t.requestingSectorId === user.sectorId && (t.status === 'PENDENTE_CEDENTE' || t.status === 'PENDENTE_DIRETORIA');

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      if (grantorTurn) await api.grantorDecide(user, t.id, approve, note);
      else await api.directorDecide(user, t.id, approve, note);
      toast(
        'success',
        approve ? (grantorTurn ? 'Cessão aceita. Pedido enviado à Diretoria.' : 'Transferência efetivada: tetos atualizados.') : 'Transferência recusada.',
      );
      onClose();
    } catch (e) {
      toast('error', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Transferência de ${money(t.amount)}`}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone={TRANSFER_STATUS[t.status].tone}>{TRANSFER_STATUS[t.status].label}</Badge>
          <span>Competência {monthLabel(t.month)}</span>
        </span>
      }
      footer={
        <>
          {canCancel && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                try {
                  await api.cancelTransfer(user, t.id);
                  toast('success', 'Pedido cancelado.');
                  onClose();
                } catch (e) {
                  toast('error', errMsg(e));
                }
              }}
            >
              Cancelar pedido
            </Button>
          )}
          {canDecide && !refusing && (
            <>
              <Button variant="danger" icon="x" onClick={() => setRefusing(true)}>Recusar</Button>
              <Button variant="success" icon="check" disabled={busy} onClick={() => decide(true)}>
                {grantorTurn ? 'Aceitar ceder limite' : 'Aprovar e efetivar'}
              </Button>
            </>
          )}
          {canDecide && refusing && (
            <>
              <Button variant="secondary" onClick={() => setRefusing(false)}>Voltar</Button>
              <Button variant="danger" disabled={busy || !note.trim()} onClick={() => decide(false)}>Confirmar recusa</Button>
            </>
          )}
          {!canDecide && !canCancel && <Button variant="secondary" onClick={onClose}>Fechar</Button>}
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        <div className="space-y-5">
          <Steps t={t} />
          <dl className="grid grid-cols-2 gap-4">
            <Detail label="Setor cedente">{lk.sector(t.grantingSectorId)}</Detail>
            <Detail label="Setor solicitante">{lk.sector(t.requestingSectorId)}</Detail>
            <Detail label="Valor"><span className="tabular text-lg font-semibold">{money(t.amount)}</span></Detail>
            <Detail label="Solicitante">{t.requesterName}</Detail>
          </dl>
          <Detail label="Justificativa"><p className="whitespace-pre-wrap">{t.justification}</p></Detail>
          {canDecide && grantorBudget && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{grantorTurn ? 'Seu orçamento neste mês' : `Orçamento de ${lk.sector(t.grantingSectorId)}`}</div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-xs tabular text-muted-foreground">
                <span>Teto atual: {money(grantorBudget.ceiling)}</span>
                <span>Saldo disponível: {money(grantorBudget.available)}</span>
                <span>Teto após cessão: {money(grantorBudget.ceiling - t.amount)}</span>
                <span className={grantorBudget.available - t.amount < 0 ? 'font-medium text-red-700' : ''}>
                  Saldo após cessão: {money(grantorBudget.available - t.amount)}
                </span>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
            <Icon name="info" size={16} className="shrink-0" />
            <span>
              O limite só é transferido após o aceite do gestor cedente <strong>e</strong> a aprovação final da Diretoria. A transferência vale apenas para a competência indicada.
            </span>
          </div>
          {refusing && (
            <Field label="Motivo da recusa">
              <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          )}
          {canDecide && !refusing && (
            <Field label="Observação (opcional)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          )}
        </div>
        <div>
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Histórico</div>
          <History items={t.history} />
        </div>
      </div>
    </Modal>
  );
}

export function NewTransferModal({ open, onClose, month }: { open: boolean; onClose: () => void; month: Month }) {
  const user = useUser();
  const toast = useToast();
  const { sectors } = useLookups();
  const [form, setForm] = useState({ grantingSectorId: '', amount: '', justification: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ grantingSectorId: '', amount: '', justification: '' });
      setError('');
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.createTransfer(user, { ...form, amount: parseMoney(form.amount), month });
      toast('success', 'Pedido enviado ao gestor do setor cedente.');
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pedir limite emprestado"
      description={`Transferência temporária válida para ${monthLabel(month)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Enviando…' : 'Enviar pedido'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <ol className="grid gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground sm:grid-cols-3">
          <li><strong className="text-foreground">1.</strong> Você envia o pedido</li>
          <li><strong className="text-foreground">2.</strong> Gestor cedente aceita</li>
          <li><strong className="text-foreground">3.</strong> Diretoria aprova e o limite é transferido</li>
        </ol>
        <Field label="Setor cedente (de quem pedir)">
          <Select value={form.grantingSectorId} onChange={(e) => setForm({ ...form, grantingSectorId: e.target.value })}>
            <option value="">Selecione…</option>
            {sectors.filter((s) => s.id !== user.sectorId).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Valor solicitado (R$)">
          <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
        </Field>
        <Field label="Justificativa">
          <Textarea value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} placeholder="Explique a necessidade da compra acima do seu saldo" />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      </div>
    </Modal>
  );
}
