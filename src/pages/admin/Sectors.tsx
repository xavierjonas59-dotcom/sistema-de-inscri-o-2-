import { useState } from 'react';
import { useQuery, useSession, useUser } from '@/app/session';
import { centsToInput, money, monthLabel, parseMoney } from '@/domain/format';
import type { Sector } from '@/domain/types';
import { api } from '@/services/api';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Table, Td, Th } from '@/components/ui/primitives';
import { errMsg } from '../shared/lookups';

export default function SectorsAdmin() {
  const user = useUser();
  const { month } = useSession();
  const toast = useToast();
  const { data: sectors = [] } = useQuery(() => api.listSectors(user), []);
  const { data: overrides = [] } = useQuery(() => api.listOverrides(user, month), [month]);
  const [editing, setEditing] = useState<Partial<Sector> | null>(null);
  const [form, setForm] = useState({ name: '', ceiling: '', active: true });
  const [monthEdit, setMonthEdit] = useState<{ sector: Sector; value: string } | null>(null);

  const openEdit = (s?: Sector) => {
    setEditing(s ?? {});
    setForm({ name: s?.name ?? '', ceiling: s ? centsToInput(s.defaultCeiling) : '', active: s?.active ?? true });
  };

  const save = async () => {
    try {
      await api.saveSector(user, { id: editing?.id, name: form.name, defaultCeiling: parseMoney(form.ceiling), active: form.active });
      toast('success', 'Setor salvo.');
      setEditing(null);
    } catch (e) {
      toast('error', errMsg(e));
    }
  };

  const saveMonth = async (clear = false) => {
    if (!monthEdit) return;
    try {
      await api.setOverride(user, monthEdit.sector.id, month, clear ? null : parseMoney(monthEdit.value));
      toast('success', clear ? 'Teto específico removido.' : `Teto de ${monthLabel(month)} atualizado.`);
      setMonthEdit(null);
    } catch (e) {
      toast('error', errMsg(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Setores e tetos"
        description="Defina o teto mensal padrão de cada setor e, se necessário, um teto específico para uma competência."
        actions={<Button icon="plus" onClick={() => openEdit()}>Novo setor</Button>}
      />
      <Card>
        <CardHeader title="Setores" subtitle={`Teto da competência ${monthLabel(month)} (altere o mês no topo)`} />
        <Table>
          <thead>
            <tr><Th>Setor</Th><Th right>Teto padrão</Th><Th right>Teto em {monthLabel(month)}</Th><Th>Status</Th><Th /></tr>
          </thead>
          <tbody>
            {sectors.map((s) => {
              const o = overrides.find((x) => x.sectorId === s.id);
              return (
                <tr key={s.id}>
                  <Td className="font-medium">{s.name}</Td>
                  <Td right>{money(s.defaultCeiling)}</Td>
                  <Td right>
                    {o ? <span className="font-medium">{money(o.ceiling)} <span className="text-xs font-normal text-muted-foreground">(específico)</span></span> : <span className="text-muted-foreground">padrão</span>}
                  </Td>
                  <Td>{s.active ? <Badge tone="good">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge>}</Td>
                  <Td right>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setMonthEdit({ sector: s, value: centsToInput(o?.ceiling ?? s.defaultCeiling) })}>Teto do mês</Button>
                      <Button size="sm" variant="ghost" icon="pencil" onClick={() => openEdit(s)}>Editar</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar setor' : 'Novo setor'}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}
      >
        <div className="space-y-4">
          <Field label="Nome do setor"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Teto mensal padrão (R$)" hint="Usado em todas as competências sem teto específico.">
            <Input inputMode="decimal" value={form.ceiling} onChange={(e) => setForm({ ...form, ceiling: e.target.value })} placeholder="32.000,00" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Setor ativo
          </label>
        </div>
      </Modal>

      <Modal
        open={!!monthEdit}
        onClose={() => setMonthEdit(null)}
        title={`Teto de ${monthEdit?.sector.name} em ${monthLabel(month)}`}
        description="Sobrepõe o teto padrão apenas nesta competência."
        footer={
          <>
            <Button variant="ghost" onClick={() => saveMonth(true)}>Voltar ao padrão</Button>
            <Button onClick={() => saveMonth()}>Salvar</Button>
          </>
        }
      >
        <Field label="Teto (R$)">
          <Input inputMode="decimal" value={monthEdit?.value ?? ''} onChange={(e) => monthEdit && setMonthEdit({ ...monthEdit, value: e.target.value })} />
        </Field>
      </Modal>
    </>
  );
}
