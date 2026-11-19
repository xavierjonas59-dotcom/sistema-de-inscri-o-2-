import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import logoUrl from '@/assets/logo-am-comercial.jpg';
import { PAYMENT_METHODS, contentHash, itemTotal, scTotal } from '@/domain/sc';
import type { AppliedSignature, Attachment, PurchaseRequest } from '@/domain/types';

export interface PdfNames {
  sector: string;
  nature: string;
  costCenter: (id: string) => string;
}

const BLUE: [number, number, number] = [40, 44, 141];
const INK: [number, number, number] = [38, 41, 48];
const GRID: [number, number, number] = [120, 124, 140];
const ITEM_ROWS = 8;

const brl = (cents: number) =>
  'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const brDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(blob);
  });
}

/** Endereço da página de validação aberta pelo QR code. */
export const validationUrl = (number: string) =>
  `${typeof location !== 'undefined' ? location.origin + location.pathname : ''}#/validar?sc=${encodeURIComponent(number)}`;

/**
 * Gera a Solicitação de Compras em A4 no layout da planilha "C.I (1 por página)":
 * logo, título, faixas azuis, mesma ordem de blocos e rodapé com 4 assinaturas.
 */
export async function buildScPdf(sc: PurchaseRequest, names: PdfNames): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const L = 10;
  const R = 200;
  const W = R - L;
  const currentHash = await contentHash(sc);

  const band = (y: number, h: number, cells: { x: number; w: number; text: string; align?: 'left' | 'center' | 'right' }[]) => {
    doc.setFillColor(...BLUE);
    doc.rect(L, y, W, h, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    for (const c of cells) {
      const tx = c.align === 'center' ? c.x + c.w / 2 : c.align === 'right' ? c.x + c.w - 2 : c.x + 2;
      doc.text(c.text, tx, y + h / 2 + 1.1, { align: c.align ?? 'left' });
    }
    doc.setTextColor(...INK);
  };
  const box = (x: number, y: number, w: number, h: number) => {
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.2);
    doc.rect(x, y, w, h);
  };
  const label = (text: string, x: number, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(text, x, y);
  };
  const value = (text: string, x: number, y: number, opts: { align?: 'left' | 'right' | 'center'; size?: number; maxWidth?: number } = {}) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(opts.size ?? 8.5);
    const t = opts.maxWidth ? (doc.splitTextToSize(text, opts.maxWidth)[0] as string) : text;
    doc.text(t, x, y, { align: opts.align ?? 'left' });
  };

  // ---- Cabeçalho: logo, título, número e QR
  const logo = await toDataUrl(logoUrl);
  doc.addImage(logo, 'JPEG', L, 8, 22, 22);
  doc.setTextColor(...BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('SOLICITAÇÃO DE COMPRAS', 105, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(sc.number, 105, 25, { align: 'center' });
  const qr = await QRCode.toDataURL(validationUrl(sc.number), { margin: 0, width: 240, errorCorrectionLevel: 'M' });
  doc.addImage(qr, 'PNG', R - 20, 8, 20, 20);
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Validar documento', R - 10, 30.5, { align: 'center' });

  // ---- Fornecedor / código / data / contato
  let y = 34;
  box(L, y, W, 14);
  label('FORNECEDOR:', L + 2, y + 5);
  value(sc.supplierName, L + 24, y + 5, { maxWidth: 88 });
  label('CÓDIGO:', 118, y + 5);
  value(sc.supplierCode, 132, y + 5);
  label('DATA:', 158, y + 5);
  value(brDate(sc.date), 168, y + 5);
  label('CONTATO:', L + 2, y + 11);
  value(sc.contact, L + 24, y + 11, { maxWidth: 160 });

  // ---- Forma de pagamento | Rateio C.C. | Parcelas
  y += 16;
  const c1 = L;
  const c1w = 52;
  const c2 = c1 + c1w;
  const c2w = 74;
  const c3 = c2 + c2w;
  const c3w = R - c3;
  band(y, 6, [
    { x: c1, w: c1w, text: 'FORMA DE PAGAMENTO' },
    { x: c2, w: c2w, text: 'RATEIO C. C.' },
    { x: c3, w: c3w, text: `PARCELAS: ${sc.installments.length || '—'}` },
  ]);
  y += 6;
  const blockH = 40;
  box(c1, y, c1w, blockH);
  box(c2, y, c2w, blockH);
  box(c3, y, c3w, blockH);
  PAYMENT_METHODS.forEach((m, i) => {
    const yy = y + 5 + i * 6;
    doc.setDrawColor(...INK);
    doc.rect(c1 + 3, yy - 2.8, 3.2, 3.2);
    if (sc.paymentMethod === m.value) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('X', c1 + 3.55, yy - 0.15);
    }
    value(m.label.toUpperCase(), c1 + 9, yy, { size: 7.5 });
  });
  label('C. Custo', c2 + 2, y + 5);
  label('%', c2 + c2w - 3, y + 5);
  doc.setFont('helvetica', 'bold');
  sc.apportionment.slice(0, 5).forEach((a, i) => {
    value(names.costCenter(a.costCenterId), c2 + 2, y + 11 + i * 6, { size: 7.5, maxWidth: c2w - 20 });
    value(`${a.percent.toLocaleString('pt-BR')}%`, c2 + c2w - 2, y + 11 + i * 6, { align: 'right', size: 7.5 });
  });
  for (let i = 0; i < 8; i++) {
    const col = i < 4 ? 0 : 1;
    const row = i % 4;
    const xx = c3 + 2 + col * (c3w / 2);
    const yy = y + 6 + row * 8.5;
    label(`${i + 1}ª`, xx, yy);
    value(sc.installments[i] ? brDate(sc.installments[i].dueDate) : '____/____/______', xx + 6, yy, { size: 7.5 });
  }
  y += blockH + 2;

  // ---- Dados da nota fiscal / Natureza
  band(y, 5.5, [{ x: L, w: W, text: 'DADOS DA NOTA FISCAL' }]);
  y += 5.5;
  box(L, y, W, 7);
  value(sc.invoiceInfo || ' ', L + 2, y + 4.8, { maxWidth: W - 4 });
  y += 9;
  band(y, 5.5, [{ x: L, w: W, text: 'NATUREZA DA COMPRA' }]);
  y += 5.5;
  box(L, y, W, 7);
  value(names.nature, L + 2, y + 4.8);
  y += 9;

  // ---- Itens
  const cols = [
    { t: 'DESCRIÇÃO', w: 70, a: 'left' as const },
    { t: 'QUANTIDADE', w: 20, a: 'center' as const },
    { t: 'VALOR UND', w: 25, a: 'right' as const },
    { t: 'DESCONTOS', w: 23, a: 'right' as const },
    { t: 'ACRÉSCIMOS', w: 23, a: 'right' as const },
    { t: 'VALOR TOTAL', w: 29, a: 'right' as const },
  ];
  let x = L;
  band(y, 6, cols.map((c) => { const cell = { x, w: c.w, text: c.t, align: c.a === 'left' ? 'left' as const : 'center' as const }; x += c.w; return cell; }));
  y += 6;
  const rowH = 6;
  for (let r = 0; r < ITEM_ROWS; r++) {
    const it = sc.items[r];
    x = L;
    cols.forEach((c, ci) => {
      box(x, y, c.w, rowH);
      if (it) {
        const vals = [it.description, it.quantity.toLocaleString('pt-BR'), brl(it.unitPrice), it.discount ? brl(it.discount) : '-', it.surcharge ? brl(it.surcharge) : '-', brl(itemTotal(it))];
        const tx = c.a === 'right' ? x + c.w - 2 : c.a === 'center' ? x + c.w / 2 : x + 2;
        value(vals[ci], tx, y + 4.1, { align: c.a, size: 8, maxWidth: c.w - 3 });
      }
      x += c.w;
    });
    y += rowH;
  }
  if (sc.items.length > ITEM_ROWS) {
    value(`+ ${sc.items.length - ITEM_ROWS} item(ns) adicionais incluídos no total`, L + 2, y + 3.5, { size: 7 });
    y += 4;
  }
  y += 2;

  // ---- Dados bancários
  band(y, 5.5, [{ x: L, w: W, text: 'DADOS BANCÁRIOS' }]);
  y += 5.5;
  box(L, y, W, 13);
  label('Banco:', L + 2, y + 5);
  value(sc.bankData.bank, L + 14, y + 5);
  label('Agência/DV:', 80, y + 5);
  value(sc.bankData.agency, 98, y + 5);
  label('Conta/DV:', 135, y + 5);
  value(sc.bankData.account, 150, y + 5);
  label('Chave PIX:', L + 2, y + 10.5);
  value(sc.bankData.pix, L + 20, y + 10.5, { maxWidth: 170 });
  y += 15;

  // ---- Total geral
  band(y, 8, [{ x: L, w: W, text: 'TOTAL GERAL' }]);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(brl(scTotal(sc)), R - 3, y + 5.6, { align: 'right' });
  doc.setTextColor(...INK);
  y += 11;

  // ---- Assinaturas: Solicitante | Conferente | Autorização de Compra | Autorização de Pagamento
  const sw = W / 4;
  const sh = 46;
  const slots = ['SOLICITANTE', 'CONFERENTE', 'AUTORIZAÇÃO DE COMPRA', 'AUTORIZAÇÃO DE PAGAMENTO'];
  band(y, 5.5, slots.map((t, i) => ({ x: L + i * sw, w: sw, text: t, align: 'center' as const })));
  y += 5.5;
  slots.forEach((_, i) => box(L + i * sw, y, sw, sh));
  const lineY = y + 24;
  const centerX = (i: number) => L + i * sw + sw / 2;
  const sigLine = (i: number) => {
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.25);
    doc.line(L + i * sw + 5, lineY, L + (i + 1) * sw - 5, lineY);
  };
  const small = (text: string, i: number, dy: number, bold = false, size = 7) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(doc.splitTextToSize(text, sw - 4)[0] as string, centerX(i), lineY + dy, { align: 'center' });
  };

  // Solicitante: identificação eletrônica do envio (sem imagem de assinatura)
  sigLine(0);
  if (sc.submittedAt) {
    small(sc.requesterName, 0, 4, true, 7.5);
    small('Solicitante', 0, 7.5);
    small(`Enviado eletronicamente em`, 0, 12, false, 6);
    small(brDateTime(sc.submittedAt), 0, 15, false, 6);
  }
  sigLine(1);

  const drawSignature = async (i: number, s: AppliedSignature | undefined) => {
    sigLine(i);
    if (!s) return;
    const valid = !s.invalidatedAt && s.contentHash === currentHash;
    if (valid) {
      const props = doc.getImageProperties(s.imageDataUrl);
      const maxW = sw - 8;
      const maxH = 19;
      const k = Math.min(maxW / props.width, maxH / props.height);
      const w = props.width * k;
      const h = props.height * k;
      doc.addImage(s.imageDataUrl, 'PNG', centerX(i) - w / 2, lineY - h + 0.8, w, h);
    }
    small(s.name, i, 4, true, 7.5);
    small(s.cargo, i, 7.5);
    if (valid) {
      small('Assinado eletronicamente em', i, 12, false, 6);
      small(brDateTime(s.signedAt), i, 15, false, 6);
      small(`Cód. verificação: ${s.code}`, i, 18.5, false, 6);
    } else {
      doc.setTextColor(176, 32, 32);
      small('ASSINATURA INVALIDADA', i, 12, true, 6.5);
      small('conteúdo alterado após assinar', i, 15, false, 6);
      doc.setTextColor(...INK);
    }
  };
  await drawSignature(2, sc.signatures.COMPRA);
  await drawSignature(3, sc.signatures.PAGAMENTO);
  y += sh + 4;

  // ---- Rodapé
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(110, 112, 120);
  doc.text(
    `${sc.number} · Setor ${names.sector} · Gerado em ${brDateTime(new Date().toISOString())} · Confira a autenticidade pelo QR code ou em ${validationUrl(sc.number).replace(/^https?:\/\//, '')}`,
    105,
    290,
    { align: 'center', maxWidth: 190 },
  );
  return doc;
}

