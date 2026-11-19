import { beforeEach, describe, expect, it } from 'vitest';
import { currentMonth } from '@/domain/format';
import { money } from '@/domain/format';
import { emptyContent, scTotal } from '@/domain/sc';
import type { PurchaseRequest, ScContent, User } from '@/domain/types';
import { LocalDataService, type KeyValueStore } from './LocalDataService';
import { DEMO_PASSWORD } from './seed';

const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) };
};
const NOW = new Date(2026, 10, 18, 12);
const MONTH = currentMonth(NOW);
const CTX = { ip: '10.0.0.1' };
const pdf = { name: 'nf.pdf', mimeType: 'application/pdf', size: 1000, url: 'data:application/pdf;base64,AA==' };

let svc: LocalDataService;
let func: User, gLog: User, dir: User, fin: User, admin: User, gCom: User;
const login = (who: string) => svc.login(`${who}@amcomercial.demo`, DEMO_PASSWORD);

beforeEach(async () => {
  svc = new LocalDataService(memory(), () => NOW);
  [func, gLog, dir, fin, admin, gCom] = await Promise.all(
    ['funcionario.logistica', 'gestor.logistica', 'diretoria', 'financeiro', 'admin', 'gestor.comercial'].map(login),
  );
});

function content(total = 100_000): ScContent {
  return {
    ...emptyContent(),
    supplierId: 'sup-6',
    supplierName: 'Papelaria Central',
    supplierCode: '1006',
    natureId: 'nat-2',
    apportionment: [{ costCenterId: 'cc-3', percent: 100 }],
    items: [{ description: 'Papel A4', quantity: 1, unitPrice: total, discount: 0, surcharge: 0 }],
  };
}

async function newSc(total = 100_000) {
  const d = await svc.saveDraft(func, null, content(total));
  return svc.submit(func, d.id, null, CTX);
}

describe('formulário e numeração', () => {
  it('numera SC sequencialmente no formato SC-AAAA-0000', async () => {
    const a = await svc.saveDraft(func, null, content());
    const b = await svc.saveDraft(func, null, content());
    expect(a.number).toMatch(/^SC-2026-\d{4}$/);
    expect(Number(b.number.slice(-4))).toBe(Number(a.number.slice(-4)) + 1);
  });
  it('total do item = qtd × unitário − desconto + acréscimo', () => {
    expect(scTotal({ items: [{ description: 'x', quantity: 84, unitPrice: 1800, discount: 500, surcharge: 200 }] })).toBe(84 * 1800 - 500 + 200);
  });
  it('exige rateio somando 100%', async () => {
    const d = await svc.saveDraft(func, null, { ...content(), apportionment: [{ costCenterId: 'cc-3', percent: 60 }] });
    await expect(svc.submit(func, d.id, null, CTX)).rejects.toThrow('100%');
  });
});

describe('permissões (validadas no serviço, não na tela)', () => {
  it('gestor NUNCA assina a Autorização de Pagamento, nem chamando direto', async () => {
    const sc = await newSc();
    await svc.managerApprove(gLog, sc.id, DEMO_PASSWORD, CTX);
    await expect(svc.directorApprove(gLog, sc.id, DEMO_PASSWORD, CTX)).rejects.toThrow('Acesso negado');
    const forged = { ...gLog, role: 'DIRETORIA' as const };
    await expect(svc.directorApprove(forged, sc.id, DEMO_PASSWORD, CTX)).rejects.toThrow('Acesso negado');
  });
  it('funcionário não aprova; gestor de outro setor não vê a SC', async () => {
    const sc = await newSc();
    await expect(svc.managerApprove(func, sc.id, DEMO_PASSWORD, CTX)).rejects.toThrow();
    await expect(svc.getRequest(gCom, sc.id)).rejects.toThrow('não encontrada');
  });
  it('funcionário só vê as próprias SCs; financeiro só vê as liberadas', async () => {
    expect((await svc.listRequests(func)).every((r) => r.requesterId === func.id)).toBe(true);
    expect((await svc.listRequests(fin)).every((r) => ['ENVIADA_FINANCEIRO', 'PAGA'].includes(r.status))).toBe(true);
  });
  it('gestor não vê nem cria usuários de outro setor; quem ele cria vira Funcionário do setor dele', async () => {
    expect((await svc.listUsers(gLog)).every((u) => u.sectorId === 'sec-log')).toBe(true);
    const u = await svc.saveUser(gLog, { name: 'Novo Colaborador', email: 'novo@x.com', role: 'DIRETORIA', sectorId: 'sec-com', cargo: '', active: true, password: '123456' });
    expect(u.role).toBe('FUNCIONARIO');
    expect(u.sectorId).toBe('sec-log');
    const outro = (await svc.listUsers(admin)).find((x) => x.sectorId === 'sec-com' && x.role === 'FUNCIONARIO')!;
    await expect(svc.saveUser(gLog, { ...outro, name: 'Hack' })).rejects.toThrow('próprio setor');
    const gestor2 = (await svc.listUsers(admin)).find((x) => x.id === gLog.id)!;
    await expect(svc.saveUser(gLog, { ...gestor2, active: false })).rejects.toThrow();
  });
  it('somente Admin mexe em setores e limites', async () => {
    await expect(svc.saveSector(dir, { name: 'X', monthlyLimit: 1 })).rejects.toThrow();
    await expect(svc.setOverride(gLog, 'sec-log', MONTH, 999)).rejects.toThrow();
    await svc.setOverride(admin, 'sec-log', MONTH, 999);
  });
  it('assinatura exige senha correta', async () => {
    const sc = await newSc();
    await expect(svc.managerApprove(gLog, sc.id, 'errada', CTX)).rejects.toThrow('Senha incorreta');
  });
});

