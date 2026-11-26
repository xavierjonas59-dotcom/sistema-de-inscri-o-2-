import { currentMonth, shiftMonth } from '@/domain/format';
import { emptyContent, scNumber } from '@/domain/sc';
import contabil from '@/data/contabil.json';
import type { AccountBudget, Attachment, CostCenter, Item, LedgerAccount, Nature, PurchaseRequest, ScContent, ScStatus, Sector, Supplier, TimelineEntry, UserRecord } from '@/domain/types';
import { DB_VERSION, hashPassword, type Database } from './LocalDataService';

/** Senha inicial de todos os usuários (também usada para assinar). Trocar no primeiro acesso real. */
export const DEMO_PASSWORD = 'amc123';

export const DEMO_USERS = [
  { email: 'funcionario.logistica@amcomercial.demo', label: 'Funcionário (exemplo) · Logística' },
  { email: 'silvio@amcomercial.com.br', label: 'Silvio Crispim · Gestor Logística' },
  { email: 'victor@amcomercial.com.br', label: 'Victor Chroniaris · Diretor Logística (até R$ 10 mil)' },
  { email: 'manoel@amcomercial.com.br', label: 'Manoel Chroniaris · Diretor Geral' },
  { email: 'ana@amcomercial.com.br', label: 'Ana Katarina · Diretora Financeira' },
  { email: 'contas.pagar@amcomercial.demo', label: 'Financeiro (Contas a Pagar)' },
  { email: 'admin@amcomercial.demo', label: 'Admin' },
];

const LIMIT_10K = 1_000_000;

