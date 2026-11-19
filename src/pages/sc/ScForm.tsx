import { useEffect, useMemo, useState } from 'react';
import { navigate, useQuery, useUser } from '@/app/session';
import { centsToInput, date, money, parseMoney } from '@/domain/format';
import { MAX_INSTALLMENTS, PAYMENT_METHODS, emptyContent, itemTotal, pickContent, scTotal, validateContent } from '@/domain/sc';
import type { Item, PurchaseRequest, ScContent } from '@/domain/types';
import { api, requestContext } from '@/services/api';
import { Icon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/overlay';
import { Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea, cx } from '@/components/ui/primitives';
import { errMsg, useLookups } from '../shared/lookups';
import { SignModal } from './SignModal';
import { SupplierPicker } from './SupplierPicker';

/** Campo de valor em R$: guarda centavos, mostra texto editável. */
function MoneyInput({ value, onChange, id, className }: { value: number; onChange: (cents: number) => void; id?: string; className?: string }) {
  const [text, setText] = useState(value ? centsToInput(value) : '');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value ? centsToInput(value) : '');
  }, [value, focused]);
  return (
    <Input
      id={id}
      inputMode="decimal"
      className={cx('text-right tabular', className)}
      value={text}
      placeholder="0,00"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const c = e.target.value.trim() === '' ? 0 : parseMoney(e.target.value);
        if (Number.isFinite(c)) onChange(c);
      }}
    />
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b last:border-b-0">
      <div className="flex items-center justify-between bg-brand px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
        {title}
        {aside}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function ScForm({ query }: { query: URLSearchParams }) {
  const user = useUser();
  const id = query.get('id');
  const { data: existing, error: loadError } = useQuery(async () => (id ? api.getRequest(user, id) : null), [id]);
  if (id && loadError) return <EmptyState title={loadError} />;
  if (id && !existing) return null;
  return <Editor key={id ?? 'nova'} existing={existing ?? null} />;
}

