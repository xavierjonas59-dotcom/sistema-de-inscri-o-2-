import { beforeEach, describe, expect, it } from 'vitest';
import { currentMonth, money } from '@/domain/format';
import { emptyContent, scTotal } from '@/domain/sc';
import type { PurchaseRequest, ScContent, User } from '@/domain/types';
import { LocalDataService } from './LocalDataService';
import { memory } from './testUtils';
import { DEMO_PASSWORD } from './seed';

/** PNG 1×1 transparente: assinatura de teste. */
const TEST_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const NOW = new Date(2026, 10, 18, 12);
const MONTH = currentMonth(NOW);
const CTX = { ip: '10.0.0.1' };
const pdf = { name: 'nf.pdf', mimeType: 'application/pdf', size: 1000, url: 'data:application/pdf;base64,AA==' };
const PW = DEMO_PASSWORD;

let svc: LocalDataService;
let func: User, silvio: User, victor: User, manoel: User, ana: User, felipe: User, stwart: User, fin: User, admin: User;

beforeEach(async () => {
  svc = new LocalDataService(memory(), () => NOW);
  const login = (e: string) => svc.login(e, PW);
  [func, silvio, victor, manoel, ana, felipe, stwart, fin, admin] = await Promise.all(
    [
      'funcionario.logistica@amcomercial.demo', 'silvio@amcomercial.com.br', 'victor@amcomercial.com.br', 'manoel@amcomercial.com.br',
      'ana@amcomercial.com.br', 'felipe@amcomercial.com.br', 'vendas.revenda@amcomercial.com.br', 'contas.pagar@amcomercial.demo', 'admin@amcomercial.demo',
    ].map(login),
  );
  for (const u of [silvio, victor, manoel, ana, felipe, stwart]) Object.assign(u, await svc.setMySignature(u, TEST_SIGNATURE));
});

function content(total = 100_000): ScContent {
  return {
    ...emptyContent(),
    supplierId: 'sup-4',
    supplierName: 'Papelaria Central (exemplo)',
    supplierCode: '1004',
    natureId: 'nat-2',
    apportionment: [{ costCenterId: 'cc-2', percent: 100 }],
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
    const d = await svc.saveDraft(func, null, { ...content(), apportionment: [{ costCenterId: 'cc-2', percent: 60 }] });
    await expect(svc.submit(func, d.id, null, CTX)).rejects.toThrow('100%');
  });
});

describe('aprovação do setor (gestor ou diretor do setor)', () => {
  it('gestor aprova escolhendo o diretor que vai liberar o pagamento', async () => {
    const sc = await newSc();
    await expect(svc.managerApprove(silvio, sc.id, PW, CTX, '')).rejects.toThrow('Escolha o diretor');
    const ok = await svc.managerApprove(silvio, sc.id, PW, CTX, victor.id);
    expect(ok.assignedDirectorName).toBe('Victor Chroniaris');
    expect((await svc.listNotifications(victor)).some((n) => n.scId === sc.id)).toBe(true);
    expect((await svc.listNotifications(manoel)).some((n) => n.scId === sc.id)).toBe(false);
  });
  it('o diretor do setor também pode aprovar a etapa do setor (só do próprio setor)', async () => {
    const sc = await newSc();
    expect((await svc.managerApprove(victor, sc.id, PW, CTX, manoel.id)).signatures.COMPRA?.name).toBe('Victor Chroniaris');
    const sc2 = await newSc();
    await expect(svc.managerApprove(felipe, sc2.id, PW, CTX, manoel.id)).rejects.toThrow();
  });
  it('diretores com limite de R$ 10 mil não podem ser escolhidos acima disso', async () => {
    const sc = await newSc(1_000_001);
    await expect(svc.managerApprove(silvio, sc.id, PW, CTX, victor.id)).rejects.toThrow('não pode liberar este valor');
    await expect(svc.managerApprove(silvio, sc.id, PW, CTX, felipe.id)).rejects.toThrow();
    expect((await svc.managerApprove(silvio, sc.id, PW, CTX, ana.id)).assignedDirectorId).toBe(ana.id);
  });
  it('exatamente R$ 10.000 ainda pode ser liberado por Felipe/Victor', async () => {
    const sc = await newSc(1_000_000);
    await svc.managerApprove(silvio, sc.id, PW, CTX, victor.id);
    expect((await svc.directorApprove(victor, sc.id, PW, CTX)).status).toBe('AGUARDANDO_NF');
  });
});