const PACKAGE_ORDER: Attachment['kind'][] = ['NF', 'BOLETO', 'COMPROVANTE', 'COMPROVANTE_PAGAMENTO'];

/**
 * Pacote para o Contas a Pagar: Solicitação assinada + NF + boletos + comprovantes, nessa ordem, num único PDF.
 */
export async function buildPackagePdf(sc: PurchaseRequest, names: PdfNames): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const scDoc = await PDFDocument.load((await buildScPdf(sc, names)).output('arraybuffer'));
  (await out.copyPages(scDoc, scDoc.getPageIndices())).forEach((p) => out.addPage(p));
  const files = [...sc.attachments]
    .filter((a) => PACKAGE_ORDER.includes(a.kind))
    .sort((a, b) => PACKAGE_ORDER.indexOf(a.kind) - PACKAGE_ORDER.indexOf(b.kind));
  for (const a of files) {
    const bytes = new Uint8Array(await (await fetch(a.url)).arrayBuffer());
    if (a.mimeType === 'application/pdf') {
      try {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
      } catch {
        const page = out.addPage([595, 842]);
        page.drawText(`Não foi possível incluir o arquivo "${a.name}" (PDF protegido ou inválido).`, { x: 40, y: 800, size: 11 });
      }
    } else {
      const img = a.mimeType === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      const page = out.addPage([595, 842]);
      const k = Math.min(535 / img.width, 782 / img.height, 1);
      page.drawImage(img, { x: (595 - img.width * k) / 2, y: 842 - 30 - img.height * k, width: img.width * k, height: img.height * k });
    }
  }
  return out.save();
}
