import { useState } from 'react';
import { useQuery, useSession, useUser } from '@/app/session';
import { date, money, monthLabel, parseMoney } from '@/domain/format';
import { TRANSFER_STATUS } from '@/domain/labels';
import type { Transfer } from '@/domain/types';
import { api } from '@/services/api';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from '@/components/ui/primitives';
import { errMsg, useLookups } from './shared/lookups';

/** Transferência temporária de limite: gestor pede → gestor cedente aceita → diretoria efetiva. */
export default function Transfers() {
  const user = useUser();
  const { month } = useSession();
  const toast = useToast();
  const lk = useLookups();
  const { data: items = [] } = useQuery(() => api.listTransfers(user), [user.id]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ grantingSectorId: '', amount: '', justification: '' });
  const [deciding, setDeciding] = useState<{ t: Transfer; approve: boolean } | null>(null);
  const [note, setNote] = useState('');

  const canDecide = (t: Transfer) =>
    (user.role === 'GESTOR' && t.status === 'PENDENTE_CEDENTE' && t.grantingSectorId === user.sectorId) ||
    (user.role === 'DIRETORIA' && t.status === 'PENDENTE_DIRETORIA');

  const create = async () => {
    try {
      await api.createTransfer(user, { grantingSectorId: form.grantingSectorId, amount: parseMoney(form.amount), justification: form.justification, month });
      toast('success', 'Pedido enviado ao gestor do setor cedente.');
      setCreating(false);
      setForm({ grantingSectorId: '', amount: '', justification: '' });
    } catch (e) {
      toast('error', errMsg(e));
    }
  };
  const decide = async () => {
    const { t, approve } = deciding!;
    try {
      if (user.role === 'DIRETORIA') await api.directorDecideTransfer(user, t.id, approve, note);
      else await api.grantorDecide(user, t.id, approve, note);
      toast('success', approve ? (user.role === 'DIRETORIA' ? 'Limite transferido.' : 'Aceito. Segue para a diretoria.') : 'Pedido recusado.');
      setDeciding(null);
      setNote('');
    } catch (e) {
      toast('error', errMsg(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Transferência de limite"
        description="Empréstimo temporário de limite entre setores, válido só na competência do pedido. Precisa do aceite do gestor cedente e da aprovação da diretoria."
        actions={user.role === 'GESTOR' && <Button icon="plus" onClick={() => setCreating(true)}>Pedir limite</Button>}
      />
      <Card>
        {items.length ? (
          <Table>
            <thead><tr><Th>Data</Th><Th>Cedente → Solicitante</Th><Th>Competência</Th><Th right>Valor</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <Td className="whitespace-nowrap">{date(t.createdAt)}</Td>
                  <Td>
                    <div className="font-medium">{lk.sector(t.grantingSectorId)} → {lk.sector(t.requestingSectorId)}</div>
                    <div className="text-xs text-muted-foreground">{t.requesterName}: {t.justification}</div>
                  </Td>
                  <Td>{monthLabel(t.month)}</Td>
                  <Td right>{money(t.amount)}</Td>
                  <Td><Badge tone={TRANSFER_STATUS[t.status].tone}>{TRANSFER_STATUS[t.status].label}</Badge></Td>
                  <Td right>
                    {canDecide(t) && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="danger" onClick={() => setDeciding({ t, approve: false })}>Recusar</Button>
                        <Button size="sm" onClick={() => setDeciding({ t, approve: true })}>{user.role === 'DIRETORIA' ? 'Aprovar' : 'Aceitar'}</Button>
                      </div>
                    )}
                    {user.role === 'GESTOR' && t.requestingSectorId === user.sectorId && (t.status === 'PENDENTE_CEDENTE' || t.status === 'PENDENTE_DIRETORIA') && (
                      <Button size="sm" variant="ghost" onClick={() => api.cancelTransfer(user, t.id).catch((e) => toast('error', errMsg(e)))}>Cancelar</Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhum pedido de transferência." />
        )}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="Pedir limite emprestado" description={`Válido para ${monthLabel(month)}`}
        footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button><Button onClick={create}>Enviar pedido</Button></>}>
        <div className="space-y-3">
          <Field label="Setor cedente">
            <Select value={form.grantingSectorId} onChange={(e) => setForm({ ...form, grantingSectorId: e.target.value })}>
              <option value="">Selecione…</option>
              {lk.sectors.filter((s) => s.id !== user.sectorId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Valor (R$)"><Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" /></Field>
          <Field label="Justificativa"><Textarea value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal open={!!deciding} onClose={() => setDeciding(null)} title={deciding?.approve ? 'Confirmar' : 'Recusar pedido'} description={deciding ? `${money(deciding.t.amount)} de ${lk.sector(deciding.t.grantingSectorId)} para ${lk.sector(deciding.t.requestingSectorId)}` : ''}
        footer={<><Button variant="secondary" onClick={() => setDeciding(null)}>Voltar</Button><Button variant={deciding?.approve ? 'primary' : 'danger'} disabled={!deciding?.approve && !note.trim()} onClick={decide}>{deciding?.approve ? 'Confirmar' : 'Recusar'}</Button></>}>
        <Field label={deciding?.approve ? 'Observação (opcional)' : 'Motivo (obrigatório)'}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
