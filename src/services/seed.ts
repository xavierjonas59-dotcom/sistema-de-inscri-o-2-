import { currentMonth, shiftMonth } from '@/domain/format';
import { contentHash, emptyContent, scNumber, sha256 } from '@/domain/sc';
import type {
  AppliedSignature,
  Attachment,
  AttachmentKind,
  CostCenter,
  Item,
  Nature,
  PurchaseRequest,
  ScContent,
  ScStatus,
  Sector,
  Supplier,
  TimelineEntry,
  UserRecord,
} from '@/domain/types';
import { DEMO_SIGNATURES } from './demoSignatures';
import { DB_VERSION, hashPassword, type Database } from './LocalDataService';

/** Senha de todos os usuários de demonstração. */
export const DEMO_PASSWORD = 'amc123';

export const DEMO_USERS = [
  { email: 'funcionario.logistica@amcomercial.demo', label: 'Funcionário · Logística' },
  { email: 'gestor.logistica@amcomercial.demo', label: 'Gestor · Logística' },
  { email: 'diretoria@amcomercial.demo', label: 'Diretoria' },
  { email: 'financeiro@amcomercial.demo', label: 'Financeiro (Contas a Pagar)' },
  { email: 'admin@amcomercial.demo', label: 'Admin' },
  { email: 'gestor.comercial@amcomercial.demo', label: 'Gestor · Comercial' },
];

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
  const sectors: Sector[] = [
    { id: 'sec-log', name: 'Logística', monthlyLimit: 3_000_000, active: true },
    { id: 'sec-com', name: 'Comercial', monthlyLimit: 2_800_000, active: true },
    { id: 'sec-fin', name: 'Financeiro', monthlyLimit: 1_800_000, active: true },
    { id: 'sec-adm', name: 'Administrativo', monthlyLimit: 2_200_000, active: true },
  ];
  // Códigos de exemplo (o 220101 e o 51105007 vêm da planilha modelo); o Admin ajusta para o plano de contas real.
  const costCenters: CostCenter[] = [
    ['220101', 'ADMINISTRATIVO'],
    ['220102', 'COMERCIAL'],
    ['220103', 'LOGÍSTICA'],
    ['220104', 'FINANCEIRO'],
  ].map(([code, name], i) => ({ id: `cc-${i + 1}`, code, name, active: true }));
  const natures: Nature[] = [
    ['51105007', 'Alimentação'],
    ['51105001', 'Material de escritório'],
    ['51105010', 'Manutenção e reparos'],
    ['51105015', 'Fretes e transportes'],
    ['51105020', 'Brindes e eventos'],
    ['51105030', 'Despesas prediais'],
  ].map(([code, name], i) => ({ id: `nat-${i + 1}`, code, name, active: true }));
  const bank = (b = '', a = '', c = '', p = '') => ({ bank: b, agency: a, account: c, pix: p });
  const suppliers: Supplier[] = [
    { id: 'sup-1', code: '1001', name: 'Panificadora Bom Trigo', contact: 'Rosa · (84) 3333-1001', bankData: bank('', '', '', '12.345.678/0001-01'), active: true },
    { id: 'sup-2', code: '1002', name: 'TransNordeste Fretes', contact: 'Carlos · (84) 3333-1002', bankData: bank('Banco do Brasil', '1234-5', '98765-0'), active: true },
    { id: 'sup-3', code: '1003', name: 'Oficina Mecânica Ponta Negra', contact: 'Severino · (84) 3333-1003', bankData: bank('Caixa', '0456-1', '11223-4'), active: true },
    { id: 'sup-4', code: '1004', name: 'Gráfica Potiguar', contact: 'Lúcia · (84) 3333-1004', bankData: bank('', '', '', 'grafica@exemplo.com'), active: true },
    { id: 'sup-5', code: '1005', name: 'Cosern (energia)', contact: 'Atendimento empresarial', bankData: bank(), active: true },
    { id: 'sup-6', code: '1006', name: 'Papelaria Central', contact: 'Márcio · (84) 3333-1006', bankData: bank('Itaú', '3030', '45678-9', ''), active: true },
  ];

  const user = (id: string, name: string, email: string, role: UserRecord['role'], sectorId: string | null, cargo: string, sig?: string): UserRecord => ({
    id, name, email: `${email}@amcomercial.demo`, role, sectorId, cargo, active: true, passwordHash: pw,
    signature: sig ? { dataUrl: sig, updatedAt: now.toISOString() } : null,
  });
  const users: UserRecord[] = [
    user('usr-adm', 'Roberto Nunes', 'admin', 'ADMIN', null, 'Administrador do sistema'),
    user('usr-dir', 'Helena Duarte', 'diretoria', 'DIRETORIA', null, 'Diretora', DEMO_SIGNATURES.diretoria),
    user('usr-finp', 'Carla Mendes', 'financeiro', 'FINANCEIRO', null, 'Contas a Pagar'),
    user('usr-glog', 'Marcos Lima', 'gestor.logistica', 'GESTOR', 'sec-log', 'Gestor de Logística', DEMO_SIGNATURES.gestorLog),
    user('usr-flog', 'João Pereira', 'funcionario.logistica', 'FUNCIONARIO', 'sec-log', 'Assistente de Logística'),
    user('usr-flog2', 'Bruna Costa', 'bruna.logistica', 'FUNCIONARIO', 'sec-log', 'Conferente'),
    user('usr-gcom', 'Juliana Prado', 'gestor.comercial', 'GESTOR', 'sec-com', 'Gestora Comercial', DEMO_SIGNATURES.gestorCom),
    user('usr-fcom', 'Pedro Alves', 'funcionario.comercial', 'FUNCIONARIO', 'sec-com', 'Vendedor'),
    user('usr-gfin', 'Ricardo Alves', 'gestor.financeiro', 'GESTOR', 'sec-fin', 'Gestor Financeiro', DEMO_SIGNATURES.gestorFin),
    user('usr-gadm', 'Patrícia Souza', 'gestor.administrativo', 'GESTOR', 'sec-adm', 'Gestora Administrativa', DEMO_SIGNATURES.gestorAdm),
  ];
  const U = Object.fromEntries(users.map((u) => [u.id, u]));

  const m0 = currentMonth(now);
  const m1 = shiftMonth(m0, -1);
  const at = (month: string, day: number, hour = 9, min = 0) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1, day, hour, min);
    return (d > now ? now : d).toISOString();
  };
  const year = now.getFullYear();
  let seq = 0;

  const item = (description: string, quantity: number, unitPrice: number, discount = 0, surcharge = 0): Item => ({ description, quantity, unitPrice, discount, surcharge });
  const cc = (code: string) => costCenters.find((c) => c.code === code)!.id;
  const nat = (code: string) => natures.find((n) => n.code === code)!.id;

  interface Spec {
    sector: string;
    requester: string;
    month: string;
    day: number;
    supplier: string;
    natureCode: string;
    rateio: [string, number][];
    items: Item[];
    payment?: ScContent['paymentMethod'];
    installments?: string[];
    status: ScStatus;
    invoiceInfo?: string;
    reason?: string;
  }

  const build = async (s: Spec): Promise<PurchaseRequest> => {
    const sup = suppliers.find((x) => x.name === s.supplier)!;
    const req = U[s.requester];
    const manager = users.find((u) => u.role === 'GESTOR' && u.sectorId === s.sector)!;
    const dir = U['usr-dir'];
    const fin = U['usr-finp'];
    const date = at(s.month, s.day).slice(0, 10);
    const sc: PurchaseRequest = {
      ...emptyContent(),
      supplierId: sup.id,
      supplierName: sup.name,
      supplierCode: sup.code,
      contact: sup.contact,
      paymentMethod: s.payment ?? 'BOLETO',
      installments: (s.installments ?? []).map((dueDate) => ({ dueDate })),
      apportionment: s.rateio.map(([code, percent]) => ({ costCenterId: cc(code), percent })),
      invoiceInfo: s.invoiceInfo ?? '',
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
      createdAt: at(s.month, s.day, 8, 30),
      status: s.status,
      signatures: {},
      attachments: [],
      changes: [],
      timeline: [],
    };
    const t = (who: UserRecord, action: string, h: number, note?: string): TimelineEntry => ({ at: at(s.month, s.day, h), userId: who.id, userName: who.name, action, note });
    sc.timeline.push(t(req, 'Criou a solicitação', 8));
    if (s.status === 'RASCUNHO') return sc;
    sc.submittedAt = at(s.month, s.day, 9);
    const selfManaged = req.role === 'GESTOR';
    sc.timeline.push(t(req, selfManaged ? 'Enviou à Diretoria (solicitação do próprio gestor)' : 'Enviou para o gestor', 9));
    if (s.status === 'AGUARDANDO_GESTOR') return sc;
    if (s.status === 'DEVOLVIDA') {
      sc.returnReason = s.reason;
      sc.timeline.push(t(manager, 'Devolveu para ajuste', 11, s.reason));
      return sc;
    }
    if (s.status === 'REPROVADA' && !selfManaged) {
      sc.rejectReason = s.reason;
      sc.timeline.push(t(manager, 'Reprovou (gestor)', 11, s.reason));
      return sc;
    }
    const hash = await contentHash(sc);
    const signature = async (who: UserRecord, slot: 'COMPRA' | 'PAGAMENTO', h: number): Promise<AppliedSignature> => ({
      slot, userId: who.id, name: who.name, cargo: who.cargo, imageDataUrl: who.signature!.dataUrl, signedAt: at(s.month, s.day, h),
      ip: '192.168.0.10', contentHash: hash, method: 'INTERNA',
      code: (await sha256(`${hash}:${who.id}:${slot}`)).slice(0, 8).toUpperCase().replace(/(.{4})/, '$1-'),
    });
    sc.signatures.COMPRA = await signature(manager, 'COMPRA', 10);
    sc.timeline.push(t(manager, 'Assinou a Autorização de Compra', 10, `Código ${sc.signatures.COMPRA.code}`));
    if (!selfManaged) sc.timeline.push(t(manager, 'Aprovou e enviou à Diretoria', 10));
    if (s.status === 'AGUARDANDO_DIRETORIA') return sc;
    if (s.status === 'REPROVADA') {
      sc.rejectReason = s.reason;
      sc.timeline.push(t(dir, 'Reprovou (Diretoria)', 14, s.reason));
      return sc;
    }
    sc.signatures.PAGAMENTO = await signature(dir, 'PAGAMENTO', 14);
    sc.timeline.push(t(dir, 'Assinou a Autorização de Pagamento', 14, `Código ${sc.signatures.PAGAMENTO.code}`), t(dir, 'Aprovou (Diretoria)', 14));
    if (s.status === 'AGUARDANDO_NF') return sc;
    const attach = (kind: AttachmentKind, name: string, label: string, who: UserRecord, h: number) => {
      sc.attachments.push({ id: `${sc.id}-${kind}-${name}`, kind, ...demoPdf(`${sc.number} - ${sc.supplierName}`, name, label), uploadedBy: who.id, uploadedByName: who.name, uploadedAt: at(s.month, s.day + 1, h) });
      sc.timeline.push({ at: at(s.month, s.day + 1, h), userId: who.id, userName: who.name, action: `Anexou ${label.toLowerCase()}`, note: name });
    };
    attach('NF', `NF-${sc.number}.pdf`, 'Nota fiscal', req, 9);
    if (sc.paymentMethod.startsWith('BOLETO')) attach('BOLETO', `boleto-${sc.number}.pdf`, 'Boleto', req, 9);
    sc.timeline.push({ at: at(s.month, s.day + 1, 10), userId: req.id, userName: req.name, action: 'Enviou ao financeiro' });
    if (s.status === 'ENVIADA_FINANCEIRO') return sc;
    sc.attachments.push({
      id: `${sc.id}-pg`, kind: 'COMPROVANTE_PAGAMENTO', ...demoPdf(`${sc.number} - pagamento`, `comprovante-pagamento-${sc.number}.pdf`, 'Comprovante de pagamento'),
      uploadedBy: fin.id, uploadedByName: fin.name, uploadedAt: at(s.month, s.day + 2, 15),
    });
    sc.paidAt = at(s.month, s.day + 2).slice(0, 10);
    sc.timeline.push({ at: at(s.month, s.day + 2, 15), userId: fin.id, userName: fin.name, action: 'Marcou como paga' });
    return sc;
  };

  const specs: Spec[] = [
    // Mês anterior
    { sector: 'sec-log', requester: 'usr-flog', month: m1, day: 4, supplier: 'TransNordeste Fretes', natureCode: '51105015', rateio: [['220103', 100]], items: [item('Frete de reposição de estoque', 1, 980_000)], payment: 'TRANSFERENCIA', status: 'PAGA', invoiceInfo: 'NF 4410' },
    { sector: 'sec-log', requester: 'usr-flog', month: m1, day: 12, supplier: 'Oficina Mecânica Ponta Negra', natureCode: '51105010', rateio: [['220103', 100]], items: [item('Revisão do caminhão placa ABC-1D23', 1, 640_000)], status: 'PAGA', installments: [`${m1}-25`] },
    { sector: 'sec-com', requester: 'usr-fcom', month: m1, day: 8, supplier: 'Gráfica Potiguar', natureCode: '51105020', rateio: [['220102', 100]], items: [item('Folders promocionais', 2000, 95)], payment: 'PIX', status: 'PAGA' },
    { sector: 'sec-adm', requester: 'usr-gadm', month: m1, day: 3, supplier: 'Cosern (energia)', natureCode: '51105030', rateio: [['220101', 100]], items: [item('Conta de energia da sede', 1, 910_000)], status: 'PAGA', installments: [`${m1}-15`] },
    // Mês atual
    { sector: 'sec-log', requester: 'usr-flog', month: m0, day: 3, supplier: 'Panificadora Bom Trigo', natureCode: '51105007', rateio: [['220103', 100]], items: [item('PÃES', 84, 1_800)], payment: 'PIX', status: 'PAGA', invoiceInfo: 'NF 000.812 série 1' },
    { sector: 'sec-log', requester: 'usr-flog', month: m0, day: 5, supplier: 'TransNordeste Fretes', natureCode: '51105015', rateio: [['220103', 70], ['220102', 30]], items: [item('Frete rota Mossoró–Natal', 3, 260_000, 30_000)], payment: 'BOLETO_PARCELADO', installments: [`${m0}-20`, shiftMonth(m0, 1) + '-20'], status: 'ENVIADA_FINANCEIRO', invoiceInfo: 'NF 4521' },
    { sector: 'sec-log', requester: 'usr-flog2', month: m0, day: 7, supplier: 'Oficina Mecânica Ponta Negra', natureCode: '51105010', rateio: [['220103', 100]], items: [item('Troca de pneus da empilhadeira', 4, 120_000), item('Mão de obra', 1, 35_000)], installments: [`${m0}-28`], status: 'AGUARDANDO_NF' },
    { sector: 'sec-log', requester: 'usr-flog', month: m0, day: 10, supplier: 'Papelaria Central', natureCode: '51105001', rateio: [['220103', 100]], items: [item('Etiquetas térmicas 100x150', 40, 4_500), item('Fita adesiva', 60, 890)], payment: 'TRANSFERENCIA', status: 'AGUARDANDO_DIRETORIA' },
    { sector: 'sec-log', requester: 'usr-flog', month: m0, day: 13, supplier: 'TransNordeste Fretes', natureCode: '51105015', rateio: [['220103', 100]], items: [item('Frete emergencial de paletes', 1, 450_000)], payment: 'TRANSFERENCIA', status: 'AGUARDANDO_GESTOR' },
    { sector: 'sec-log', requester: 'usr-flog2', month: m0, day: 12, supplier: 'Panificadora Bom Trigo', natureCode: '51105007', rateio: [['220103', 100]], items: [item('Lanche equipe turno noturno', 30, 1_500)], payment: 'PIX', status: 'DEVOLVIDA', reason: 'Separar o lanche do turno noturno por semana e anexar o orçamento.' },
    { sector: 'sec-com', requester: 'usr-gcom', month: m0, day: 6, supplier: 'Gráfica Potiguar', natureCode: '51105020', rateio: [['220102', 100]], items: [item('Banner para feira do sal', 2, 85_000), item('Brindes personalizados', 300, 1_200)], payment: 'PIX', status: 'AGUARDANDO_DIRETORIA' },
    { sector: 'sec-com', requester: 'usr-fcom', month: m0, day: 4, supplier: 'Panificadora Bom Trigo', natureCode: '51105007', rateio: [['220102', 100]], items: [item('Café da manhã com clientes', 1, 62_000)], payment: 'PIX', status: 'PAGA' },
    { sector: 'sec-adm', requester: 'usr-gadm', month: m0, day: 2, supplier: 'Cosern (energia)', natureCode: '51105030', rateio: [['220101', 100]], items: [item('Conta de energia da sede', 1, 960_000)], installments: [`${m0}-15`], status: 'AGUARDANDO_NF' },
    { sector: 'sec-fin', requester: 'usr-gfin', month: m0, day: 9, supplier: 'Papelaria Central', natureCode: '51105001', rateio: [['220104', 100]], items: [item('Cadeiras para a sala de reunião', 6, 89_000)], payment: 'TRANSFERENCIA', status: 'REPROVADA', reason: 'Compra de mobiliário fica para o próximo trimestre.' },
  ];
  const requests: PurchaseRequest[] = [];
  for (const s of specs) requests.push(await build(s));

  const n = (id: string, userId: string, text: string, scNum?: string) => ({
    id, userId, text, scId: requests.find((r) => r.number === scNum)?.id, at: now.toISOString(), read: false,
  });
  const byNum = (i: number) => requests[i].number;
  const notifications = [
    n('n1', 'usr-glog', `João Pereira criou a ${byNum(8)} (R$ 4.500,00).`, byNum(8)),
    n('n2', 'usr-dir', `${byNum(7)} aguarda a aprovação da Diretoria.`, byNum(7)),
    n('n3', 'usr-dir', `${byNum(10)} aguarda a aprovação da Diretoria.`, byNum(10)),
    n('n4', 'usr-finp', `${byNum(5)} foi enviada para pagamento.`, byNum(5)),
    n('n5', 'usr-flog2', `${byNum(9)} foi devolvida para ajuste.`, byNum(9)),
    n('n6', 'usr-flog2', `${byNum(6)} foi aprovada pela Diretoria. Anexe a NF e os comprovantes.`, byNum(6)),
  ];

  return {
    version: DB_VERSION,
    seq: { [year]: seq },
    users,
    sectors,
    overrides: [],
    costCenters,
    natures,
    suppliers,
    requests,
    transfers: [],
    notifications,
  };
}