function Editor({ existing }: { existing: PurchaseRequest | null }) {
  const user = useUser();
  const toast = useToast();
  const lk = useLookups();
  // Gestor editando SC já enviada (fica registrada no histórico); senão é o solicitante editando o rascunho.
  const managerMode = !!existing && user.role === 'GESTOR' && (existing.status === 'AGUARDANDO_GESTOR' || existing.status === 'AGUARDANDO_DIRETORIA');
  const [c, setC] = useState<ScContent>(() => (existing ? JSON.parse(JSON.stringify(pickContent(existing))) : emptyContent()));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState<string | null>(null);
  const { data: budget } = useQuery(() => (user.sectorId ? api.getBudget(user, user.sectorId, (existing?.month ?? new Date().toISOString().slice(0, 7))) : Promise.resolve(null)), [existing?.id]);

  const set = <K extends keyof ScContent>(k: K, v: ScContent[K]) => setC((p) => ({ ...p, [k]: v }));
  const setItem = (i: number, patch: Partial<Item>) => set('items', c.items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const total = scTotal(c);
  const rateioSum = Math.round(c.apportionment.reduce((s, a) => s + (a.percent || 0), 0) * 100) / 100;
  const usedCc = useMemo(() => new Set(c.apportionment.map((a) => a.costCenterId)), [c.apportionment]);

  const save = async (): Promise<PurchaseRequest | null> => {
    setBusy(true);
    try {
      const sc = managerMode ? await api.managerEdit(user, existing!.id, c) : await api.saveDraft(user, existing?.id ?? null, c);
      return sc;
    } catch (e) {
      toast('error', errMsg(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    const sc = await save();
    if (sc) {
      toast('success', managerMode ? 'Alterações registradas no histórico da SC.' : `${sc.number} salva como rascunho.`);
      navigate(`/sc/ver?id=${sc.id}`);
    }
  };

  const submit = async () => {
    const errs = validateContent(c, { forSubmit: true });
    setErrors(errs);
    if (errs.length) return window.scrollTo({ top: 0, behavior: 'smooth' });
    const sc = await save();
    if (!sc) return;
    if (user.role === 'GESTOR') return setSigning(sc.id);
    try {
      await api.submit(user, sc.id, null, requestContext());
      toast('success', `${sc.number} enviada para o gestor.`);
      navigate(`/sc/ver?id=${sc.id}`);
    } catch (e) {
      toast('error', errMsg(e));
      navigate(`/sc/ver?id=${sc.id}`);
    }
  };

  const title = managerMode ? `Editar ${existing!.number}` : existing ? `${existing.number}` : 'Nova Solicitação de Compras';

  return (
    <>
      <PageHeader
        title={title}
        description={
          managerMode
            ? 'As alterações ficam registradas (campo, valor anterior e novo) e o solicitante é avisado.'
            : existing?.status === 'DEVOLVIDA'
              ? 'Ajuste a solicitação e envie novamente.'
              : 'Preencha conforme o modelo da Solicitação de Compras.'
        }
      />
      {existing?.returnReason && existing.status === 'DEVOLVIDA' && (
        <div className="mb-4 rounded border border-[#e3b4b4] bg-[#fbeeee] px-4 py-3 text-sm text-[#7d1f1f]">
          <strong>Devolvida para ajuste:</strong> {existing.returnReason}
        </div>
      )}
      {managerMode && existing?.status === 'AGUARDANDO_DIRETORIA' && (
        <div className="mb-4 rounded border border-[#ecd9a8] bg-[#fbf3e1] px-4 py-3 text-sm text-[#6b4700]">
          Esta SC já está com a Diretoria. Se você alterar algo, a sua Autorização de Compra perde a validade e a SC volta para a sua aprovação.
        </div>
      )}
      {errors.length > 0 && (
        <div className="mb-4 rounded border border-[#e3b4b4] bg-[#fbeeee] px-4 py-3 text-sm text-[#7d1f1f]">
          <strong>Corrija antes de enviar:</strong>
          <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <Card className="overflow-hidden">
        <Section title="Cabeçalho">
          <div className="grid gap-3 md:grid-cols-[1fr_120px_140px]">
            <Field label="Fornecedor">
              <SupplierPicker
                value={c.supplierName}
                onSelect={(s) =>
                  setC((p) => ({
                    ...p,
                    supplierId: s.id,
                    supplierName: s.name,
                    supplierCode: s.code,
                    contact: p.contact || s.contact,
                    bankData: p.bankData.bank || p.bankData.pix ? p.bankData : { ...s.bankData },
                  }))
                }
              />
            </Field>
            <Field label="Código"><Input value={c.supplierCode} readOnly disabled /></Field>
            <Field label="Data"><Input value={existing ? date(existing.date + 'T12:00') : new Date().toLocaleDateString('pt-BR')} readOnly disabled /></Field>
          </div>
          <Field label="Contato" className="mt-3">
            <Input id="sc-contact" value={c.contact} onChange={(e) => set('contact', e.target.value)} placeholder="Nome e telefone de quem atende" />
          </Field>
        </Section>

        <div className="grid border-b md:grid-cols-[200px_1fr_1fr] md:divide-x">
          <div>
            <div className="bg-brand px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">Forma de pagamento</div>
            <div className="space-y-1.5 p-4">
              {PAYMENT_METHODS.map((m) => (
                <label key={m.value} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="pay" checked={c.paymentMethod === m.value} onChange={() => set('paymentMethod', m.value)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
          <div className="border-t md:border-t-0">
            <div className="flex items-center justify-between bg-brand px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
              Rateio C. C.
              <span className={cx('tabular normal-case', rateioSum !== 100 && c.apportionment.length ? 'text-[#ffd59a]' : '')}>Soma: {rateioSum.toLocaleString('pt-BR')}%</span>
            </div>
            <div className="space-y-2 p-4">
              {c.apportionment.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <Select aria-label={`Centro de custo ${i + 1}`} value={a.costCenterId} onChange={(e) => set('apportionment', c.apportionment.map((x, j) => (j === i ? { ...x, costCenterId: e.target.value } : x)))}>
                    <option value="">Centro de custo…</option>
                    {lk.costCenters.filter((cc) => cc.active && (cc.id === a.costCenterId || !usedCc.has(cc.id))).map((cc) => (
                      <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Percentual ${i + 1}`}
                    className="w-20 text-right tabular"
                    inputMode="decimal"
                    value={a.percent ? String(a.percent).replace('.', ',') : ''}
                    placeholder="%"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value.replace(',', '.'));
                      set('apportionment', c.apportionment.map((x, j) => (j === i ? { ...x, percent: Number.isFinite(v) ? Math.round(v * 100) / 100 : 0 } : x)));
                    }}
                  />
                  <button className="px-1 text-muted-foreground hover:text-[#a12626]" aria-label="Remover linha" onClick={() => set('apportionment', c.apportionment.filter((_, j) => j !== i))}>
                    <Icon name="x" size={15} />
                  </button>
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                icon="plus"
                onClick={() => set('apportionment', [...c.apportionment, { costCenterId: '', percent: c.apportionment.length ? Math.max(0, Math.round((100 - rateioSum) * 100) / 100) : 100 }])}
              >
                Adicionar centro de custo
              </Button>
            </div>
          </div>
          <div className="border-t md:border-t-0">
            <div className="bg-brand px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">Parcelas</div>
            <div className="p-4">
              <Field label="Quantidade de parcelas">
                <Select
                  value={c.installments.length}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    set('installments', Array.from({ length: n }, (_, i) => c.installments[i] ?? { dueDate: '' }));
                  }}
                >
                  <option value={0}>Sem parcelas / à vista</option>
                  {Array.from({ length: MAX_INSTALLMENTS }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </Select>
              </Field>
              {c.installments.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {c.installments.map((inst, i) => (
                    <Field key={i} label={`${i + 1}ª parcela`}>
                      <Input type="date" value={inst.dueDate} onChange={(e) => set('installments', c.installments.map((x, j) => (j === i ? { dueDate: e.target.value } : x)))} />
                    </Field>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <Section title="Dados da nota fiscal">
          <Input id="sc-invoice" value={c.invoiceInfo} onChange={(e) => set('invoiceInfo', e.target.value)} placeholder="Número, série, chave de acesso (se já houver)" />
        </Section>
        <Section title="Natureza da compra">
          <Select id="sc-nature" value={c.natureId ?? ''} onChange={(e) => set('natureId', e.target.value || null)}>
            <option value="">Selecione o código contábil…</option>
            {lk.natures.filter((n) => n.active || n.id === c.natureId).map((n) => <option key={n.id} value={n.id}>{n.code} - {n.name}</option>)}
          </Select>
        </Section>

        <section className="border-b">
          <div className="bg-brand px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">Itens</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b bg-muted/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="w-24 px-2 py-2 text-right">Quantidade</th>
                  <th className="w-32 px-2 py-2 text-right">Valor und</th>
                  <th className="w-28 px-2 py-2 text-right">Descontos</th>
                  <th className="w-28 px-2 py-2 text-right">Acréscimos</th>
                  <th className="w-32 px-3 py-2 text-right">Valor total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {c.items.map((it, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-3 py-1.5"><Input aria-label={`Descrição do item ${i + 1}`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></td>
                    <td className="px-2 py-1.5">
                      <Input aria-label={`Quantidade do item ${i + 1}`} className="text-right tabular" inputMode="decimal" value={it.quantity ? String(it.quantity).replace('.', ',') : ''}
                        onChange={(e) => { const v = parseFloat(e.target.value.replace(',', '.')); setItem(i, { quantity: Number.isFinite(v) ? v : 0 }); }} />
                    </td>
                    <td className="px-2 py-1.5"><MoneyInput value={it.unitPrice} onChange={(v) => setItem(i, { unitPrice: v })} /></td>
                    <td className="px-2 py-1.5"><MoneyInput value={it.discount} onChange={(v) => setItem(i, { discount: v })} /></td>
                    <td className="px-2 py-1.5"><MoneyInput value={it.surcharge} onChange={(v) => setItem(i, { surcharge: v })} /></td>
                    <td className="px-3 py-1.5 text-right font-medium tabular">{money(itemTotal(it))}</td>
                    <td className="pr-2">
                      {c.items.length > 1 && (
                        <button className="text-muted-foreground hover:text-[#a12626]" aria-label="Remover item" onClick={() => set('items', c.items.filter((_, j) => j !== i))}>
                          <Icon name="x" size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <Button size="sm" variant="ghost" icon="plus" onClick={() => set('items', [...c.items, { description: '', quantity: 1, unitPrice: 0, discount: 0, surcharge: 0 }])}>
              Adicionar item
            </Button>
            <span className="text-xs text-muted-foreground">Valor total = (Quantidade × Valor und) − Descontos + Acréscimos</span>
          </div>
        </section>

        <Section title="Dados bancários">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Banco"><Input value={c.bankData.bank} onChange={(e) => set('bankData', { ...c.bankData, bank: e.target.value })} /></Field>
            <Field label="Agência/DV"><Input value={c.bankData.agency} onChange={(e) => set('bankData', { ...c.bankData, agency: e.target.value })} /></Field>
            <Field label="Conta/DV"><Input value={c.bankData.account} onChange={(e) => set('bankData', { ...c.bankData, account: e.target.value })} /></Field>
            <Field label="Chave PIX"><Input value={c.bankData.pix} onChange={(e) => set('bankData', { ...c.bankData, pix: e.target.value })} /></Field>
          </div>
        </Section>

        <Section title="Observações / justificativa">
          <Textarea id="sc-notes" value={c.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Para que serve a compra (não sai no impresso)" />
        </Section>

        <div className="flex items-center justify-between bg-brand px-4 py-2.5 text-white">
          <span className="text-sm font-semibold uppercase tracking-wide">Total geral</span>
          <span className="tabular text-lg font-semibold">{money(total)}</span>
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {budget && (
            <>
              Saldo disponível do setor: <strong className={cx('tabular', budget.available < total ? 'text-[#a12626]' : 'text-foreground')}>{money(budget.available)}</strong>
              {budget.available < total && <span className="text-[#a12626]"> · faltam {money(total - Math.max(0, budget.available))}</span>}
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => history.back()}>Voltar</Button>
          {managerMode ? (
            <Button onClick={saveDraft} disabled={busy}>Salvar alterações</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={saveDraft} disabled={busy}>Salvar rascunho</Button>
              <Button onClick={submit} disabled={busy}>{user.role === 'GESTOR' ? 'Assinar e enviar à diretoria' : 'Enviar para o gestor'}</Button>
            </>
          )}
        </div>
      </div>

      <SignModal
        open={!!signing}
        onClose={() => setSigning(null)}
        slotLabel="Autorização de Compra"
        number={existing?.number ?? 'Nova SC'}
        total={total}
        onConfirm={async (password) => {
          const sc = await api.submit(user, signing!, password, requestContext());
          toast('success', `${sc.number} assinada e enviada à diretoria.`);
          navigate(`/sc/ver?id=${sc.id}`);
        }}
      />
    </>
  );
}
