import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/assets/logo-am-comercial.jpg', () => ({
  default: 'data:image/jpeg;base64,' + readFileSync(new URL('../assets/logo-am-comercial.jpg', import.meta.url)).toString('base64'),
}));

import { LocalDataService, type KeyValueStore } from '@/services/LocalDataService';
import { DEMO_PASSWORD } from '@/services/seed';
import { PDFDocument } from 'pdf-lib';
import { buildPackagePdf, buildScPdf } from './scPdf';

const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) };
};

describe('PDF da Solicitação de Compras', () => {
  it('gera a SC e o pacote para o financeiro', async () => {
    const svc = new LocalDataService(memory(), () => new Date(2026, 10, 18, 12));
    const fin = await svc.login('financeiro@amcomercial.demo', DEMO_PASSWORD);
    const admin = await svc.login('admin@amcomercial.demo', DEMO_PASSWORD);
    const [cc, nat] = [await svc.listCostCenters(admin), await svc.listNatures(admin)];
    const sc = (await svc.listRequests(fin)).find((r) => r.items[0].description === 'PÃES')!;
    const names = {
      sector: 'Logística',
      nature: nat.filter((n) => n.id === sc.natureId).map((n) => `${n.code} - ${n.name}`)[0],
      costCenter: (id: string) => cc.filter((c) => c.id === id).map((c) => `${c.code} - ${c.name}`)[0] ?? '',
    };
    const doc = await buildScPdf(sc, names);
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(5000);
    const pkg = await buildPackagePdf(sc, names);
    // SC + NF + comprovante de pagamento (pagamento PIX: sem boleto)
    expect((await PDFDocument.load(pkg)).getPageCount()).toBe(3);
    if (process.env.PDF_OUT) {
      writeFileSync(`${process.env.PDF_OUT}/sc.pdf`, Buffer.from(bytes));
      writeFileSync(`${process.env.PDF_OUT}/pacote.pdf`, Buffer.from(pkg));
    }
  });
});
