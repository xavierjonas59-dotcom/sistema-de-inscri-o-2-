import { useState, type FormEvent } from 'react';
import { useQuery, useSession, useUser } from '@/app/session';
import { centsToInput, money, monthLabel, parseMoney } from '@/domain/format';
import type { Sector, Supplier } from '@/domain/types';
import { api } from '@/services/api';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Table, Td, Th } from '@/components/ui/primitives';
import { errMsg } from '../shared/lookups';

export function SectorsAdmin() {
  const user = useUser();
  const { month } = useSession();
  const toast = useToast();
  const { data: sectors = [] } = useQuery(() => api.listSectors(user), []);
  const { data: overrides = [] } = useQuery(() => api.listOverrides(user, month), [month]);
  const [edit, setEdit] = useState<{ id?: string; name: string; limit: string; active: boolean } | null>(null);
  const [monthEdit, setMonthEdit] = useState<{ sector: Sector; value: string } | null>(null);

  const save = async () => {
    try {
      await api.saveSector(user, { id: edit!.id, name: edit!.name, monthlyLimit: parseMoney(edit!.limit), active: edit!.active });
      toast('success', 'Setor salvo.');
      setEdit(null);
    } catch (e) {
      toast('error', errMsg(e));
    }
  };
  const saveMonth = async (clear: boolean) => {
    try {
      await api.setOverride(user, monthEdit!.sector.id, month, clear ? null : parseMoney(monthEdit!.value));
      toast('success', clear ? 'Voltou ao limite padrão.' : 'Limite do mês atualizado.');
      setMonthEdit(null);
    } catch (e) {
      toast('error', errMsg(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Setores e limites"
        description="O limite é do setor: gestor e funcionários usam o mesmo saldo. Os gestores são definidos em Usuários."
        actions={<Button icon="plus" onClick={() => setEdit({ name: '', limit: '', active: true })}>Novo setor</Button>}
      />
      <Card>
        <Table>
          <thead><tr><Th>Setor</Th><Th right>Limite mensal padrão</Th><Th right>Limite em {monthLabel(month)}</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {sectors.map((s) => {
              const o = overrides.find((x) => x.sectorId === s.id);
              return (
                <tr key={s.id}>
                  <Td className="font-medium">{s.name}</Td>
                  <Td right>{money(s.monthlyLimit)}</Td>
                  <Td right>{o ? <>{money(o.limit)} <span className="text-xs text-muted-foreground">(específico)</span></> : <span className="text-muted-foreground">padrão</span>}</Td>
                  <Td>{s.active ? <Badge tone="good">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge>}</Td>
                  <Td right>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setMonthEdit({ sector: s, value: centsToInput(o?.limit ?? s.monthlyLimit) })}>Limite do mês</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEdit({ id: s.id, name: s.name, limit: centsToInput(s.monthlyLimit), active: s.active })}>Editar</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar setor' : 'Novo setor'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
        {edit && (
          <div className="space-y-3">
            <Field label="Nome"><Input id="sec-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Limite mensal padrão (R$)"><Input id="sec-limit" inputMode="decimal" value={edit.limit} onChange={(e) => setEdit({ ...edit, limit: e.target.value })} placeholder="30.000,00" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Setor ativo</label>
          </div>
        )}
      </Modal>
      <Modal open={!!monthEdit} onClose={() => setMonthEdit(null)} title={`Limite de ${monthEdit?.sector.name} em ${monthLabel(month)}`} description="Vale só para esta competência."
        footer={<><Button variant="ghost" onClick={() => saveMonth(true)}>Voltar ao padrão</Button><Button onClick={() => saveMonth(false)}>Salvar</Button></>}>
        <Field label="Limite (R$)"><Input id="sec-month" inputMode="decimal" value={monthEdit?.value ?? ''} onChange={(e) => monthEdit && setMonthEdit({ ...monthEdit, value: e.target.value })} /></Field>
      </Modal>
    </>
  );
}

/** Centros de custo e naturezas: listas com código + nome. */
export function CodesAdmin() {
  const user = useUser();
  const { data: cc = [] } = useQuery(() => api.listCostCenters(user, true), []);
  const { data: nat = [] } = useQuery(() => api.listNatures(user, true), []);
  return (
    <>
      <PageHeader title="Centros de custo e naturezas" description="Códigos usados no rateio e na natureza da compra. Desative em vez de excluir para manter o histórico." />
      <div className="grid gap-4 lg:grid-cols-2">
        <CodedList title="Centros de custo" example="220101 · ADMINISTRATIVO" items={cc} onSave={(x) => api.saveCostCenter(user, x)} />
        <CodedList title="Naturezas (código contábil)" example="51105007 · Alimentação" items={nat} onSave={(x) => api.saveNature(user, x)} />
      </div>
    </>
  );
}

function CodedList({ title, example, items, onSave }: { title: string; example: string; items: { id: string; code: string; name: string; active: boolean }[]; onSave: (x: { id?: string; code: string; name: string; active?: boolean }) => Promise<unknown> }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await onSave({ code, name });
      setCode('');
      setName('');
    } catch (err) {
      toast('error', errMsg(err));
    }
  };
  return (
    <Card>
      <CardHeader title={title} subtitle={`Ex.: ${example}`} />
      <form onSubmit={add} className="flex gap-2 border-b p-3">
        <Input aria-label="Código" className="w-28" placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input aria-label="Nome" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!code.trim() || !name.trim()}>Adicionar</Button>
      </form>
      <Table min={360}>
        <thead><tr><Th>Código</Th><Th>Nome</Th><Th /></tr></thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.id} className={x.active ? '' : 'text-muted-foreground'}>
              <Td className="tabular">{x.code}</Td>
              <Td>{x.name}{!x.active && ' (inativo)'}</Td>
              <Td right>
                <Button size="sm" variant="ghost" onClick={() => onSave({ ...x, active: !x.active }).catch((e) => toast('error', errMsg(e)))}>{x.active ? 'Desativar' : 'Ativar'}</Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

export function SuppliersAdmin() {
  const user = useUser();
  const toast = useToast();
  const { data: items = [] } = useQuery(() => api.listSuppliers(user, true), []);
  const [form, setForm] = useState<Partial<Supplier> | null>(null);
  const bank = form?.bankData ?? { bank: '', agency: '', account: '', pix: '' };
  const save = async () => {
    try {
      await api.saveSupplier(user, { ...form!, name: form!.name ?? '', bankData: bank });
      toast('success', 'Fornecedor salvo.');
      setForm(null);
    } catch (e) {
      toast('error', errMsg(e));
    }
  };
  return (
    <>
      <PageHeader title="Fornecedores" description="Os dados bancários preenchem a SC automaticamente." actions={<Button icon="plus" onClick={() => setForm({ active: true })}>Novo fornecedor</Button>} />
      <Card>
        <Table>
          <thead><tr><Th>Código</Th><Th>Fornecedor</Th><Th>Contato</Th><Th>Banco / PIX</Th><Th /></tr></thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className={s.active ? '' : 'text-muted-foreground'}>
                <Td className="tabular">{s.code}</Td>
                <Td className="font-medium">{s.name}</Td>
                <Td>{s.contact || '—'}</Td>
                <Td className="text-xs">{[s.bankData.bank, s.bankData.agency, s.bankData.account].filter(Boolean).join(' · ') || (s.bankData.pix ? `PIX ${s.bankData.pix}` : '—')}</Td>
                <Td right><Button size="sm" variant="ghost" onClick={() => setForm(JSON.parse(JSON.stringify(s)))}>Editar</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Editar fornecedor' : 'Novo fornecedor'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" className="sm:col-span-2"><Input id="sup-name" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Código"><Input id="sup-code" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Automático" /></Field>
            <Field label="Contato"><Input id="sup-contact" value={form.contact ?? ''} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
            <Field label="Banco"><Input value={bank.bank} onChange={(e) => setForm({ ...form, bankData: { ...bank, bank: e.target.value } })} /></Field>
            <Field label="Agência/DV"><Input value={bank.agency} onChange={(e) => setForm({ ...form, bankData: { ...bank, agency: e.target.value } })} /></Field>
            <Field label="Conta/DV"><Input value={bank.account} onChange={(e) => setForm({ ...form, bankData: { ...bank, account: e.target.value } })} /></Field>
            <Field label="Chave PIX"><Input value={bank.pix} onChange={(e) => setForm({ ...form, bankData: { ...bank, pix: e.target.value } })} /></Field>
            {form.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo</label>}
          </div>
        )}
      </Modal>
    </>
  );
}
