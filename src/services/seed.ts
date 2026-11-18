import { currentMonth, shiftMonth } from '@/domain/format';
import type { Attachment, Category, Expense, Sector, Transfer, UserRecord } from '@/domain/types';
import { DB_VERSION, hashPassword, type Database } from './LocalDataService';

/** Senha de todos os usuários de demonstração. */
export const DEMO_PASSWORD = 'mksal123';

export const DEMO_USERS = [
  { email: 'diretoria@mksal.com.br', label: 'Diretoria (Master)' },
  { email: 'logistica@mksal.com.br', label: 'Gestor · Logística' },
  { email: 'comercial@mksal.com.br', label: 'Gestor · Comercial' },
  { email: 'financeiro@mksal.com.br', label: 'Gestor · Financeiro' },
  { email: 'administrativo@mksal.com.br', label: 'Gestor · Administrativo' },
];

/** PDF mínimo válido para os comprovantes de exemplo. */
function demoPdf(title: string): Attachment {
  const text = `Comprovante de demonstracao - ${title}`.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '');
  const stream = `BT /F1 14 Tf 60 760 Td (${text}) Tj ET`;
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
  return { name: 'comprovante.pdf', mimeType: 'application/pdf', size: pdf.length, url: `data:application/pdf;base64,${btoa(pdf)}` };
}

