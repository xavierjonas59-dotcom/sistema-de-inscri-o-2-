import { useState, type FormEvent } from 'react';
import { useQuery, useUser } from '@/app/session';
import type { Category } from '@/domain/types';
import { api } from '@/services/api';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge, Button, Card, Field, Input, PageHeader, Table, Td, Th } from '@/components/ui/primitives';
import { errMsg } from '../shared/lookups';

export default function CategoriesAdmin() {
  const user = useUser();
  const toast = useToast();
  const { data: items = [] } = useQuery(() => api.listCategories(user, true), []);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.saveCategory(user, { name });
      setName('');
      toast('success', 'Natureza cadastrada.');
    } catch (err) {
      toast('error', errMsg(err));
    }
  };

  const save = async () => {
    if (!editing) return;
    try {
      await api.saveCategory(user, editing);
      setEditing(null);
      toast('success', 'Natureza atualizada.');
    } catch (err) {
      toast('error', errMsg(err));
    }
  };

  return (
    <>
      <PageHeader title="Naturezas de despesa" description="Categorias usadas para classificar cada compra. Desative em vez de excluir para preservar o histórico." />
      <Card className="mb-6 p-5">
        <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Nova natureza"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Treinamentos" /></Field>
          </div>
          <Button type="submit" icon="plus" disabled={!name.trim()}>Adicionar</Button>
        </form>
      </Card>
      <Card>
        <Table>
          <thead><tr><Th>Natureza</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium">{c.name}</Td>
                <Td>{c.active ? <Badge tone="good">Ativa</Badge> : <Badge tone="neutral">Inativa</Badge>}</Td>
                <Td right>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing({ ...c })}>Renomear</Button>
                    <Button size="sm" variant="secondary" onClick={() => api.saveCategory(user, { ...c, active: !c.active }).catch((e) => toast('error', errMsg(e)))}>
                      {c.active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Renomear natureza"
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
        <Field label="Nome"><Input value={editing?.name ?? ''} onChange={(e) => editing && setEditing({ ...editing, name: e.target.value })} /></Field>
      </Modal>
    </>
  );
}