/** PDF mínimo válido para os anexos de exemplo. */
export function demoPdf(title: string, name = 'documento.pdf', kind = 'Documento'): Pick<Attachment, 'name' | 'mimeType' | 'size' | 'url'> {
  const clean = (s: string) => s.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '');
  const lines = [`${clean(kind)} - EXEMPLO (modo demonstracao)`, clean(title)];
  const stream = lines.map((l, i) => `BT /F1 ${i ? 12 : 16} Tf 60 ${770 - i * 28} Td (${l}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (pdf += `${String(o).padStart(10, '0')} 00000 n \n`));
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return { name, mimeType: 'application/pdf', size: pdf.length, url: `data:application/pdf;base64,${btoa(pdf)}` };
}

export async function buildSeed(now: Date): Promise<Database> {
  const pw = await hashPassword(DEMO_PASSWORD);
  // Limites mensais de exemplo: o Admin ajusta em "Setores e limites".
  const sectors: Sector[] = [
    { id: 'sec-adm', name: 'Administrativo', monthlyLimit: 2_500_000, active: true },
    { id: 'sec-log', name: 'Logística', monthlyLimit: 3_200_000, active: true },
    { id: 'sec-ti', name: 'T.I', monthlyLimit: 1_500_000, active: true },
    { id: 'sec-com', name: 'Comercial', monthlyLimit: 2_800_000, active: true },
    { id: 'sec-fin', name: 'Financeiro', monthlyLimit: 1_800_000, active: true },
  ];
  // 220101 vem da planilha; os demais são exemplos para o Admin ajustar ao plano de contas.
  const costCenters: CostCenter[] = [
    ['220101', 'ADMINISTRATIVO'],
    ['220102', 'LOGÍSTICA'],
    ['220103', 'T.I'],
    ['220104', 'COMERCIAL'],
    ['220105', 'FINANCEIRO'],
  ].map(([code, name], i) => ({ id: `cc-${i + 1}`, code, name, active: true }));
  // Plano de contas e naturezas reais (planilhas CTBA020 e Naturezas). Natureza sem conta ligada fica inativa.
  const accounts: LedgerAccount[] = contabil.accounts.map((a) => ({ id: `acc-${a.code}`, code: a.code, name: a.name, group: a.group, active: true }));
  const natures: Nature[] = contabil.natures.map((n) => ({
    id: `nat-${n.code}`,
    code: n.code,
    name: n.name,
    active: !!n.account,
    accountId: n.account ? `acc-${n.account}` : null,
  }));
  const bank = (b = '', a = '', c = '', p = '') => ({ bank: b, agency: a, account: c, pix: p });
  const suppliers: Supplier[] = [
    { id: 'sup-1', code: '1001', name: 'Panificadora Bom Trigo (exemplo)', contact: '(84) 3333-1001', bankData: bank('', '', '', '12.345.678/0001-01'), active: true },
    { id: 'sup-2', code: '1002', name: 'TransNordeste Fretes (exemplo)', contact: '(84) 3333-1002', bankData: bank('Banco do Brasil', '1234-5', '98765-0'), active: true },
    { id: 'sup-3', code: '1003', name: 'Oficina Mecânica (exemplo)', contact: '(84) 3333-1003', bankData: bank('Caixa', '0456-1', '11223-4'), active: true },
    { id: 'sup-4', code: '1004', name: 'Papelaria Central (exemplo)', contact: '(84) 3333-1004', bankData: bank('Itaú', '3030', '45678-9'), active: true },
    { id: 'sup-5', code: '1005', name: 'InfoTech Suprimentos (exemplo)', contact: '(84) 3333-1005', bankData: bank('', '', '', 'contato@exemplo.com'), active: true },
    { id: 'sup-6', code: '1006', name: 'Posto Avenida (exemplo)', contact: '(84) 3333-1006', bankData: bank('', '', '', '23.456.789/0001-02'), active: true },
    { id: 'sup-7', code: '1007', name: 'Hotel Central (exemplo)', contact: '(84) 3333-1007', bankData: bank('Bradesco', '0101', '22334-5'), active: true },
    { id: 'sup-8', code: '1008', name: 'Escritório Contábil (exemplo)', contact: '(84) 3333-1008', bankData: bank('Itaú', '0202', '55667-8'), active: true },
  ];

  const user = (id: string, name: string, email: string, role: UserRecord['role'], sectorId: string | null, cargo: string, paymentLimit: number | null = null): UserRecord => ({
    id, name, email, role, sectorId, cargo, paymentLimit, active: true, passwordHash: pw, signature: null,
  });
  const users: UserRecord[] = [
    // Diretoria (e-mails a confirmar)
    { ...user('dir-manoel', 'Manoel Chroniaris', 'manoel@amcomercial.com.br', 'DIRETORIA', null, 'Diretor Geral'), budgetEditor: true },
    { ...user('dir-antonio', 'Antônio Chroniaris', 'antonio@amcomercial.com.br', 'DIRETORIA', null, 'Diretor Geral'), budgetEditor: true },
    { ...user('dir-ana', 'Ana Katarina', 'ana@amcomercial.com.br', 'DIRETORIA', 'sec-fin', 'Diretora Financeira'), budgetEditor: true },
    user('dir-felipe', 'Felipe Chroniaris', 'felipe@amcomercial.com.br', 'DIRETORIA', 'sec-com', 'Diretor Comercial', LIMIT_10K),
    user('dir-victor', 'Victor Chroniaris', 'victor@amcomercial.com.br', 'DIRETORIA', 'sec-log', 'Diretor de Logística', LIMIT_10K),
    // Gestores
    user('ges-adriano', 'Adriano Goldman', 'adm.gerencia@amcomercial.com.br', 'GESTOR', 'sec-adm', 'Gestor Administrativo'),
    user('ges-silvio', 'Silvio Crispim', 'silvio@amcomercial.com.br', 'GESTOR', 'sec-log', 'Gestor de Logística'),
    user('ges-siliel', 'Siliel Inácio', 'siliel@amcomercial.com.br', 'GESTOR', 'sec-ti', 'Gestor de T.I'),
    user('ges-stwart', 'Stwart Lima', 'vendas.revenda@amcomercial.com.br', 'GESTOR', 'sec-com', 'Gestor Comercial'),
    // Exemplos para testar (substituir pelos usuários reais)
    user('fun-log', 'Funcionário Logística (exemplo)', 'funcionario.logistica@amcomercial.demo', 'FUNCIONARIO', 'sec-log', 'Assistente'),
    user('fun-com', 'Funcionário Comercial (exemplo)', 'funcionario.comercial@amcomercial.demo', 'FUNCIONARIO', 'sec-com', 'Vendedor'),
    user('fin-cp', 'Contas a Pagar (exemplo)', 'contas.pagar@amcomercial.demo', 'FINANCEIRO', null, 'Contas a Pagar'),
    user('adm-sys', 'Administrador do sistema', 'admin@amcomercial.demo', 'ADMIN', null, 'Administrador'),
  ];
  const U = Object.fromEntries(users.map((u) => [u.id, u]));

  const m0 = currentMonth(now);
  const m1 = shiftMonth(m0, -1);
  const at = (month: string, day: number, hour = 9) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1, day, hour);
    return (d > now ? now : d).toISOString();
  };
  const year = now.getFullYear();
  let seq = 0;
  const item = (description: string, quantity: number, unitPrice: number, discount = 0): Item => ({ description, quantity, unitPrice, discount, surcharge: 0 });
  const cc = (code: string) => costCenters.find((c) => c.code === code)!.id;
  const nat = (code: string) => natures.find((n) => n.code === code)!.id;

  interface Spec {
    sector: string;
    requester: string;
    month: string;
    day: number;
    supplier: string;
    natureCode: string;
    ccCode: string;
    items: Item[];
    payment?: ScContent['paymentMethod'];
    status: ScStatus;
    reason?: string;
  }
  /**
   * SCs de exemplo. As já pagas ficam marcadas como "registro de exemplo" e não têm assinaturas,
   * para não existir assinatura simulada em nome de pessoas reais.
   */
  const build = (s: Spec): PurchaseRequest => {
    const sup = suppliers.find((x) => x.name.startsWith(s.supplier))!;
    const req = U[s.requester];
    const date = at(s.month, s.day).slice(0, 10);
    const t = (who: UserRecord, action: string, h: number, note?: string): TimelineEntry => ({ at: at(s.month, s.day, h), userId: who.id, userName: who.name, action, note });
    const sc: PurchaseRequest = {
      ...emptyContent(),
      supplierId: sup.id,
      supplierName: sup.name,
      supplierCode: sup.code,
      contact: sup.contact,
      paymentMethod: s.payment ?? 'BOLETO',
      apportionment: [{ costCenterId: cc(s.ccCode), percent: 100 }],
      natureId: nat(s.natureCode),
      items: s.items,
      bankData: { ...sup.bankData },
      id: `sc-${seq + 1}`,
      number: scNumber(year, ++seq),
      sectorId: s.sector,
      requesterId: req.id,
      requesterName: req.name,
      date,
      month: s.month,
      createdAt: at(s.month, s.day, 8),
      status: s.status,
      assignedDirectorId: null,
      assignedDirectorName: null,
      signatures: {},
      attachments: [],
      changes: [],
      timeline: [t(req, 'Criou a solicitação', 8)],
      messages: [],
    };
    if (s.status === 'RASCUNHO') return sc;
    sc.submittedAt = at(s.month, s.day, 9);
    sc.timeline.push(t(req, 'Enviou para o gestor', 9));
    if (s.status === 'DEVOLVIDA') {
      sc.returnReason = s.reason;
      sc.timeline.push(t(U['ges-silvio'], 'Devolveu para ajuste', 11, s.reason));
    }
    if (s.status === 'PAGA') {
      sc.timeline.push({ at: at(s.month, s.day, 10), userId: 'adm-sys', userName: 'Administrador do sistema', action: 'Registro de exemplo (aprovado e pago fora do sistema)' });
      sc.attachments.push({ id: `${sc.id}-nf`, kind: 'NF', ...demoPdf(`${sc.number}`, `NF-${sc.number}.pdf`, 'Nota fiscal'), uploadedBy: req.id, uploadedByName: req.name, uploadedAt: at(s.month, s.day, 10) });
      sc.paidAt = date;
    }
    return sc;
  };

  const specs: Spec[] = [
    // Histórico de exemplo (6 meses antes) para o gráfico "Gastos por mês"
    ...[11, 10, 9, 8, 7, 6, 5, 4, 3, 2].flatMap((back): Spec[] => {
      const m = shiftMonth(m0, -back);
      const f = 0.85 + 0.25 * Math.sin(back * 1.7) + 0.1 * Math.cos(back * 0.9);
      return [
        // Fretes e material de campanha saem toda semana (o total do mês continua o mesmo).
        ...[4, 11, 18, 25].map((day, w) => ({ sector: 'sec-log', requester: 'fun-log', month: m, day: day + (w % 2), supplier: 'TransNordeste', natureCode: '51102024', ccCode: '220102', items: [item('Fretes da semana', 1, Math.round((1_100_000 * f * (0.8 + 0.13 * w)) / 4.78))], payment: 'TRANSFERENCIA' as const, status: 'PAGA' as ScStatus })),
        ...[9, 23].map((day) => ({ sector: 'sec-log', requester: 'fun-log', month: m, day, supplier: 'Oficina', natureCode: '51102041', ccCode: '220102', items: [item('Manutenção da frota', 1, Math.round(260_000 * (2.1 - f)))], status: 'PAGA' as ScStatus })),
        ...[7, 21].map((day, w) => ({ sector: 'sec-com', requester: 'fun-com', month: m, day, supplier: 'Papelaria', natureCode: '51102014', ccCode: '220104', items: [item('Material de campanha', 1, Math.round(320_000 * f * (w ? 1.1 : 0.9)))], payment: 'PIX' as const, status: 'PAGA' as ScStatus })),
        { sector: 'sec-adm', requester: 'ges-adriano', month: m, day: 3, supplier: 'Papelaria', natureCode: '51102037', ccCode: '220101', items: [item('Material de escritório', 1, Math.round(210_000 * f))], status: 'PAGA' },
        { sector: 'sec-ti', requester: 'ges-siliel', month: m, day: 12, supplier: 'InfoTech', natureCode: '51102007', ccCode: '220103', items: [item('Licenças e periféricos', 1, Math.round(380_000 * (1.9 - f)))], payment: 'PIX', status: 'PAGA' },
      ];
    }),
    // Mês anterior (consumo de exemplo)
    { sector: 'sec-log', requester: 'fun-log', month: m1, day: 6, supplier: 'TransNordeste', natureCode: '51102024', ccCode: '220102', items: [item('Frete de reposição de estoque', 1, 480_000)], payment: 'TRANSFERENCIA', status: 'PAGA' },
    { sector: 'sec-com', requester: 'fun-com', month: m1, day: 9, supplier: 'Papelaria', natureCode: '51102014', ccCode: '220104', items: [item('Folders promocionais', 2000, 95)], status: 'PAGA' },
    // Mês atual
    { sector: 'sec-log', requester: 'fun-log', month: m0, day: 3, supplier: 'Panificadora', natureCode: '51102021', ccCode: '220102', items: [item('PÃES', 84, 1_800)], payment: 'PIX', status: 'PAGA' },
    { sector: 'sec-log', requester: 'fun-log', month: m0, day: 5, supplier: 'Oficina', natureCode: '51102041', ccCode: '220102', items: [item('Revisão do caminhão', 1, 320_000)], status: 'PAGA' },
    ...[2, 9, 16, 23].map((day, w) => ({ sector: 'sec-com', requester: 'fun-com', month: m0, day, supplier: 'Papelaria', natureCode: '51102014', ccCode: '220104', items: [item('Material de campanha', 1, [140_000, 210_000, 120_000, 180_000][w])], payment: 'PIX' as const, status: 'PAGA' as ScStatus })),
    { sector: 'sec-adm', requester: 'ges-adriano', month: m0, day: 4, supplier: 'Papelaria', natureCode: '51102037', ccCode: '220101', items: [item('Material de escritório', 1, 186_000)], status: 'PAGA' },
    { sector: 'sec-log', requester: 'fun-log', month: m0, day: 12, supplier: 'TransNordeste', natureCode: '51102024', ccCode: '220102', items: [item('Frete emergencial de paletes', 1, 450_000)], payment: 'TRANSFERENCIA', status: 'AGUARDANDO_GESTOR' },
    { sector: 'sec-log', requester: 'fun-log', month: m0, day: 13, supplier: 'Oficina', natureCode: '51102041', ccCode: '220102', items: [item('Troca de pneus do caminhão', 6, 210_000, 60_000)], status: 'AGUARDANDO_GESTOR' },
    { sector: 'sec-log', requester: 'fun-log', month: m0, day: 11, supplier: 'Panificadora', natureCode: '51102021', ccCode: '220102', items: [item('Lanche turno noturno', 30, 1_500)], payment: 'PIX', status: 'DEVOLVIDA' as ScStatus, reason: 'Anexar o orçamento da padaria.' },
    { sector: 'sec-com', requester: 'fun-com', month: m0, day: 10, supplier: 'Papelaria', natureCode: '51102014', ccCode: '220104', items: [item('Banners para feira', 2, 85_000)], payment: 'PIX', status: 'AGUARDANDO_GESTOR' },
  ];
  // Pequenas compras do dia a dia (já pagas) espalhadas pelos últimos 12 meses, dentro do orçamento de cada conta.
  const daily: [string, string, string, string, string, string, number][] = [
    // setor, solicitante, fornecedor, natureza, centro de custo, item, valor médio (centavos)
    ['sec-log', 'fun-log', 'Posto', '51102030', '220102', 'Abastecimento da frota', 30_000],
    ['sec-adm', 'ges-adriano', 'Papelaria', '51102037', '220101', 'Suprimentos de escritório', 18_000],
    ['sec-ti', 'ges-siliel', 'InfoTech', '51102025', '220103', 'Internet e dados móveis', 16_000],
    ['sec-com', 'fun-com', 'Hotel', '51102003', '220104', 'Hospedagem de visita a cliente', 52_000],
    ['sec-fin', 'dir-ana', 'Escritório', '51102017', '220105', 'Serviço de apoio contábil', 38_000],
  ];
  let rnd = 7;
  const rand = () => ((rnd = (rnd * 48271) % 2147483647) / 2147483647);
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const dailySpecs: Spec[] = [];
  for (let d = new Date(start); d < new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) continue;
    for (const [sector, requester, supplier, natureCode, ccCode, desc, avg] of daily) {
      if (rand() > 0.3) continue;
      const value = Math.round((avg * (0.5 + rand() * 1.1)) / 100) * 100;
      dailySpecs.push({ sector, requester, month: currentMonth(d), day: d.getDate(), supplier, natureCode, ccCode, items: [item(desc, 1, value)], payment: 'PIX', status: 'PAGA' });
    }
  }
  // Numeração em ordem de data, como aconteceria de verdade.
  const requests = [...specs, ...dailySpecs].sort((a, b) => a.month.localeCompare(b.month) || a.day - b.day).map(build);

  const byItem = (d: string) => requests.find((r) => r.items[0].description === d)!;
  const n = (id: string, userId: string, text: string, scId?: string) => ({ id, userId, text, scId, at: now.toISOString(), read: false });
  const notifications = [
    n('n1', 'ges-silvio', `Funcionário Logística (exemplo) criou a ${byItem('Frete emergencial de paletes').number} (R$ 4.500,00).`, byItem('Frete emergencial de paletes').id),
    n('n2', 'dir-victor', `Funcionário Logística (exemplo) criou a ${byItem('Troca de pneus do caminhão').number}.`, byItem('Troca de pneus do caminhão').id),
    n('n3', 'ges-stwart', `Funcionário Comercial (exemplo) criou a ${byItem('Banners para feira').number}.`, byItem('Banners para feira').id),
  ];

  // Orçamento de exemplo por conta contábil (a diretoria ajusta no Contábil), dos últimos 12 meses até dezembro.
  const G = '5110030503';
  const plan: Record<string, [string, number][]> = {
    'sec-log': [[G + '07', 1_200_000], [G + '05', 800_000], [G + '03', 500_000], [G + '31', 400_000], [G + '01', 200_000]],
    'sec-adm': [[G + '02', 400_000], ['511002050202', 800_000], [G + '63', 500_000], [G + '12', 400_000], [G + '11', 100_000]],
    'sec-ti': [[G + '40', 600_000], [G + '57', 400_000], [G + '38', 250_000], [G + '64', 200_000]],
    'sec-com': [[G + '37', 1_000_000], [G + '19', 600_000], [G + '29', 400_000], [G + '62', 500_000]],
    'sec-fin': [['511002050202', 600_000], ['513001050709', 300_000], [G + '18', 400_000]],
  };
  const accountBudgets: AccountBudget[] = [];
  for (let mo = shiftMonth(m0, -11); mo <= `${year}-12`; mo = shiftMonth(mo, 1))
    for (const [sectorId, rows] of Object.entries(plan))
      for (const [code, amount] of rows) accountBudgets.push({ sectorId, month: mo, accountId: `acc-${code}`, amount });

  return { version: DB_VERSION, seq: { [year]: seq }, users, sectors, overrides: [], costCenters, natures, accounts, accountBudgets, suppliers, requests, transfers: [], notifications };
}
