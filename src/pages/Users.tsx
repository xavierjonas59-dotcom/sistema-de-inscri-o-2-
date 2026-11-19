import { useState } from 'react';
import { useQuery, useUser } from '@/app/session';
import { centsToInput, money, parseMoney } from '@/domain/format';
import { ROLE_LABEL } from '@/domain/sc';
import type { Role, User } from '@/domain/types';
import { api } from '@/services/api';
import type { UserInput } from '@/services/DataService';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Td, Th } from '@/components/ui/primitives';
import { errMsg, useLookups } from './shared/lookups';

/**
 * Admin: todos os usuários e perfis.
 * Gestor: só o próprio setor; cria apenas Funcionários (o servidor força perfil e setor).
 */
export default function Users() {
  const user = useUser();
  const toast = useToast();
  const lk = useLookups();
  const isAdmin = user.role === 'ADMIN';
  const { data: users = [] } = useQuery(() => api.listUsers(user), [user.id]);
  const [form, setForm] = useState<UserInput | null>(null);
  const [limitText, setLimitText] = useState('');

  const open = (u?: User) => {
    setForm(u ? { ...u, password: '' } : { name: '', email: '', role: 'FUNCIONARIO', sectorId: isAdmin ? null : user.sectorId, cargo: '', active: true, password: '' });
    setLimitText(u?.paymentLimit ? centsToInput(u.paymentLimit) : '');
  };
  const canEdit = (u: User) => isAdmin || (u.role === 'FUNCIONARIO' && u.sectorId === user.sectorId);
  const save = async () => {
    try {
      const paymentLimit = form!.role === 'DIRETORIA' && limitText.trim() ? parseMoney(limitText) : null;
      if (Number.isNaN(paymentLimit)) throw new Error('Limite de liberação inválido.');
      await api.saveUser(user, { ...form!, paymentLimit });
      toast('success', 'Usuário salvo.');
      setForm(null);
    } catch (e) {
      toast('error', errMsg(e));
    }
  };

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Usuários' : `Usuários do setor ${lk.sector(user.sectorId!)}`}
        description={isAdmin ? 'Perfis: Funcionário, Gestor, Diretoria, Financeiro e Admin.' : 'Usuários criados aqui entram como Funcionário do seu setor.'}
        actions={<Button icon="plus" onClick={() => open()}>Novo usuário</Button>}
      />
      <Card>
        <Table>
          <thead><tr><Th>Nome</Th><Th>E-mail</Th><Th>Perfil</Th><Th>Setor</Th><Th>Cargo</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td className="font-medium">{u.name}</Td>
                <Td className="text-muted-foreground">{u.email}</Td>
                <Td>{ROLE_LABEL[u.role]}</Td>
                <Td>{u.sectorId ? lk.sector(u.sectorId) : '—'}</Td>
                <Td>
                  {u.cargo || '—'}
                  {u.role === 'DIRETORIA' && <div className="text-xs text-muted-foreground">Libera {u.paymentLimit === null ? 'qualquer valor' : `até ${money(u.paymentLimit)}`}</div>}
                </Td>
                <Td>{u.active ? <Badge tone="good">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge>}</Td>
                <Td right>{canEdit(u) && u.id !== user.id && <Button size="sm" variant="ghost" onClick={() => open(u)}>Editar</Button>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Editar usuário' : 'Novo usuário'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}
      >
        {form && (
          <div className="space-y-3">
            <Field label="Nome completo"><Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="E-mail"><Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Cargo (sai abaixo da assinatura)"><Input id="u-cargo" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></Field>
            {isAdmin ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Perfil">
                  <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                </Field>
                {(form.role === 'FUNCIONARIO' || form.role === 'GESTOR' || form.role === 'DIRETORIA') && (
                  <Field label={form.role === 'DIRETORIA' ? 'Setor que dirige (opcional)' : 'Setor'}>
                    <Select value={form.sectorId ?? ''} onChange={(e) => setForm({ ...form, sectorId: e.target.value || null })}>
                      <option value="">{form.role === 'DIRETORIA' ? 'Nenhum (diretor geral)' : 'Selecione…'}</option>
                      {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Quem você cadastra entra como funcionário do setor {lk.sector(user.sectorId!)}.</p>
            )}
            {isAdmin && form.role === 'DIRETORIA' && (
              <Field label="Limite para liberar pagamentos (R$)" hint="Deixe vazio para liberar qualquer valor.">
                <Input id="u-limit" inputMode="decimal" value={limitText} onChange={(e) => setLimitText(e.target.value)} placeholder="Sem limite" />
              </Field>
            )}
            <Field label={form.id ? 'Nova senha (opcional)' : 'Senha inicial'} hint="Mínimo de 6 caracteres.">
              <Input id="u-pass" type="password" autoComplete="new-password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Usuário ativo
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
