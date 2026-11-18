import type { Month } from './types';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata centavos como moeda brasileira. */
export const money = (cents: number) => brl.format(cents / 100);

/** Converte texto digitado ("1.234,56" ou "1234.56") em centavos. Retorna NaN se inválido. */
export function parseMoney(input: string): number {
  const raw = input.trim().replace(/[R$\s]/g, '');
  if (!raw) return NaN;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Math.round(parseFloat(normalized) * 100);
}

/** Centavos → texto editável "1234,56". */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

export const pct = (ratio: number) =>
  `${(ratio * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export function currentMonth(d = new Date()): Month {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: Month, delta: number): Month {
  const [y, m] = month.split('-').map(Number);
  return currentMonth(new Date(y, m - 1 + delta, 1));
}

export function monthLabel(month: Month): string {
  const [y, m] = month.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