describe('liberação do pagamento (diretoria)', () => {
  it('só o diretor escolhido libera; gestor nunca assina a Autorização de Pagamento', async () => {
    const sc = await newSc();
    await svc.managerApprove(silvio, sc.id, PW, CTX, victor.id);
    await expect(svc.directorApprove(manoel, sc.id, PW, CTX)).rejects.toThrow('Victor');
    await expect(svc.directorApprove(silvio, sc.id, PW, CTX)).rejects.toThrow('Acesso negado');
    await expect(svc.directorApprove({ ...silvio, role: 'DIRETORIA' }, sc.id, PW, CTX)).rejects.toThrow('Acesso negado');
    expect((await svc.directorApprove(victor, sc.id, PW, CTX)).signatures.PAGAMENTO?.name).toBe('Victor Chroniaris');
  });
  it('diretor pode encaminhar para outro diretor liberar', async () => {
    const sc = await newSc();
    await svc.managerApprove(silvio, sc.id, PW, CTX, victor.id);
    await expect(svc.forwardToDirector(manoel, sc.id, ana.id, '')).rejects.toThrow();
    const fw = await svc.forwardToDirector(victor, sc.id, manoel.id, 'Prefiro que o Manoel avalie');
    expect(fw.assignedDirectorName).toBe('Manoel Chroniaris');
    await expect(svc.directorApprove(victor, sc.id, PW, CTX)).rejects.toThrow();
    expect((await svc.directorApprove(manoel, sc.id, PW, CTX)).status).toBe('AGUARDANDO_NF');
  });
  it('a reprovação na etapa da diretoria é só do diretor escolhido', async () => {
    const sc = await newSc();
    await svc.managerApprove(silvio, sc.id, PW, CTX, ana.id);
    await expect(svc.reject(manoel, sc.id, 'não')).rejects.toThrow();
    expect((await svc.reject(ana, sc.id, 'Fora do orçamento')).status).toBe('REPROVADA');
  });
  it('SC criada pelo gestor já vai para o diretor escolhido, com a Autorização de Compra dele', async () => {
    const d = await svc.saveDraft(silvio, null, content());
    await expect(svc.submit(silvio, d.id, PW, CTX)).rejects.toThrow('Escolha o diretor');
    const sc = await svc.submit(silvio, d.id, PW, CTX, antonioId());
    expect(sc.status).toBe('AGUARDANDO_DIRETORIA');
    expect(sc.signatures.COMPRA?.userId).toBe(silvio.id);
    expect(sc.assignedDirectorName).toBe('Antônio Chroniaris');
  });
});
const antonioId = () => 'dir-antonio';

describe('permissões gerais', () => {
  it('funcionário só vê as próprias SCs; financeiro só vê as liberadas; gestor de outro setor não vê', async () => {
    const sc = await newSc();
    expect((await svc.listRequests(func)).every((r) => r.requesterId === func.id)).toBe(true);
    expect((await svc.listRequests(fin)).every((r) => ['ENVIADA_FINANCEIRO', 'PAGA'].includes(r.status))).toBe(true);
    await expect(svc.getRequest(stwart, sc.id)).rejects.toThrow('não encontrada');
  });
  it('gestor só cria Funcionário do próprio setor e não edita usuários de fora', async () => {
    const u = await svc.saveUser(silvio, { name: 'Novo Colaborador', email: 'novo@x.com', role: 'DIRETORIA', sectorId: 'sec-com', cargo: '', active: true, password: '123456' });
    expect([u.role, u.sectorId]).toEqual(['FUNCIONARIO', 'sec-log']);
    expect((await svc.listUsers(silvio)).every((x) => x.sectorId === 'sec-log')).toBe(true);
    const outro = (await svc.listUsers(admin)).find((x) => x.id === 'fun-com')!;
    await expect(svc.saveUser(silvio, { ...outro, name: 'Hack' })).rejects.toThrow('próprio setor');
  });
  it('assinatura exige senha correta e assinatura cadastrada', async () => {
    const sc = await newSc();
    await expect(svc.managerApprove(silvio, sc.id, 'errada', CTX, manoel.id)).rejects.toThrow('Senha incorreta');
    await svc.setMySignature(silvio, null);
    await expect(svc.managerApprove(silvio, sc.id, PW, CTX, manoel.id)).rejects.toThrow('Cadastre a sua assinatura');
  });
});

