import { beforeEach, describe, expect, it } from 'vitest';
import { currentMonth } from '@/domain/format';
import type { Attachment, User } from '@/domain/types';
import { LocalDataService, type KeyValueStore } from './LocalDataService';
import { DEMO_PASSWORD } from './seed';

const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const NOW = new Date(2026, 10, 18, 12);
const MONTH = currentMonth(NOW);
const pdf: Attachment = { name: 'orc.pdf', mimeType: 'application/pdf', size: 1000, url: 'data:application/pdf;base64,AA==' };

let svc: LocalDataService;
let dir: User, log: User, fin: User, adm: User;

beforeEach(async () => {
  svc = new LocalDataService(memory(), () => NOW);
  dir = await svc.login('diretoria@mksal.com.br', DEMO_PASSWORD);
  log = await svc.login('logistica@mksal.com.br', DEMO_PASSWORD);
  fin = await svc.login('financeiro@mksal.com.br', DEMO_PASSWORD);
  adm = await svc.login('administrativo@mksal.com.br', DEMO_PASSWORD);
});

describe('autenticação', () => {
  it('rejeita senha errada', async () => {
    await expect(svc.login('diretoria@mksal.com.br', 'x')).rejects.toThrow('inválidos');
  });
});

describe('isolamento por setor (RBAC)', () => {
  it('gestor só lista despesas do próprio setor, mesmo pedindo outro', async () => {
    const list = await svc.listExpenses(log, { sectorId: 'sec-com' });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => e.sectorId === 'sec-log')).toBe(true);
  });
  it('gestor não acessa orçamento de outro setor', async () => {
    await expect(svc.getBudget(log, 'sec-com', MONTH)).rejects.toThrow('outro setor');
  });
  it('gestor não acessa visão consolidada nem cadastros', async () => {
    await expect(svc.getAllBudgets(log, MONTH)).rejects.toThrow();
    await expect(svc.listUsers(log)).rejects.toThrow();
    await expect(svc.saveCategory(log, { name: 'X' })).rejects.toThrow();
  });
  it('gestor não consegue se promover alterando o objeto da sessão', async () => {
    const forged = { ...log, role: 'DIRETORIA' as const };
    await expect(svc.getAllBudgets(forged, MONTH)).rejects.toThrow();
  });
  it('gestor vê apenas transferências em que seu setor participa', async () => {
    const list = await svc.listTransfers(adm);
    expect(list.every((t) => t.requestingSectorId === 'sec-adm' || t.grantingSectorId === 'sec-adm')).toBe(true);
  });
  it('diretoria vê todos os setores', async () => {
    expect((await svc.getAllBudgets(dir, MONTH)).length).toBe(4);
  });
});

describe('despesas', () => {
  it('reserva o valor como pendente e desconta ao aprovar', async () => {
    const before = await svc.getBudget(fin, 'sec-fin', MONTH);
    const e = await svc.createExpense(fin, {
      description: 'Cadeiras', amount: 100_000, categoryId: 'cat-6', justification: 'Reposição de cadeiras quebradas', attachment: pdf, month: MONTH,
    });
    const mid = await svc.getBudget(fin, 'sec-fin', MONTH);
    expect(mid.pending).toBe(before.pending + 100_000);
    expect(mid.available).toBe(before.available - 100_000);
    await svc.decideExpense(dir, e.id, true);
    const after = await svc.getBudget(fin, 'sec-fin', MONTH);
    expect(after.approved).toBe(before.approved + 100_000);
    expect(after.available).toBe(mid.available);
  });
  it('bloqueia solicitação acima do saldo', async () => {
    const b = await svc.getBudget(log, 'sec-log', MONTH);
    await expect(
      svc.createExpense(log, { description: 'Caminhão', amount: b.available + 1, categoryId: 'cat-4', justification: 'Compra de caminhão novo', attachment: pdf, month: MONTH }),
    ).rejects.toThrow('Saldo insuficiente');
  });
  it('exige anexo e motivo na rejeição', async () => {
    await expect(
      svc.createExpense(fin, { description: 'Item', amount: 100, categoryId: 'cat-1', justification: 'Justificativa ok', attachment: null, month: MONTH }),
    ).rejects.toThrow('Anexe');
    const [pending] = await svc.listExpenses(dir, { status: 'PENDENTE_DIRETORIA' });
    await expect(svc.decideExpense(dir, pending.id, false)).rejects.toThrow('motivo');
  });
  it('gestor não aprova despesas', async () => {
    const [pending] = await svc.listExpenses(log, { status: 'PENDENTE_DIRETORIA' });
    await expect(svc.decideExpense(log, pending.id, true)).rejects.toThrow();
  });
});

describe('transferência de limite (dupla aprovação)', () => {
  it('só efetiva após cedente E diretoria', async () => {
    const logBefore = await svc.getBudget(log, 'sec-log', MONTH);
    const finBefore = await svc.getBudget(fin, 'sec-fin', MONTH);
    const t = await svc.createTransfer(log, { grantingSectorId: 'sec-fin', amount: 200_000, justification: 'Frete extra urgente', month: MONTH });

    await expect(svc.directorDecide(dir, t.id, true)).rejects.toThrow('cedente');
    await expect(svc.grantorDecide(adm, t.id, true)).rejects.toThrow();

    await svc.grantorDecide(fin, t.id, true);
    expect((await svc.getBudget(log, 'sec-log', MONTH)).ceiling).toBe(logBefore.ceiling);

    await svc.directorDecide(dir, t.id, true);
    expect((await svc.getBudget(log, 'sec-log', MONTH)).ceiling).toBe(logBefore.ceiling + 200_000);
    expect((await svc.getBudget(fin, 'sec-fin', MONTH)).ceiling).toBe(finBefore.ceiling - 200_000);
  });
  it('recusa do cedente cancela e mantém saldos', async () => {
    const before = await svc.getBudget(log, 'sec-log', MONTH);
    const t = await svc.createTransfer(log, { grantingSectorId: 'sec-fin', amount: 200_000, justification: 'Frete extra urgente', month: MONTH });
    await svc.grantorDecide(fin, t.id, false, 'Sem folga');
    await expect(svc.directorDecide(dir, t.id, true)).rejects.toThrow();
    expect((await svc.getBudget(log, 'sec-log', MONTH)).ceiling).toBe(before.ceiling);
  });
  it('cedente não pode ceder mais do que o saldo livre', async () => {
    const b = await svc.getBudget(fin, 'sec-fin', MONTH);
    const t = await svc.createTransfer(log, { grantingSectorId: 'sec-fin', amount: b.available + 100, justification: 'Valor muito alto aqui', month: MONTH });
    await expect(svc.grantorDecide(fin, t.id, true)).rejects.toThrow('saldo livre');
  });
  it('não permite pedir ao próprio setor', async () => {
    await expect(
      svc.createTransfer(log, { grantingSectorId: 'sec-log', amount: 100, justification: 'Justificativa válida', month: MONTH }),
    ).rejects.toThrow('diferente');
  });
});
