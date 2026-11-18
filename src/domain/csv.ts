/**
 * Gera CSV compatível com Excel em pt-BR (separador ";" e BOM UTF-8) e dispara o download.
 */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Centavos → número decimal com vírgula, para planilhas pt-BR. */
export const csvMoney = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
