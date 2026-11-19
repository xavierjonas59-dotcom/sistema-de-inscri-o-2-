import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import logoUrl from '@/assets/logo-planilha.jpg';
import { PAYMENT_METHODS, contentHash, itemTotal, scTotal } from '@/domain/sc';
import type { AppliedSignature, Attachment, PurchaseRequest } from '@/domain/types';
import template from './scTemplate.json';

export interface PdfNames {
  sector: string;
  nature: string;
  costCenter: (id: string) => string;
}

/**
 * Planta da aba "C.I (1 por página)" da planilha SOLICITACAO_PAI.xlsb, extraída por script:
 * larguras das colunas B..M e alturas das linhas 1..40 (em pontos), células mescladas,
 * cores, bordas, fontes e alinhamentos. Índices relativos a B1 (linha 0, coluna 0).
 */
interface CellSpec {
  v?: string;
  fill?: string;
  b?: Partial<Record<'l' | 'r' | 't' | 'b', string>>;
  f: [size: number, bold: number, underline: number, color: string];
  a: [h: string, v: string, wrap: number];
  data?: string;
}
const T = template as unknown as {
  cols: number[];
  rows: number[];
  merges: [number, number, number, number][];
  cells: Record<string, CellSpec>;
  logo: { x: number; y: number; w: number; h: number };
  margins: { left: number; right: number; top: number; bottom: number };
};

const PAGE_W = 595.28;
const NAVY = '002060';
const num = (cents: number) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const brDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};
const rgb = (hex: string): [number, number, number] => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
/** Coluna em letra (B..M) e linha (1..40) da planilha → índices do gabarito. */
const ref = (a1: string): [number, number] => [Number(a1.slice(1)) - 1, a1.charCodeAt(0) - 66];

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

/** Desenha o gabarito da planilha em escala (como o Excel com "ajustar à largura de 1 página"). */
class Sheet {
  readonly s: number;
  readonly x0: number;
  readonly y0: number;
  private colX: number[] = [];
  private rowY: number[] = [];
  private master = new Map<string, [number, number, number, number]>();
  private inside = new Map<string, [number, number, number, number]>();

  constructor(private doc: jsPDF) {
    this.x0 = T.margins.left;
    this.y0 = T.margins.top;
    this.s = (PAGE_W - T.margins.left - T.margins.right) / T.cols.reduce((a, b) => a + b, 0);
    let x = this.x0;
    for (const w of T.cols) (this.colX.push(x), (x += w * this.s));
    this.colX.push(x);
    let y = this.y0;
    for (const h of T.rows) (this.rowY.push(y), (y += h * this.s));
    this.rowY.push(y);
    for (const m of T.merges) {
      this.master.set(`${m[0]},${m[1]}`, m);
      for (let r = m[0]; r <= m[2]; r++) for (let c = m[1]; c <= m[3]; c++) this.inside.set(`${r},${c}`, m);
    }
  }

  get bottom() {
    return this.rowY[this.rowY.length - 1];
  }

  /** Retângulo da célula (ou do intervalo mesclado que começa nela). */
  rect(r: number, c: number) {
    const m = this.master.get(`${r},${c}`) ?? [r, c, r, c];
    return { x: this.colX[m[1]], y: this.rowY[m[0]], w: this.colX[m[3] + 1] - this.colX[m[1]], h: this.rowY[m[2] + 1] - this.rowY[m[0]] };
  }
  rectA1(a1: string) {
    return this.rect(...ref(a1));
  }
  spec(a1: string) {
    const [r, c] = ref(a1);
    return T.cells[`${r},${c}`];
  }

