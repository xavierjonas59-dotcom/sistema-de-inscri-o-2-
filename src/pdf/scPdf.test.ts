import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/assets/logo-planilha.jpg', () => ({
  default: 'data:image/jpeg;base64,' + readFileSync(new URL('../assets/logo-planilha.jpg', import.meta.url)).toString('base64'),
}));

import { LocalDataService } from '@/services/LocalDataService';
import { memory } from '@/services/testUtils';
import { DEMO_PASSWORD } from '@/services/seed';
import { PDFDocument } from 'pdf-lib';
import { buildPackagePdf, buildScPdf } from './scPdf';

/** Assinatura de teste desenhada por código (traço azul em PNG transparente). */
const SIG = 'data:image/png;base64,' + readFileSync(new URL('./test-signature.png', import.meta.url)).toString('base64');

describe('PDF da Solicitação de Compras', () => {
  it('gera a SC e o pacote para o financeiro', async () => {
    const svc = new LocalDataService(memory(), () => new Date(2026, 10, 18, 12));
    const login = (e: string) => svc.login(e, DEMO_PASSWORD);
    const [func, silvio, ana, fin, admin] = await Promise.all(
      ['funcionario.logistica@amcomercial.demo', 'silvio@amcomercial.com.br', 'ana@amcomercial.com.br', 'contas.pagar@amcomercial.demo', 'admin@amcomercial.demo'].map(login),
    );
    for (const u of [silvio, ana]) Object.assign(u, await svc.setMySignature(u, SIG));
    const [cc, nat] = [await svc.listCostCenters(admin), await svc.listNatures(admin)];
    const base = (await svc.listRequests(func)).find((r) => r.items[0].description === 'PÃES')!;
    const draft = await svc.saveDraft(func, null, { ...base, paymentMethod: 'BOLETO_PARCELADO', installments: [{ dueDate: '2026-11-25' }, { dueDate: '2026-12-25' }] });
    await svc.submit(func, draft.id, null, { ip: '10.0.0.1' });
    await svc.managerApprove(silvio, draft.id, DEMO_PASSWORD, { ip: '10.0.0.1' }, ana.id);
    await svc.directorApprove(ana, draft.id, DEMO_PASSWORD, { ip: '10.0.0.1' });
    await svc.addAttachment(func, draft.id, 'NF', { name: 'nf.pdf', ...(await import('@/services/seed')).demoPdf('NF') });
    await svc.sendToFinance(func, draft.id);
    const sc = await svc.getRequest(fin, draft.id);
    const names = {
      sector: 'Logística',
      nature: nat.filter((n) => n.id === sc.natureId).map((n) => `${n.code} - ${n.name}`)[0],
      costCenter: (id: string) => cc.filter((c) => c.id === id).map((c) => `${c.code} - ${c.name}`)[0] ?? '',
    };
    const doc = await buildScPdf(sc, names);
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(5000);
    const pkg = await buildPackagePdf(sc, names);
    // SC + NF
    expect((await PDFDocument.load(pkg)).getPageCount()).toBe(2);
    if (process.env.PDF_OUT) {
      writeFileSync(`${process.env.PDF_OUT}/sc.pdf`, Buffer.from(bytes));
      writeFileSync(`${process.env.PDF_OUT}/pacote.pdf`, Buffer.from(pkg));
    }
  });
});
