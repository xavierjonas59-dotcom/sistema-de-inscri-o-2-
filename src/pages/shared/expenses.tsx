import { useEffect, useState } from 'react';
import { useQuery, useUser } from '@/app/session';
import { date, money, monthLabel, parseMoney } from '@/domain/format';
import { EXPENSE_STATUS } from '@/domain/labels';
import type { Attachment, Expense, Month } from '@/domain/types';
import { api } from '@/services/api';
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '@/services/LocalDataService';
import { Icon } from '@/components/ui/icons';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge, Button, EmptyState, Field, Input, Select, Table, Td, Textarea, Th } from '@/components/ui/primitives';
import { Detail, History } from './History';
import { errMsg, useLookups } from './lookups';

export function ExpenseTable({
  items,
  showSector,
  onOpen,
  empty = 'Nenhuma solicitação encontrada.',
}: {
  items: Expense[];
  showSector?: boolean;
  onOpen: (e: Expense) => void;
  empty?: string;
}) {
  const lk = useLookups();
  if (!items.length) return <EmptyState icon="receipt" title={empty} />;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Data</Th>
          <Th>Descrição</Th>
          {showSector && <Th>Setor / Gestor</Th>}
          <Th>Natureza</Th>
          <Th right>Valor</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((e) => (
          <tr key={e.id} className="cursor-pointer hover:bg-muted/40" onClick={() => onOpen(e)}>
            <Td className="whitespace-nowrap text-muted-foreground">{date(e.createdAt)}</Td>
            <Td>
              <div className="font-medium">{e.description}</div>
              {e.attachment && (
                <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Icon name="paperclip" size={12} /> anexo
                </span>
              )}
            </Td>
            {showSector && (
              <Td>
                <div>{lk.sector(e.sectorId)}</div>
                <div className="text-xs text-muted-foreground">{e.requesterName}</div>
              </Td>
            )}
            <Td className="text-muted-foreground">{lk.category(e.categoryId)}</Td>
            <Td right className="font-medium">{money(e.amount)}</Td>
            <Td>
              <Badge tone={EXPENSE_STATUS[e.status].tone}>{EXPENSE_STATUS[e.status].label}</Badge>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function ExpenseDetailModal({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const user = useUser();
  const lk = useLookups();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setReason('');
    setRejecting(false);
  }, [expense?.id]);

  const { data: budget } = useQuery(
    async () => (expense && user.role === 'DIRETORIA' ? api.getBudget(user, expense.sectorId, expense.month) : null),
    [expense?.id],
  );

  if (!expense) return null;
  const e = expense;
  const pending = e.status === 'PENDENTE_DIRETORIA';
  const canDecide = user.role === 'DIRETORIA' && pending;
  const canCancel = user.role === 'GESTOR' && pending && e.sectorId === user.sectorId;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast('success', ok);
      onClose();
    } catch (err) {
      toast('error', errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={e.description}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone={EXPENSE_STATUS[e.status].tone}>{EXPENSE_STATUS[e.status].label}</Badge>
          <span>Competência {monthLabel(e.month)}</span>
        </span>
      }
      footer={
        <>
          {canCancel && (
            <Button variant="secondary" disabled={busy} onClick={() => run(() => api.cancelExpense(user, e.id), 'Solicitação cancelada.')}>
              Cancelar solicitação
            </Button>
          )}
          {canDecide && !rejecting && (
            <>
              <Button variant="danger" icon="x" onClick={() => setRejecting(true)}>Rejeitar</Button>
              <Button variant="success" icon="check" disabled={busy} onClick={() => run(() => api.decideExpense(user, e.id, true), 'Despesa aprovada e descontada do saldo.')}>
                Aprovar
              </Button>
            </>
          )}
          {canDecide && rejecting && (
            <>
              <Button variant="secondary" onClick={() => setRejecting(false)}>Voltar</Button>
              <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => run(() => api.decideExpense(user, e.id, false, reason), 'Despesa rejeitada.')}>
                Confirmar rejeição
              </Button>
            </>
          )}
          {!canCancel && !canDecide && <Button variant="secondary" onClick={onClose}>Fechar</Button>}
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-4">
            <Detail label="Valor"><span className="tabular text-lg font-semibold">{money(e.amount)}</span></Detail>
            <Detail label="Natureza">{lk.category(e.categoryId)}</Detail>
            <Detail label="Setor">{lk.sector(e.sectorId)}</Detail>
            <Detail label="Solicitante">{e.requesterName}</Detail>
          </dl>
          <Detail label="Justificativa"><p className="whitespace-pre-wrap">{e.justification}</p></Detail>
          {e.decisionReason && (
            <Detail label="Motivo da decisão"><p className="rounded-md bg-red-50 px-3 py-2 text-red-900">{e.decisionReason}</p></Detail>
          )}
          <Detail label="Comprovante / orçamento">
            {e.attachment ? (
              <a href={e.attachment.url} download={e.attachment.name} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-muted">
                <Icon name="paperclip" size={16} />
                <span className="font-medium">{e.attachment.name}</span>
                <span className="text-xs text-muted-foreground">{(e.attachment.size / 1024).toFixed(0)} KB</span>
              </a>
            ) : (
              <span className="text-muted-foreground">Sem anexo</span>
            )}
          </Detail>
          {canDecide && budget && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="font-medium">Impacto no orçamento de {lk.sector(e.sectorId)}</div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-muted-foreground tabular">
                <span>Teto: {money(budget.ceiling)}</span>
                <span>Já aprovado: {money(budget.approved)}</span>
                <span>Após aprovar: {money(budget.approved + e.amount)}</span>
                <span>Saldo disponível: {money(budget.available)}</span>
              </div>
            </div>
          )}
          {rejecting && (
            <Field label="Motivo da rejeição" hint="Será exibido ao gestor.">
              <Textarea autoFocus value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Explique o motivo…" />
            </Field>
          )}
        </div>
        <div>
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Histórico</div>
          <History items={e.history} />
        </div>
      </div>
    </Modal>
  );
}