  drawGrid() {
    const d = this.doc;
    const entries = Object.entries(T.cells).map(([k, v]) => [k.split(',').map(Number) as [number, number], v] as const);
    // 1. preenchimentos
    for (const [[r, c], sp] of entries) {
      if (!sp.fill || T.rows[r] === 0) continue;
      const m = this.inside.get(`${r},${c}`);
      if (m && (m[0] !== r || m[1] !== c)) continue;
      const box = this.rect(r, c);
      d.setFillColor(...rgb(sp.fill));
      d.rect(box.x, box.y, box.w, box.h, 'F');
    }
    // 2. bordas (sem linhas internas de células mescladas)
    for (const [[r, c], sp] of entries) {
      if (!sp.b || T.rows[r] === 0) continue;
      const m = this.inside.get(`${r},${c}`);
      const x1 = this.colX[c];
      const x2 = this.colX[c + 1];
      const y1 = this.rowY[r];
      const y2 = this.rowY[r + 1];
      const side = (k: 'l' | 'r' | 't' | 'b', ax: number, ay: number, bx: number, by: number, internal: boolean) => {
        const st = sp.b![k];
        if (!st || internal) return;
        d.setDrawColor(0, 0, 0);
        d.setLineWidth(st === 'medium' ? 1 : st === 'thick' ? 1.5 : 0.45);
        d.line(ax, ay, bx, by);
      };
      side('l', x1, y1, x1, y2, !!m && c > m[1]);
      side('r', x2, y1, x2, y2, !!m && c < m[3]);
      side('t', x1, y1, x2, y1, !!m && r > m[0]);
      side('b', x1, y2, x2, y2, !!m && r < m[2]);
    }
    // 3. textos fixos
    for (const [[r, c], sp] of entries) if (sp.v && T.rows[r] !== 0) this.text(r, c, sp.v);
    // 4. logo
    d.addImage(logoSrc, 'JPEG', this.x0 + T.logo.x * this.s, this.y0 + T.logo.y * this.s, T.logo.w * this.s, T.logo.h * this.s);
  }

  /** Escreve um texto com o estilo da célula do gabarito (fonte, cor, alinhamento, quebra). */
  text(r: number, c: number, value: string, override: Partial<{ size: number; bold: boolean; color: string; h: string }> = {}) {
    const d = this.doc;
    const sp = T.cells[`${r},${c}`] ?? { f: [10, 0, 0, '000000'], a: ['general', 'bottom', 0] };
    const box = this.rect(r, c);
    const size = (override.size ?? sp.f[0]) * this.s;
    d.setFont('helvetica', (override.bold ?? !!sp.f[1]) ? 'bold' : 'normal');
    d.setFontSize(size);
    d.setTextColor(...rgb(override.color ?? sp.f[3]));
    const pad = 2.2 * this.s;
    let h = override.h ?? sp.a[0];
    if (h === 'general') h = /^-?[\d.,]+%?$/.test(value.trim()) ? 'right' : 'left';
    const lines: string[] = sp.a[2] ? d.splitTextToSize(value, box.w - pad * 2) : [value];
    const lh = size * 1.15;
    const blockH = lh * lines.length;
    const v = sp.a[1];
    let y = v === 'top' ? box.y + pad + size * 0.8 : v === 'center' ? box.y + (box.h - blockH) / 2 + size * 0.8 : box.y + box.h - pad - blockH + size * 0.8;
    for (const line of lines) {
      const x = h === 'center' || h === 'centerContinuous' ? box.x + box.w / 2 : h === 'right' ? box.x + box.w - pad : box.x + pad;
      const align = h === 'center' || h === 'centerContinuous' ? 'center' : h === 'right' ? 'right' : 'left';
      d.text(line, x, y, { align, baseline: 'alphabetic' });
      if (sp.f[2]) {
        const w = d.getTextWidth(line.trim());
        const sx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x + d.getTextWidth(line) - w;
        d.setLineWidth(0.4);
        d.setDrawColor(...rgb(override.color ?? sp.f[3]));
        d.line(sx, y + size * 0.15, sx + w, y + size * 0.15);
      }
      y += lh;
    }
  }

  textA1(a1: string, value: string, o?: Parameters<Sheet['text']>[3]) {
    this.text(...ref(a1), value, o);
  }