describe('limite compartilhado do setor', () => {
  it('reserva na aprovação do setor, consome na diretoria e devolve ao reprovar', async () => {
    const b0 = await svc.getBudget(func, 'sec-log', MONTH);
    const sc = await newSc(100_000);
    expect((await svc.getBudget(func, 'sec-log', MONTH)).available).toBe(b0.available);
    await svc.managerApprove(silvio, sc.id, PW, CTX, manoel.id);
    const b1 = await svc.getBudget(func, 'sec-log', MONTH);
    expect(b1.reserved).toBe(b0.reserved + 100_000);
    await svc.directorApprove(manoel, sc.id, PW, CTX);
    const b2 = await svc.getBudget(func, 'sec-log', MONTH);
    expect([b2.reserved, b2.consumed]).toEqual([b0.reserved, b0.consumed + 100_000]);
    const sc2 = await newSc(50_000);
    await svc.managerApprove(silvio, sc2.id, PW, CTX, manoel.id);
    await svc.reject(manoel, sc2.id, 'Sem orçamento');
    expect((await svc.getBudget(func, 'sec-log', MONTH)).available).toBe(b2.available);
  });
  it('bloqueia acima do saldo dizendo quanto falta', async () => {
    const b = await svc.getBudget(silvio, 'sec-log', MONTH);
    const sc = await newSc(b.available + 12_345);
    await expect(svc.managerApprove(silvio, sc.id, PW, CTX, manoel.id)).rejects.toThrow(`Faltam ${money(12_345)}`);
  });
  it('alteração após aprovar volta a SC, invalida a assinatura, limpa o diretor escolhido e recalcula a reserva', async () => {
    const b0 = await svc.getBudget(silvio, 'sec-log', MONTH);
    const sc = await newSc(100_000);
    await svc.managerApprove(silvio, sc.id, PW, CTX, manoel.id);
    const edited = await svc.managerEdit(silvio, sc.id, content(80_000));
    expect([edited.status, edited.assignedDirectorId]).toEqual(['AGUARDANDO_GESTOR', null]);
    expect(edited.signatures.COMPRA?.invalidatedAt).toBeTruthy();
    expect(edited.changes.some((c) => c.field === 'Total geral' && c.before === money(100_000) && c.after === money(80_000))).toBe(true);
    await svc.managerApprove(silvio, sc.id, PW, CTX, manoel.id);
    expect((await svc.getBudget(silvio, 'sec-log', MONTH)).reserved).toBe(b0.reserved + 80_000);
  });
});

describe('fluxo completo', () => {
  it('funcionário → gestor → diretor → NF → financeiro → paga', async () => {
    let sc: PurchaseRequest = await newSc();
    sc = await svc.managerApprove(silvio, sc.id, PW, CTX, victor.id);
    expect(sc.signatures.COMPRA?.ip).toBe('10.0.0.1');
    sc = await svc.directorApprove(victor, sc.id, PW, CTX);
    await expect(svc.sendToFinance(func, sc.id)).rejects.toThrow('nota fiscal');
    await svc.addAttachment(func, sc.id, 'NF', pdf);
    sc = await svc.sendToFinance(func, sc.id);
    await expect(svc.markPaid(silvio, sc.id, '2026-11-20', pdf)).rejects.toThrow();
    sc = await svc.markPaid(fin, sc.id, '2026-11-20', pdf);
    expect(sc.status).toBe('PAGA');
    expect((await svc.validate(sc.number))?.signatures.map((s) => s.valid)).toEqual([true, true]);
  });
  it('devolução e reprovação exigem motivo', async () => {
    const sc = await newSc();
    await expect(svc.returnForAdjustment(silvio, sc.id, ' ')).rejects.toThrow('motivo');
    await svc.returnForAdjustment(silvio, sc.id, 'Anexar orçamento');
    await svc.saveDraft(func, sc.id, content(90_000));
    await svc.submit(func, sc.id, null, CTX);
    await expect(svc.reject(silvio, sc.id, '')).rejects.toThrow('motivo');
    expect((await svc.reject(silvio, sc.id, 'Desnecessário')).status).toBe('REPROVADA');
  });
});

describe('acesso e e-mail', () => {
  it('esqueci a senha avisa o admin só se o e-mail existir', async () => {
    await svc.requestPasswordReset('ninguem@x.com');
    expect((await svc.listNotifications(admin)).length).toBe(0);
    await svc.requestPasswordReset('SILVIO@amcomercial.com.br');
    expect((await svc.listNotifications(admin)).some((n) => n.text.includes('Silvio Crispim'))).toBe(true);
  });
  it('troca de senha confere a atual e o tamanho', async () => {
    await expect(svc.changePassword(func, 'x', 'novasenha')).rejects.toThrow('Senha atual incorreta');
    await expect(svc.changePassword(func, PW, '123')).rejects.toThrow('6');
    await svc.changePassword(func, PW, 'novasenha');
    await expect(svc.login(func.email, PW)).rejects.toThrow();
    expect((await svc.login(func.email, 'novasenha')).id).toBe(func.id);
  });
  it('pedido de autorização por e-mail fica na linha do tempo', async () => {
    const sc = await newSc();
    expect(await svc.approverEmails(func, sc.id)).toEqual(expect.arrayContaining(['silvio@amcomercial.com.br', 'victor@amcomercial.com.br']));
    await expect(svc.logEmailRequest(func, sc.id, ['invalido'], [])).rejects.toThrow('E-mail inválido');
    const r = await svc.logEmailRequest(func, sc.id, ['silvio@amcomercial.com.br'], ['ana@amcomercial.com.br']);
    expect(r.timeline.at(-1)?.action).toBe('Notificou por e-mail');
    await expect(svc.logEmailRequest(stwart, sc.id, ['a@b.com'], [])).rejects.toThrow();
    await svc.managerApprove(silvio, sc.id, PW, CTX, ana.id);
    expect(await svc.approverEmails(func, sc.id)).toEqual(['ana@amcomercial.com.br']);
  });
});

