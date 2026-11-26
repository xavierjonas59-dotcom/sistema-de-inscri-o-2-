import { describe, expect, it } from 'vitest';
import { emptyContent } from './sc';
import type { PurchaseRequest } from './types';
import { buildAuthorizationEmail, mailtoUrl, parseEmails } from './emailRequest';

const sc = {
  ...emptyContent(),
  number: 'SC-2026-0007',
  supplierName: 'Oficina Mecânica',
  items: [
    { description: 'Troca de pneus', quantity: 6, unitPrice: 210_000, discount: 60_000, surcharge: 0 },
    { description: 'Alinhamento', quantity: 1, unitPrice: 10_000, discount: 0, surcharge: 0 },
  ],
} as PurchaseRequest;

describe('e-mail de autorização', () => {
  it('monta assunto e corpo com número, valor, setor e link', () => {
    const { subject, body } = buildAuthorizationEmail(sc, 'Logística', 'https://x/#/sc/ver?id=1');
    expect(subject).toContain('SC-2026-0007');
    expect(subject).toContain('12.100,00');
    expect(body).toContain('Troca de pneus (+1 item)');
    expect(body).toContain('setor Logística');
    expect(body).toContain('Oficina Mecânica');
    expect(body).toContain('https://x/#/sc/ver?id=1');
  });
  it('mailto codifica tudo e omite Cc vazio', () => {
    const url = mailtoUrl(['a@b.com', 'c@d.com'], [], 'Assunto & teste', 'Linha 1\nLinha 2');
    expect(url.startsWith('mailto:a%40b.com%2Cc%40d.com?')).toBe(true);
    expect(url).not.toContain('cc=');
    expect(url).toContain('subject=Assunto%20%26%20teste');
    expect(url).toContain('Linha%201%0D%0ALinha%202');
    expect(mailtoUrl(['a@b.com'], ['e@f.com'], 's', 'b')).toContain('cc=e%40f.com');
  });
  it('separa e-mails por vírgula, ponto e vírgula ou espaço', () => {
    expect(parseEmails(' a@b.com; c@d.com,  ,e@f.com ')).toEqual(['a@b.com', 'c@d.com', 'e@f.com']);
  });
});