describe('limite compartilhado do setor', () => {
  it('reserva na aprovação do gestor, consome na diretoria e devolve ao reprovar', async () => {
    const b0 = await svc.getBudget(func, 'sec-log', MONTH);
    const sc = await newSc(100_000);
    expect((await svc.getBudget(func, 'sec-log', MONTH)).available).toBe(b0.available); // aguardando gestor não reserva
    await svc.managerApprove(gLog, sc.id, DEMO_PASSWORD, CTX);
    const b1 = await svc.getBudget(func, 'sec-log', MONTH);
    expect(b1.reserved).toBe(b0.reserved + 100_000);
    expect(b1.available).toBe(b0.available - 100_000);
    await svc.directorApprove(dir, sc.id, DEMO_PASSWORD, CTX);
    const b2 = await svc.getBudget(func, 'sec-log', MONTH);
    expect(b2.reserved).toBe(b0.reserved);
    expect(b2.consumed).toBe(b0.consumed + 100_000);

    const sc2 = await newSc(50_000);
    await svc.managerApprove(gLog, sc2.id, DEMO_PASSWORD, CTX);
    await svc.reject(dir, sc2.id, 'Sem orçamento');
    expect((await svc.getBudget(func, 'sec-log', MONTH)).available).toBe(b2.available);
  });
  it('bloqueia a aprovação do gestor acima do saldo, dizendo quanto falta', async () => {
    const b = await svc.getBudget(gLog, 'sec-log', MONTH);
    const sc = await newSc(b.available + 12_345);
    await expect(svc.managerApprove(gLog, sc.id, DEMO_PASSWORD, CTX)).rejects.toThrow(`Faltam ${money(12_345)}`);
  });
  it('alteração do gestor após aprovar volta a SC, invalida a assinatura e recalcula a reserva', async () => {
    const b0 = await svc.getBudget(gLog, 'sec-log', MONTH);
    const sc = await newSc(100_000);
    await svc.managerApprove(gLog, sc.id, DEMO_PASSWORD, CTX);
    const edited = await svc.managerEdit(gLog, sc.id, { ...content(80_000) });
    expect(edited.status).toBe('AGUARDANDO_GESTOR');
    expect(edited.signatures.COMPRA?.invalidatedAt).toBeTruthy();
    expect(edited.changes.some((c) => c.field === 'Total geral' && c.before === money(100_000) && c.after === money(80_000))).toBe(true);
    await svc.managerApprove(gLog, sc.id, DEMO_PASSWORD, CTX);
    expect((await svc.getBudget(gLog, 'sec-log', MONTH)).reserved).toBe(b0.reserved + 80_000);
  });
});

describe('fluxo completo', () => {
  it('rascunho → gestor → diretoria → NF → financeiro → paga', async () => {
    let sc: PurchaseRequest = await newSc();
    expect(sc.status).toBe('AGUARDANDO_GESTOR');
    expect((await svc.listNotifications(gLog)).some((n) => n.scId === sc.id)).toBe(true);
    sc = await svc.managerApprove(gLog, sc.id, DEMO_PASSWORD, CTX);
    expect(sc.signatures.COMPRA?.ip).toBe('10.0.0.1');
    sc = await svc.directorApprove(dir, sc.id, DEMO_PASSWORD, CTX);
    expect(sc.status).toBe('AGUARDANDO_NF');
    await expect(svc.sendToFinance(func, sc.id)).rejects.toThrow('nota fiscal');
    await svc.addAttachment(func, sc.id, 'NF', pdf);
    sc = await svc.sendToFinance(func, sc.id);
    expect(sc.status).toBe('ENVIADA_FINANCEIRO');
    await expect(svc.markPaid(gLog, sc.id, '2026-11-20', pdf)).rejects.toThrow();
    sc = await svc.markPaid(fin, sc.id, '2026-11-20', pdf);
    expect(sc.status).toBe('PAGA');
    const v = await svc.validate(sc.number);
    expect(v?.signatures.map((s) => s.valid)).toEqual([true, true]);
  });
  it('SC criada pelo gestor já entra como "Aguardando diretoria" com a Autorização de Compra dele', async () => {
    const d = await svc.saveDraft(gLog, null, content());
    const sc = await svc.submit(gLog, d.id, DEMO_PASSWORD, CTX);
    expect(sc.status).toBe('AGUARDANDO_DIRETORIA');
    expect(sc.signatures.COMPRA?.userId).toBe(gLog.id);
  });
  it('devolução exige motivo e volta para o solicitante editar', async () => {
    const sc = await newSc();
    await expect(svc.returnForAdjustment(gLog, sc.id, ' ')).rejects.toThrow('motivo');
    await svc.returnForAdjustment(gLog, sc.id, 'Anexar orçamento');
    const again = await svc.saveDraft(func, sc.id, content(90_000));
    expect(again.changes.length).toBeGreaterThan(0);
    expect((await svc.submit(func, sc.id, null, CTX)).status).toBe('AGUARDANDO_GESTOR');
  });
  it('reprovação exige motivo e encerra', async () => {
    const sc = await newSc();
    await expect(svc.reject(gLog, sc.id, '')).rejects.toThrow('motivo');
    expect((await svc.reject(gLog, sc.id, 'Desnecessário')).status).toBe('REPROVADA');
    await expect(svc.managerApprove(gLog, sc.id, DEMO_PASSWORD, CTX)).rejects.toThrow('status');
  });
});
