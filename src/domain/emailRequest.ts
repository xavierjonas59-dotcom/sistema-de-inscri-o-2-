import { money } from './format';
import { scTotal } from './sc';
import type { PurchaseRequest } from './types';

/** Texto do pedido de autorização: aviso curto com o link para autorizar no sistema (sem anexo). */
export function buildAuthorizationEmail(sc: PurchaseRequest, sectorName: string, link: string) {
  const total = money(scTotal(sc));
  const first = sc.items.find((i) => i.description.trim())?.description.trim() ?? 'itens da solicitação';
  const extra = sc.items.filter((i) => i.description.trim()).length - 1;
  const what = extra > 0 ? `${first} (+${extra} ${extra === 1 ? 'item' : 'itens'})` : first;
  const subject = `Autorização de compra ${sc.number}: ${total}`;
  const body = [
    'Olá,',
    '',
    `Foi solicitada a compra/serviço ${what} para o setor ${sectorName}, no valor de ${total} (${sc.number}), fornecedor ${sc.supplierName || 'não informado'}.`,
    '',
    'Por favor, autorize pelo link:',
    link,
    '',
    'A autorização é feita no sistema, com a sua senha.',
  ].join('\n');
  return { subject, body };
}

/** Endereço mailto: que abre o programa de e-mail (Outlook) com tudo preenchido. */
export function mailtoUrl(to: string[], cc: string[], subject: string, body: string) {
  const enc = (s: string) => encodeURIComponent(s).replace(/%0A/g, '%0D%0A');
  const params = [cc.length ? `cc=${enc(cc.join(','))}` : '', `subject=${enc(subject)}`, `body=${enc(body)}`].filter(Boolean);
  return `mailto:${enc(to.join(','))}?${params.join('&')}`;
}

/** "a@b.com; c@d.com, e@f.com" → ['a@b.com', 'c@d.com', 'e@f.com'] */
export const parseEmails = (text: string) =>
  text
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