describe('início: gastos por mês e por natureza', () => {
  it('funcionário só vê o próprio setor, mesmo pedindo outro ou a empresa', async () => {
    const own = await svc.spendingByMonth(func, null, 6);
    const asked = await svc.spendingByMonth(func, 'sec-com', 6);
    const company = await svc.spendingByMonth(manoel, null, 6);
    expect(own).toEqual(asked);
    expect(own).toHaveLength(6);
    expect(own.at(-1)?.month).toBe(MONTH);
    const sum = (r: { consumed: number }[]) => r.reduce((s, x) => s + x.consumed, 0);
    expect(sum(company)).toBeGreaterThan(sum(own));
  });
  it('soma o consumido do mês por natureza, do maior para o menor', async () => {
    const sc = await newSc(100_000);
    await svc.managerApprove(silvio, sc.id, PW, CTX, manoel.id);
    const before = await svc.spendingByNature(manoel, 'sec-log', MONTH);
    await svc.directorApprove(manoel, sc.id, PW, CTX);
    const after = await svc.spendingByNature(manoel, 'sec-log', MONTH);
    const nat = (r: typeof after) => r.find((x) => x.natureId === 'nat-2')?.consumed ?? 0;
    expect(nat(after) - nat(before)).toBe(100_000);
    expect([...after].sort((a, b) => b.consumed - a.consumed)).toEqual(after);
    expect((await svc.spendingByMonth(manoel, 'sec-log', 1))[0].consumed).toBe(after.reduce((s, x) => s + x.consumed, 0));
  });
  it('detalhe do mês: cada SC aprovada com os itens; soma igual ao gráfico; abre só o que a pessoa pode ver', async () => {
    const sc = await newSc(100_000);
    await svc.managerApprove(silvio, sc.id, PW, CTX, manoel.id);
    await svc.directorApprove(manoel, sc.id, PW, CTX);
    const rows = await svc.spendingDetails(manoel, null, MONTH);
    const company = (await svc.spendingByMonth(manoel, null, 1))[0].consumed;
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(company);
    const mine = (await svc.spendingDetails(func, 'sec-com', MONTH)).find((r) => r.id === sc.id)!;
    expect(mine.items[0].total).toBe(100_000);
    expect(mine.canOpen).toBe(true);
    const funcRows = await svc.spendingDetails(func, null, MONTH);
    expect(funcRows.every((r) => r.sectorId === 'sec-log')).toBe(true);
    expect((await svc.spendingDetails(admin, null, MONTH)).every((r) => !r.canOpen)).toBe(true);
  });
});

describe('conversa na SC', () => {
  it('participantes escrevem, os outros são avisados e quem não vê a SC não escreve', async () => {
    const sc = await newSc();
    await svc.postMessage(silvio, sc.id, 'Qual é o prazo de entrega?');
    expect((await svc.listNotifications(func)).some((n) => n.text.includes('Qual é o prazo'))).toBe(true);
    const r = await svc.postMessage(func, sc.id, 'Entrega em 5 dias.');
    expect(r.messages.map((m) => m.userName)).toEqual(['Silvio Crispim', func.name]);
    await expect(svc.postMessage(stwart, sc.id, 'oi')).rejects.toThrow();
    await expect(svc.postMessage(admin, sc.id, 'oi')).rejects.toThrow();
    await expect(svc.postMessage(func, sc.id, '   ')).rejects.toThrow('mensagem');
    await svc.reject(silvio, sc.id, 'Fora do orçamento');
    await expect(svc.postMessage(func, sc.id, 'Mas por quê?')).rejects.toThrow('encerrada');
  });
});

describe('limites da diretoria', () => {
  it('só o Admin recebe o limite; a lista para o valor já vem filtrada', async () => {
    expect((await svc.listDirectors(silvio)).every((d) => d.paymentLimit === undefined)).toBe(true);
    expect((await svc.listDirectors(admin)).find((d) => d.id === felipe.id)?.paymentLimit).toBe(1_000_000);
    const for12k = (await svc.listDirectors(silvio, 1_200_000)).map((d) => d.name);
    expect(for12k).not.toContain('Victor Chroniaris');
    expect(for12k).toContain('Manoel Chroniaris');
  });
});
