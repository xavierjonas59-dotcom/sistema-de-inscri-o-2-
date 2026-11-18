import { useState } from 'react';
import { useQuery, useUser } from '@/app/session';
import type { Role, User } from '@/domain/types';
import { api } from '@/services/api';
import type { UserInput } from '@/services/DataService';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Td, Th } from '@/components/ui/primitives';
import { errMsg, useLookups } from '../shared/lookups';

const empty: UserInput = { name: '', email: '', role: 'GESTOR', sectorId: null, active: true, password: '' };

export default function UsersAdmin() {
  const user = useUser();
  const toast = useToast();
  const lk = useLookups();
  const { data: users = [] } = useQuery(() => api.listUsers(user), []);
  const [form, setForm] = useState<UserInput | null>(null);

  const open = (u?: User) => setForm(u ? { ...u, password: '' } : { ...empty });
  const save = async () => {
    if (!form) return;
    try {
      await api.saveUser(user, form);
      toast('success', 'Usuário salvo.');
      setForm(null);
    } catch (e) {
      toast('error', errMsg(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Gestores enxergam apenas o próprio setor. A Diretoria tem acesso irrestrito."
        actions={<Button icon="plus" onClick={() => open()}>Novo usuário</Button>}
      />
      <Card>
        <Table>
          <thead><tr><Th>Nome</Th><Th>E-mail</Th><Th>Perfil</Th><Th>Setor</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td className="font-medium">{u.name}</Td>
                <Td className="text-muted-foreground">{u.email}</Td>
                <Td>{u.role === 'DIRETORIA' ? <Badge tone="info">Diretoria</Badge> : <Badge tone="neutral">Gestor</Badge>}</Td>
                <Td>{u.sectorId ? lk.sector(u.sectorId) : '—'}</Td>
                <Td>{u.active ? <Badge tone="good">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge>}</Td>
                <Td right><Button size="sm" variant="ghost" icon="pencil" onClick={() => open(u)}>Editar</Button></Td>
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
          <div className="space-y-4">
            <Field label="Nome completo"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Perfil">
                <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                  <option value="GESTOR">Gestor de setor</option>
                  <option value="DIRETORIA">Diretoria (Master)</option>
                </Select>
              </Field>
              {form.role === 'GESTOR' && (
                <Field label="Setor">
                  <Select value={form.sectorId ?? ''} onChange={(e) => setForm({ ...form, sectorId: e.target.value || null })}>
                    <option value="">Selecione…</option>
                    {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
              )}
            </div>
            <Field label={form.id ? 'Nova senha (opcional)' : 'Senha inicial'} hint="Mínimo de 6 caracteres.">
              <Input type="password" autoComplete="new-password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
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