export async function buildSeed(now: Date): Promise<Database> {
  const pw = await hashPassword(DEMO_PASSWORD);
  const sectors: Sector[] = [
    { id: 'sec-log', name: 'Logística', defaultCeiling: 3_200_000, active: true },
    { id: 'sec-com', name: 'Comercial', defaultCeiling: 2_800_000, active: true },
    { id: 'sec-fin', name: 'Financeiro', defaultCeiling: 1_800_000, active: true },
    { id: 'sec-adm', name: 'Administrativo', defaultCeiling: 2_200_000, active: true },
  ];
  const categories: Category[] = [
    'Alimentação',
    'Despesa Predial',
    'Brindes',
    'Transporte',
    'Combustível',
    'Material de Escritório',
    'Manutenção',
    'Viagens e Hospedagem',
    'Tecnologia',
    'Eventos e Marketing',
  ].map((name, i) => ({ id: `cat-${i + 1}`, name, active: true }));
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;

  const users: UserRecord[] = [
    { id: 'usr-dir', name: 'Helena Duarte', email: 'diretoria@mksal.com.br', role: 'DIRETORIA', sectorId: null, active: true, password: pw },
    { id: 'usr-log', name: 'Marcos Lima', email: 'logistica@mksal.com.br', role: 'GESTOR', sectorId: 'sec-log', active: true, password: pw },
    { id: 'usr-com', name: 'Juliana Prado', email: 'comercial@mksal.com.br', role: 'GESTOR', sectorId: 'sec-com', active: true, password: pw },
    { id: 'usr-fin', name: 'Ricardo Alves', email: 'financeiro@mksal.com.br', role: 'GESTOR', sectorId: 'sec-fin', active: true, password: pw },
    { id: 'usr-adm', name: 'Patrícia Souza', email: 'administrativo@mksal.com.br', role: 'GESTOR', sectorId: 'sec-adm', active: true, password: pw },
  ];
  const managerOf = (sectorId: string) => users.find((u) => u.sectorId === sectorId)!;
  const director = users[0];

  const m0 = currentMonth(now);
  const m1 = shiftMonth(m0, -1);
  const m2 = shiftMonth(m0, -2);
  const dayIn = (month: string, day: number, hour = 10) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1, day, hour);
    return (d > now ? now : d).toISOString();
  };

  type Row = [sector: string, month: string, day: number, desc: string, cents: number, category: string, status: Expense['status'], reason?: string];
  const rows: Row[] = [
    // Mês atual
    ['sec-log', m0, 2, 'Frete de reposição de estoque — rota Sul', 840_000, 'Transporte', 'APROVADA'],
    ['sec-log', m0, 4, 'Abastecimento da frota (semana 1)', 620_000, 'Combustível', 'APROVADA'],
    ['sec-log', m0, 6, 'Manutenção preventiva da empilhadeira', 470_000, 'Manutenção', 'APROVADA'],
    ['sec-log', m0, 9, 'Abastecimento da frota (semana 2)', 590_000, 'Combustível', 'APROVADA'],
    ['sec-log', m0, 12, 'Paletes e filme stretch', 310_000, 'Material de Escritório', 'PENDENTE_DIRETORIA'],
    ['sec-log', m0, 13, 'Lanche equipe turno noturno', 95_000, 'Alimentação', 'PENDENTE_DIRETORIA'],
    ['sec-com', m0, 3, 'Brindes para feira do setor salineiro', 450_000, 'Brindes', 'APROVADA'],
    ['sec-com', m0, 5, 'Viagem comercial — visita a clientes em Fortaleza', 380_000, 'Viagens e Hospedagem', 'APROVADA'],
    ['sec-com', m0, 10, 'Almoço com cliente estratégico', 62_000, 'Alimentação', 'APROVADA'],
    ['sec-com', m0, 11, 'Material gráfico de campanha', 280_000, 'Eventos e Marketing', 'PENDENTE_DIRETORIA'],
    ['sec-com', m0, 8, 'Camisetas personalizadas', 190_000, 'Brindes', 'REJEITADA', 'Fora do escopo da campanha deste mês.'],
    ['sec-fin', m0, 2, 'Licença anual de software contábil (parcela)', 520_000, 'Tecnologia', 'APROVADA'],
    ['sec-fin', m0, 7, 'Material de escritório', 74_000, 'Material de Escritório', 'APROVADA'],
    ['sec-fin', m0, 12, 'Certificado digital A1', 28_000, 'Tecnologia', 'PENDENTE_DIRETORIA'],
    ['sec-adm', m0, 1, 'Conta de energia — sede', 960_000, 'Despesa Predial', 'APROVADA'],
    ['sec-adm', m0, 3, 'Limpeza e conservação', 540_000, 'Despesa Predial', 'APROVADA'],
    ['sec-adm', m0, 6, 'Café e copa', 120_000, 'Alimentação', 'APROVADA'],
    ['sec-adm', m0, 9, 'Reparo no ar-condicionado da recepção', 210_000, 'Manutenção', 'PENDENTE_DIRETORIA'],
    // Mês anterior
    ['sec-log', m1, 3, 'Frete de reposição de estoque', 1_150_000, 'Transporte', 'APROVADA'],
    ['sec-log', m1, 8, 'Combustível da frota', 1_240_000, 'Combustível', 'APROVADA'],
    ['sec-log', m1, 15, 'Pneus para caminhão', 680_000, 'Manutenção', 'APROVADA'],
    ['sec-com', m1, 4, 'Brindes de fim de trimestre', 720_000, 'Brindes', 'APROVADA'],
    ['sec-com', m1, 10, 'Patrocínio evento regional', 1_100_000, 'Eventos e Marketing', 'APROVADA'],
    ['sec-com', m1, 18, 'Viagens comerciais', 540_000, 'Viagens e Hospedagem', 'APROVADA'],
    ['sec-fin', m1, 5, 'Auditoria externa (parcela)', 900_000, 'Tecnologia', 'APROVADA'],
    ['sec-fin', m1, 14, 'Material de escritório', 66_000, 'Material de Escritório', 'APROVADA'],
    ['sec-adm', m1, 2, 'Conta de energia — sede', 910_000, 'Despesa Predial', 'APROVADA'],
    ['sec-adm', m1, 5, 'Limpeza e conservação', 540_000, 'Despesa Predial', 'APROVADA'],
    ['sec-adm', m1, 20, 'Confraternização da equipe', 380_000, 'Alimentação', 'APROVADA'],
    // Dois meses atrás
    ['sec-log', m2, 6, 'Combustível da frota', 1_180_000, 'Combustível', 'APROVADA'],
    ['sec-log', m2, 12, 'Frete', 960_000, 'Transporte', 'APROVADA'],
    ['sec-com', m2, 9, 'Brindes', 410_000, 'Brindes', 'APROVADA'],
    ['sec-fin', m2, 9, 'Licenças de software', 480_000, 'Tecnologia', 'APROVADA'],
    ['sec-adm', m2, 4, 'Conta de energia — sede', 880_000, 'Despesa Predial', 'APROVADA'],
  ];

  const expenses: Expense[] = rows.map(([sectorId, month, day, description, amount, category, status, reason], i) => {
    const mgr = managerOf(sectorId);
    const createdAt = dayIn(month, day);
    const decided = status === 'APROVADA' || status === 'REJEITADA';
    const decidedAt = decided ? dayIn(month, day + 1, 15) : undefined;
    return {
      id: `exp-${i + 1}`,
      sectorId,
      requesterId: mgr.id,
      requesterName: mgr.name,
      month,
      description,
      amount,
      categoryId: cat(category),
      justification: `Necessário para a operação do setor: ${description.toLowerCase()}.`,
      attachment: demoPdf(description),
      status,
      decisionReason: reason,
      createdAt,
      decidedAt,
      decidedBy: decided ? director.id : undefined,
      history: [
        { at: createdAt, userId: mgr.id, userName: mgr.name, action: 'Solicitação criada' },
        ...(decided
          ? [{
              at: decidedAt!,
              userId: director.id,
              userName: director.name,
              action: status === 'APROVADA' ? 'Aprovada pela Diretoria' : 'Rejeitada pela Diretoria',
              note: reason,
            }]
          : []),
      ],
    };
  });

  const log = managerOf('sec-log');
  const fin = managerOf('sec-fin');
  const com = managerOf('sec-com');
  const transfers: Transfer[] = [
    {
      id: 'trf-1', requestingSectorId: 'sec-log', grantingSectorId: 'sec-fin', requesterId: log.id, requesterName: log.name, month: m1,
      amount: 500_000, justification: 'Pico de fretes no fechamento do trimestre.', status: 'APROVADA',
      grantorDecisionBy: fin.id, grantorDecisionAt: dayIn(m1, 11), directorDecisionBy: director.id, directorDecisionAt: dayIn(m1, 12),
      createdAt: dayIn(m1, 10),
      history: [
        { at: dayIn(m1, 10), userId: log.id, userName: log.name, action: 'Pedido de transferência criado' },
        { at: dayIn(m1, 11), userId: fin.id, userName: fin.name, action: 'Aceita pelo gestor cedente' },
        { at: dayIn(m1, 12), userId: director.id, userName: director.name, action: 'Aprovada pela Diretoria — limite transferido' },
      ],
    },
    {
      id: 'trf-2', requestingSectorId: 'sec-log', grantingSectorId: 'sec-adm', requesterId: log.id, requesterName: log.name, month: m0,
      amount: 300_000, justification: 'Manutenção corretiva emergencial em dois caminhões da frota.', status: 'PENDENTE_CEDENTE',
      createdAt: dayIn(m0, 13),
      history: [{ at: dayIn(m0, 13), userId: log.id, userName: log.name, action: 'Pedido de transferência criado' }],
    },
    {
      id: 'trf-3', requestingSectorId: 'sec-com', grantingSectorId: 'sec-fin', requesterId: com.id, requesterName: com.name, month: m0,
      amount: 400_000, justification: 'Participação adicional em feira com potencial de novos contratos.', status: 'PENDENTE_DIRETORIA',
      grantorDecisionBy: fin.id, grantorDecisionAt: dayIn(m0, 12), grantorNote: 'De acordo, temos folga este mês.',
      createdAt: dayIn(m0, 11),
      history: [
        { at: dayIn(m0, 11), userId: com.id, userName: com.name, action: 'Pedido de transferência criado' },
        { at: dayIn(m0, 12), userId: fin.id, userName: fin.name, action: 'Aceita pelo gestor cedente', note: 'De acordo, temos folga este mês.' },
      ],
    },
  ];

  return { version: DB_VERSION, users, sectors, overrides: [], categories, expenses, transfers };
}
