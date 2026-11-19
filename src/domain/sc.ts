import { money } from './format';
import type { Item, PaymentMethod, PurchaseRequest, Role, ScContent, ScStatus } from './types';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'BOLETO_PARCELADO', label: 'Boleto parcelado' },
  { value: 'PIX', label: 'PIX' },
  { value: 'TRANSFERENCIA', label: 'Transferência' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'OUTROS', label: 'Outros' },
];
export const paymentLabel = (m: PaymentMethod) => PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m;

export const MAX_INSTALLMENTS = 8;

export const ROLE_LABEL: Record<Role, string> = {
  FUNCIONARIO: 'Funcionário',
  GESTOR: 'Gestor',
  DIRETORIA: 'Diretoria',
  FINANCEIRO: 'Financeiro',
  ADMIN: 'Admin',
};

export const SC_STATUS: Record<ScStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'good' | 'critical' }> = {
  RASCUNHO: { label: 'Rascunho', tone: 'neutral' },
  AGUARDANDO_GESTOR: { label: 'Aguardando gestor', tone: 'warning' },
  DEVOLVIDA: { label: 'Devolvida para ajuste', tone: 'critical' },
  AGUARDANDO_DIRETORIA: { label: 'Aguardando diretoria', tone: 'warning' },
  AGUARDANDO_NF: { label: 'Aprovada · aguardando NF', tone: 'info' },
  ENVIADA_FINANCEIRO: { label: 'Enviada ao financeiro', tone: 'info' },
  PAGA: { label: 'Paga', tone: 'good' },
  REPROVADA: { label: 'Reprovada', tone: 'critical' },
  CANCELADA: { label: 'Cancelada', tone: 'neutral' },
};

/** Etapas do fluxo principal, na ordem. */
export const FLOW: { status: ScStatus[]; label: string }[] = [
  { status: ['RASCUNHO', 'DEVOLVIDA'], label: 'Rascunho' },
  { status: ['AGUARDANDO_GESTOR'], label: 'Aguardando gestor' },
  { status: ['AGUARDANDO_DIRETORIA'], label: 'Aguardando diretoria' },
  { status: ['AGUARDANDO_NF'], label: 'Aprovada / NF' },
  { status: ['ENVIADA_FINANCEIRO'], label: 'Financeiro' },
  { status: ['PAGA'], label: 'Paga' },
];

/** Valor total do item = (Quantidade × Valor unitário) − Descontos + Acréscimos. */
export const itemTotal = (i: Item) => Math.round(i.quantity * i.unitPrice) - i.discount + i.surcharge;
export const scTotal = (c: Pick<ScContent, 'items'>) => c.items.reduce((s, i) => s + itemTotal(i), 0);

/** Status em que o valor está reservado no saldo do setor. */
export const RESERVED_STATUSES: ScStatus[] = ['AGUARDANDO_DIRETORIA'];
/** Status em que o valor está consumido. */
export const CONSUMED_STATUSES: ScStatus[] = ['AGUARDANDO_NF', 'ENVIADA_FINANCEIRO', 'PAGA'];
/** Status em que ainda é possível cancelar. */
export const CANCELLABLE: ScStatus[] = ['RASCUNHO', 'DEVOLVIDA', 'AGUARDANDO_GESTOR', 'AGUARDANDO_DIRETORIA'];

export function emptyContent(): ScContent {
  return {
    supplierId: null,
    supplierName: '',
    supplierCode: '',
    contact: '',
    paymentMethod: 'BOLETO',
    installments: [],
    apportionment: [],
    invoiceInfo: '',
    natureId: null,
    items: [{ description: '', quantity: 1, unitPrice: 0, discount: 0, surcharge: 0 }],
    bankData: { bank: '', agency: '', account: '', pix: '' },
    notes: '',
  };
}

export const CONTENT_KEYS: (keyof ScContent)[] = [
  'supplierId', 'supplierName', 'supplierCode', 'contact', 'paymentMethod', 'installments',
  'apportionment', 'invoiceInfo', 'natureId', 'items', 'bankData', 'notes',
];

export function pickContent(sc: ScContent): ScContent {
  const out = {} as Record<string, unknown>;
  for (const k of CONTENT_KEYS) out[k] = sc[k];
  return out as unknown as ScContent;
}

/** JSON com chaves ordenadas: mesma entrada → mesmo texto → mesmo hash. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash do conteúdo assinado: número + setor + campos do formulário. */
export const contentHash = (sc: PurchaseRequest) =>
  sha256(canonical({ number: sc.number, sectorId: sc.sectorId, requesterId: sc.requesterId, date: sc.date, ...pickContent(sc) }));

