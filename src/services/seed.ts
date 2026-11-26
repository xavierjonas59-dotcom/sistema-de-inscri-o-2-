import { currentMonth, shiftMonth } from '@/domain/format';
import { emptyContent, scNumber } from '@/domain/sc';
import type { Attachment, CostCenter, Item, Nature, PurchaseRequest, ScContent, ScStatus, Sector, Supplier, TimelineEntry, UserRecord } from '@/domain/types';
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
  // 220101 e 51105007 vêm da planilha; os demais são exemplos para o Admin ajustar ao plano de contas.
  const costCenters: CostCenter[] = [
    ['220101', 'ADMINISTRATIVO'],
    ['220102', 'LOGÍSTICA'],
    ['220103', 'T.I'],
    ['220104', 'COMERCIAL'],
    ['220105', 'FINANCEIRO'],
  ].map(([code, name], i) => ({ id: `cc-${i + 1}`, code, name, active: true }));
  const natures: Nature[] = [
    ['51105007', 'Alimentação'],
    ['51105001', 'Material de escritório'],
    ['51105010', 'Manutenção e reparos'],
    ['51105015', 'Fretes e transportes'],
    ['51105020', 'Brindes e eventos'],
    ['51105025', 'Informática e softwares'],
  ].map(([code, name], i) => ({ id: `nat-${i + 1}`, code, name, active: true }));
  const bank = (b = '', a = '', c = '', p = '') => ({ bank: b, agency: a, account: c, pix: p });
  const suppliers: Supplier[] = [
    { id: 'sup-1', code: '1001', name: 'Panificadora Bom Trigo (exemplo)', contact: '(84) 3333-1001', bankData: bank('', '', '', '12.345.678/0001-01'), active: true },
    { id: 'sup-2', code: '1002', name: 'TransNordeste Fretes (exemplo)', contact: '(84) 3333-1002', bankData: bank('Banco do Brasil', '1234-5', '98765-0'), active: true },
    { id: 'sup-3', code: '1003', name: 'Oficina Mecânica (exemplo)', contact: '(84) 3333-1003', bankData: bank('Caixa', '0456-1', '11223-4'), active: true },
    { id: 'sup-4', code: '1004', name: 'Papelaria Central (exemplo)', contact: '(84) 3333-1004', bankData: bank('Itaú', '3030', '45678-9'), active: true },
    { id: 'sup-5', code: '1005', name: 'InfoTech Suprimentos (exemplo)', contact: '(84) 3333-1005', bankData: bank('', '', '', 'contato@exemplo.com'), active: true },
  ];

  const user = (id: string, name: string, email: string, role: UserRecord['role'], sectorId: string | null, cargo: string, paymentLimit: number | null = null): UserRecord => ({
    id, name, email, role, sectorId, cargo, paymentLimit, active: true, passwordHash: pw, signature: null,
  });
  const users: UserRecord[] = [
    // Diretoria (e-mails a confirmar)
    user('dir-manoel', 'Manoel Chroniaris', 'manoel@amcomercial.com.br', 'DIRETORIA', null, 'Diretor Geral'),
    user('dir-antonio', 'Antônio Chroniaris', 'antonio@amcomercial.com.br', 'DIRETORIA', null, 'Diretor Geral'),
    user('dir-ana', 'Ana Katarina', 'ana@amcomercial.com.br', 'DIRETORIA', 'sec-fin', 'Diretora Financeira'),
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
    // Mês anterior (consumo de exemplo)
    { sector: 'sec-log', requester: 'fun-log', month: m1, day: 6, supplier: 'TransNordeste', natureCode: '51105015', ccCode: '220102', items: [item('Frete de reposição de estoque', 1, 980_000)], payment: 'TRANSFERENCIA', status: 'PAGA' },
    { sector: 'sec-com', requester: 'fun-com', month: m1, day: 9, supplier: 'Papelaria', natureCode: '51105020', ccCode: '220104', items: [item('Folders promocionais', 2000, 95)], status: 'PAGA' },
    // Mês atual
    { sector: 'sec-log', requester: 'fun-log', month: m0, day: 3, supplier: 'Panificadora', natureCode: '51105007', ccCode: '220102', items: [item('PÃES', 84, 1_800)], payment: 'PIX', status: 'PAGA' },
    { sector: 'sec-log', requester: 'fun-log', month: m0, day: 5, supplier: 'Oficina', natureCode: '51105010', ccCode: '220102', items: [item('Revisão do caminhão', 1, 640_000)], status: 'PAGA' },
    { sector: 'sec-adm', requester: 'ges-adriano', month: m0, day: 4, supplier: 'Papelaria', natureCode: '51105001', ccCode: '220101', items: [item('Material de escritório', 1, 186_000)], status: 'PAGA' },
    { sector: 'sec-log', requester: 'fun-log', month: m0, day: 12, supplier: 'TransNordeste', natureCode: '51105015', ccCode: '220102', items: [item('Frete emergencial de paletes', 1, 450_000)], payment: 'TRANSFERENCIA', status: 'AGUARDANDO_GESTOR' },
    { sector: 'sec-log', requester: 'fun-log', month: m0, day: 13, supplier: 'Oficina', natureCode: '51105010', ccCode: '220102', items: [item('Troca de pneus do caminhão', 6, 210_000, 60_000)], status: 'AGUARDANDO_GESTOR' },
    { sector: 'sec-log', requester: 'fun-log', month: m0, day: 11, supplier: 'Panificadora', natureCode: '51105007', ccCode: '220102', items: [item('Lanche turno noturno', 30, 1_500)], payment: 'PIX', status: 'DEVOLVIDA' as ScStatus, reason: 'Anexar o orçamento da padaria.' },
    { sector: 'sec-com', requester: 'fun-com', month: m0, day: 10, supplier: 'Papelaria', natureCode: '51105020', ccCode: '220104', items: [item('Banners para feira', 2, 85_000)], payment: 'PIX', status: 'AGUARDANDO_GESTOR' },
  ];
  const requests = specs.map(build);

  const n = (id: string, userId: string, text: string, scId?: string) => ({ id, userId, text, scId, at: now.toISOString(), read: false });
  const notifications = [
    n('n1', 'ges-silvio', `Funcionário Logística (exemplo) criou a ${requests[5].number} (R$ 4.500,00).`, requests[5].id),
    n('n2', 'dir-victor', `Funcionário Logística (exemplo) criou a ${requests[6].number}.`, requests[6].id),
    n('n3', 'ges-stwart', `Funcionário Comercial (exemplo) criou a ${requests[8].number}.`, requests[8].id),
  ];

  return { version: DB_VERSION, seq: { [year]: seq }, users, sectors, overrides: [], costCenters, natures, suppliers, requests, transfers: [], notifications };
}