function readFile(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mimeType: file.type, size: file.size, url: String(r.result) });
    r.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    r.readAsDataURL(file);
  });
}

export function NewExpenseModal({ open, onClose, month }: { open: boolean; onClose: () => void; month: Month }) {
  const user = useUser();
  const toast = useToast();
  const { categories } = useLookups();
  const { data: budget } = useQuery(() => api.getBudget(user, user.sectorId!, month), [month, open]);
  const [form, setForm] = useState({ description: '', amount: '', categoryId: '', justification: '' });
  const [file, setFile] = useState<Attachment | null>(null);
  const [fileErr, setFileErr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ description: '', amount: '', categoryId: '', justification: '' });
      setFile(null);
      setError('');
      setFileErr('');
    }
  }, [open]);

  const cents = parseMoney(form.amount);
  const validAmount = Number.isFinite(cents) && cents > 0;
  const after = budget && validAmount ? budget.available - cents : null;
  const insufficient = after !== null && after < 0;

  const onFile = async (f: File | undefined) => {
    setFileErr('');
    setFile(null);
    if (!f) return;
    if (!ALLOWED_ATTACHMENT_TYPES.includes(f.type)) return setFileErr('Use PDF, PNG, JPG ou WEBP.');
    if (f.size > MAX_ATTACHMENT_BYTES) return setFileErr('Arquivo maior que 2 MB.');
    setFile(await readFile(f));
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.createExpense(user, { ...form, amount: cents, attachment: file, month });
      toast('success', 'Solicitação enviada para a Diretoria.');
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova solicitação de despesa"
      description={`Competência ${monthLabel(month)} · entra como “Pendente Diretoria”`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || insufficient}>{busy ? 'Enviando…' : 'Enviar para aprovação'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {budget && (
          <div className={`rounded-lg border p-3 text-sm ${insufficient ? 'border-red-200 bg-red-50' : 'bg-muted/40'}`}>
            <div className="flex justify-between tabular">
              <span className="text-muted-foreground">Saldo disponível</span>
              <strong>{money(budget.available)}</strong>
            </div>
            {after !== null && (
              <div className="mt-1 flex justify-between tabular">
                <span className="text-muted-foreground">Saldo após esta solicitação</span>
                <strong className={insufficient ? 'text-red-700' : ''}>{money(after)}</strong>
              </div>
            )}
            {insufficient && (
              <p className="mt-2 flex items-start gap-2 text-red-800">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                <span>
                  Saldo insuficiente. <a className="font-medium underline" href="#/transferencias?novo=1" onClick={onClose}>Solicite uma transferência de limite</a> a outro setor.
                </span>
              </p>
            )}
          </div>
        )}
        <Field label="Descrição do item/serviço">
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: Manutenção do ar-condicionado" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor (R$)">
            <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
          </Field>
          <Field label="Natureza da despesa">
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Selecione…</option>
              {categories.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Justificativa">
          <Textarea value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} placeholder="Por que esta despesa é necessária?" />
        </Field>
        <Field label="Comprovante ou orçamento" hint="PDF ou imagem, até 2 MB." error={fileErr}>
          <input
            type="file"
            accept={ALLOWED_ATTACHMENT_TYPES.join(',')}
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/15"
          />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      </div>
    </Modal>
  );
}