/** Validação do formulário. Retorna lista de erros (vazia = ok). */
export function validateContent(c: ScContent, opts: { forSubmit: boolean }): string[] {
  const errors: string[] = [];
  if (!opts.forSubmit) return errors;
  if (!c.supplierName.trim()) errors.push('Informe o fornecedor.');
  if (!c.natureId) errors.push('Informe a natureza da compra.');
  const items = c.items.filter((i) => i.description.trim());
  if (!items.length) errors.push('Inclua ao menos um item com descrição.');
  for (const [n, i] of c.items.entries()) {
    if (!i.description.trim() && (i.unitPrice || i.discount || i.surcharge)) errors.push(`Item ${n + 1}: falta a descrição.`);
    if (i.description.trim() && !(i.quantity > 0)) errors.push(`Item ${n + 1}: quantidade deve ser maior que zero.`);
    if (i.description.trim() && itemTotal(i) < 0) errors.push(`Item ${n + 1}: total negativo.`);
  }
  if (scTotal(c) <= 0) errors.push('O total geral deve ser maior que zero.');
  if (!c.apportionment.length) errors.push('Informe o rateio por centro de custo.');
  const sum = Math.round(c.apportionment.reduce((s, a) => s + a.percent, 0) * 100);
  if (c.apportionment.length && sum !== 10000) errors.push(`A soma do rateio deve dar 100% (está em ${(sum / 100).toLocaleString('pt-BR')}%).`);
  if (c.apportionment.some((a) => !a.costCenterId)) errors.push('Selecione o centro de custo em todas as linhas do rateio.');
  if (new Set(c.apportionment.map((a) => a.costCenterId)).size !== c.apportionment.length) errors.push('Centro de custo repetido no rateio.');
  if (c.installments.length > MAX_INSTALLMENTS) errors.push(`Máximo de ${MAX_INSTALLMENTS} parcelas.`);
  if (c.paymentMethod === 'BOLETO_PARCELADO' && c.installments.length < 2) errors.push('Boleto parcelado precisa de ao menos 2 parcelas.');
  if (c.installments.some((i) => !/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate))) errors.push('Informe a data de vencimento de cada parcela.');
  if (c.paymentMethod === 'PIX' && !c.bankData.pix.trim()) errors.push('Informe a chave PIX.');
  if (c.paymentMethod === 'TRANSFERENCIA' && (!c.bankData.bank.trim() || !c.bankData.account.trim()))
    errors.push('Informe banco e conta para transferência.');
  return errors;
}

/** Descreve as diferenças campo a campo entre duas versões (para o histórico do gestor). */
export function diffContent(
  a: ScContent,
  b: ScContent,
  names: { costCenter: (id: string) => string; nature: (id: string | null) => string },
): { field: string; before: string; after: string }[] {
  const out: { field: string; before: string; after: string }[] = [];
  const push = (field: string, before: string, after: string) => before !== after && out.push({ field, before: before || '—', after: after || '—' });
  push('Fornecedor', a.supplierName, b.supplierName);
  push('Código do fornecedor', a.supplierCode, b.supplierCode);
  push('Contato', a.contact, b.contact);
  push('Forma de pagamento', paymentLabel(a.paymentMethod), paymentLabel(b.paymentMethod));
  push('Parcelas', a.installments.map((i) => i.dueDate).join(', '), b.installments.map((i) => i.dueDate).join(', '));
  const rat = (c: ScContent) => c.apportionment.map((r) => `${names.costCenter(r.costCenterId)} ${r.percent}%`).join('; ');
  push('Rateio', rat(a), rat(b));
  push('Dados da nota fiscal', a.invoiceInfo, b.invoiceInfo);
  push('Natureza', names.nature(a.natureId), names.nature(b.natureId));
  const max = Math.max(a.items.length, b.items.length);
  for (let i = 0; i < max; i++) {
    const x = a.items[i];
    const y = b.items[i];
    const fmt = (it?: Item) =>
      it ? `${it.description} · ${it.quantity} × ${money(it.unitPrice)}${it.discount ? ` − ${money(it.discount)}` : ''}${it.surcharge ? ` + ${money(it.surcharge)}` : ''} = ${money(itemTotal(it))}` : '';
    push(`Item ${i + 1}`, fmt(x), fmt(y));
  }
  push('Total geral', money(scTotal(a)), money(scTotal(b)));
  const bank = (c: ScContent) => [c.bankData.bank, c.bankData.agency, c.bankData.account, c.bankData.pix && `PIX ${c.bankData.pix}`].filter(Boolean).join(' · ');
  push('Dados bancários', bank(a), bank(b));
  push('Observações', a.notes, b.notes);
  return out;
}

export const scNumber = (year: number, seq: number) => `SC-${year}-${String(seq).padStart(4, '0')}`;