  /** Formato contábil do Excel: "R$" à esquerda e valor à direita ("-" para zero). */
  accounting(a1: string, cents: number, o: { size?: number; bold?: boolean; color?: string } = {}) {
    const d = this.doc;
    const [r, c] = ref(a1);
    const sp = T.cells[`${r},${c}`];
    const box = this.rect(r, c);
    const size = (o.size ?? sp?.f[0] ?? 10) * this.s;
    d.setFont('helvetica', (o.bold ?? !!sp?.f[1]) ? 'bold' : 'normal');
    d.setFontSize(size);
    d.setTextColor(...rgb(o.color ?? sp?.f[3] ?? '000000'));
    const y = box.y + box.h - 2.2 * this.s;
    d.text('R$', box.x + 2.5 * this.s, y);
    d.text(cents ? num(cents) : '-', box.x + box.w - 4 * this.s, y, { align: 'right' });
  }
}

let logoSrc = '';

/**
 * Solicitação de Compras em A4, desenhada célula a célula a partir da planta da planilha
 * (mesmas medidas, cores, bordas e fontes), com os dados da SC e as assinaturas eletrônicas.
 * Abaixo do formulário: registro das assinaturas e QR code de validação.
 */
export async function buildScPdf(sc: PurchaseRequest, names: PdfNames): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  logoSrc = await toDataUrl(logoUrl);
  const sh = new Sheet(doc);
  const s = sh.s;
  sh.drawGrid();

  // Número da SC no canto do título
  const title = sh.rectA1('B1');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(sc.number, title.x + title.w - 6, title.y + title.h - 6, { align: 'right' });

  // Cabeçalho
  sh.textA1('C2', sc.supplierName);
  sh.textA1('I2', sc.supplierCode, { h: 'center' });
  sh.textA1('C3', sc.contact, { size: 10, bold: false });
  sh.textA1('L3', brDate(sc.date));

  // Forma de pagamento: caixas de seleção à esquerda de cada opção (B6..B11)
  PAYMENT_METHODS.forEach((m, i) => {
    const box = sh.rectA1(`B${6 + i}`);
    const size = 7.5 * s * 1.25;
    const bx = box.x + 4 * s;
    const by = box.y + 2.4 * s;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(bx, by, size, size);
    if (sc.paymentMethod === m.value) {
      doc.setLineWidth(0.8);
      doc.line(bx + 1, by + 1, bx + size - 1, by + size - 1);
      doc.line(bx + size - 1, by + 1, bx + 1, by + size - 1);
    }
  });

  // Rateio por centro de custo (D6..D12 / G6..G12)
  sc.apportionment.slice(0, 7).forEach((a, i) => {
    sh.textA1(`D${6 + i}`, names.costCenter(a.costCenterId), { size: 9 });
    sh.textA1(`G${6 + i}`, `${a.percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
  });

  // Parcelas: quantidade (H6:H12); 1ª–3ª e 4ª–6ª na grade; 7ª e 8ª no bloco "PARCELA"
  if (sc.installments.length) sh.textA1('H6', String(sc.installments.length), { size: 14 });
  const dateCell = (a1Label: string, x1: number, x2: number, value: string) => {
    const lab = sh.rectA1(a1Label);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10 * s);
    doc.setTextColor(0, 0, 0);
    doc.text(value, (x1 + x2) / 2, lab.y + lab.h - 2.2 * s, { align: 'center' });
  };
  sc.installments.slice(0, 6).forEach((p, i) => {
    const row = 6 + (i % 3);
    if (i < 3) {
      const a = sh.rectA1(`J${row}`);
      const b = sh.rectA1(`K${row}`);
      dateCell(`I${row}`, a.x, b.x + b.w, brDate(p.dueDate));
    } else {
      const m = sh.rectA1(`M${row}`);
      dateCell(`L${row}`, m.x, m.x + m.w, brDate(p.dueDate));
    }
  });
  const extra = sc.installments.slice(6);
  if (extra.length) {
    sh.textA1('I11', extra.map((_, i) => `${7 + i}°`).join('  '));
    sh.textA1('K11', extra.map((p) => brDate(p.dueDate)).join('  '), { size: extra.length > 1 ? 8 : 10 });
  }

  // Dados da nota fiscal (C13:M14) e natureza (B16:M17)
  if (sc.invoiceInfo) sh.textA1('C13', sc.invoiceInfo, { size: 11, bold: false });
  sh.textA1('B16', names.nature);

  // Itens (linhas 21..28)
  const single = sc.items.length <= 1;
  const size = single ? 14 : 10;
  for (let i = 0; i < 8; i++) {
    const r = 21 + i;
    const it = sc.items[i];
    if (!it) {
      sh.accounting(`M${r}`, 0, { size: 10, bold: true });
      continue;
    }
    sh.textA1(`B${r}`, it.description, { size });
    sh.textA1(`G${r}`, it.quantity.toLocaleString('pt-BR'), { size });
    sh.accounting(`H${r}`, it.unitPrice, { size });
    sh.accounting(`J${r}`, it.discount, { size, color: 'FF0000' });
    sh.accounting(`K${r}`, it.surcharge, { size });
    sh.accounting(`M${r}`, itemTotal(it), { size, bold: true });
  }
  if (sc.items.length > 8) {
    const box = sh.rectA1('B28');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.text(`+ ${sc.items.length - 8} item(ns) incluídos no total`, box.x + 3, box.y + 7);
  }

  // Dados bancários (C30..C33)
  sh.textA1('C30', sc.bankData.bank, { size: 11, bold: false, h: 'left' });
  sh.textA1('C31', sc.bankData.agency, { size: 11, bold: false, h: 'left' });
  sh.textA1('C32', sc.bankData.account, { size: 11, bold: false, h: 'left' });
  if (sc.bankData.pix) {
    sh.textA1('B33', 'Chave PIX:', { size: 11, bold: false, h: 'left' });
    sh.textA1('C33', sc.bankData.pix, { size: 11, bold: false, h: 'left' });
  }

  // Total geral (H34:M35)
  sh.accounting('H34', scTotal(sc), { size: 18, bold: true });

  // Assinaturas: SOLICITANTE (B37:B38) | CONFERENTE (C37:D38) | COMPRA (E37:G38) | PAGAMENTO (H37:M38)
  const currentHash = await contentHash(sc);
  /** Mesma posição da linha "______" do gabarito (texto centralizado verticalmente, fonte 10). */
  const lineY = (a1: string) => {
    const b = sh.rectA1(a1);
    const fs = 10 * s;
    return b.y + (b.h - fs * 1.15) / 2 + fs * 0.8;
  };
  const caption = (a1: string, lines: [string, boolean][]) => {
    const b = sh.rectA1(a1);
    let y = lineY(a1) + 5.4;
    for (const [t, bold] of lines) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 5.2 : 4.3);
      doc.setTextColor(0, 0, 0);
      doc.text(doc.splitTextToSize(t, b.w - 4)[0] as string, b.x + b.w / 2, y, { align: 'center' });
      y += 4.8;
    }
  };
  if (sc.submittedAt) caption('B37', [[sc.requesterName, true], [`Enviado ${brDateTime(sc.submittedAt)}`, false]]);
  const sign = (a1: string, sig?: AppliedSignature) => {
    if (!sig) return;
    const valid = !sig.invalidatedAt && sig.contentHash === currentHash;
    const b = sh.rectA1(a1);
    if (valid) {
      // A assinatura pode passar um pouco da caixa, como a assinatura a caneta no papel.
      const p = doc.getImageProperties(sig.imageDataUrl);
      const maxW = Math.min(b.w - 6, 120);
      const maxH = 30;
      const k = Math.min(maxW / p.width, maxH / p.height);
      const w = p.width * k;
      const h = p.height * k;
      doc.addImage(sig.imageDataUrl, 'PNG', b.x + b.w / 2 - w / 2, lineY(a1) - h + 3, w, h);
      caption(a1, [[`${sig.name} · ${sig.cargo}`, true], [`Assinado eletronicamente em ${brDateTime(sig.signedAt)}`, false]]);
    } else {
      doc.setTextColor(176, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text('ASSINATURA INVALIDADA', b.x + b.w / 2, lineY(a1) - 4, { align: 'center' });
      caption(a1, [[sig.name, true], ['Conteúdo alterado após assinar', false]]);
    }
  };
  sign('E37', sc.signatures.COMPRA);
  sign('H37', sc.signatures.PAGAMENTO);

  // ---- Registro de assinaturas eletrônicas (abaixo do formulário)
  let y = sh.bottom + 18;
  const L = T.margins.left;
  const W = PAGE_W - T.margins.left - T.margins.right;
  doc.setFillColor(...rgb(NAVY));
  doc.rect(L, y, W, 13, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(`REGISTRO DE ASSINATURAS ELETRÔNICAS · ${sc.number}`, L + 5, y + 9);
  y += 13;
  const qrSize = 74;
  const tableW = W - qrSize - 10;
  const cols = [
    { t: 'CAMPO', w: 0.2 },
    { t: 'ASSINADO POR', w: 0.26 },
    { t: 'DATA E HORA', w: 0.17 },
    { t: 'CÓDIGO', w: 0.11 },
    { t: 'SITUAÇÃO', w: 0.26 },
  ];
  const rowsData: string[][] = [];
  if (sc.submittedAt) rowsData.push(['Solicitante', sc.requesterName, brDateTime(sc.submittedAt), '—', 'Envio eletrônico']);
  for (const [label, sig] of [['Autorização de Compra', sc.signatures.COMPRA], ['Autorização de Pagamento', sc.signatures.PAGAMENTO]] as const) {
    if (!sig) rowsData.push([label, '—', '—', '—', 'Aguardando assinatura']);
    else {
      const valid = !sig.invalidatedAt && sig.contentHash === currentHash;
      rowsData.push([label, `${sig.name} (${sig.cargo})`, brDateTime(sig.signedAt), sig.code, valid ? 'Válida para o conteúdo atual' : 'Invalidada: conteúdo alterado']);
    }
  }
  const drawRow = (vals: string[], header: boolean) => {
    let x = L;
    doc.setFont('helvetica', header ? 'bold' : 'normal');
    doc.setFontSize(header ? 6 : 6.5);
    doc.setTextColor(0, 0, 0);
    vals.forEach((v, i) => {
      const w = cols[i].w * tableW;
      if (header) {
        doc.setFillColor(...rgb('B8CCE4'));
        doc.rect(x, y, w, 11, 'F');
      }
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.4);
      doc.rect(x, y, w, 11);
      doc.text(doc.splitTextToSize(v, w - 5)[0] as string, x + 3, y + 7.6);
      x += w;
    });
    y += 11;
  };
  const tableTop = y;
  drawRow(cols.map((c) => c.t), true);
  rowsData.forEach((r) => drawRow(r, false));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(60, 60, 60);
  const hashLine = `Hash SHA-256 do conteúdo atual: ${currentHash}`;
  doc.text(hashLine, L, y + 9);
  doc.text(
    'Assinaturas eletrônicas aplicadas com confirmação de senha. Alterações posteriores no conteúdo invalidam as assinaturas. Confira pelo QR code.',
    L,
    y + 16,
    { maxWidth: tableW },
  );
  const qr = await QRCode.toDataURL(validationUrl(sc.number), { margin: 0, width: 300, errorCorrectionLevel: 'M' });
  doc.addImage(qr, 'PNG', L + W - qrSize, tableTop + 2, qrSize, qrSize);
  doc.setFontSize(5.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Validar documento', L + W - qrSize / 2, tableTop + qrSize + 9, { align: 'center' });
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
        page.drawText(`Nao foi possivel incluir o arquivo "${a.name.replace(/[^\x20-\x7e]/g, '')}" (PDF protegido ou invalido).`, { x: 40, y: 800, size: 11 });
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
