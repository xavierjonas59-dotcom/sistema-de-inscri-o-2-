/** Feriados nacionais do Brasil (calculados para qualquer ano, inclusive os que dependem da Páscoa). */
export interface Holiday {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  /** Ponto facultativo (Carnaval, Corpus Christi): normalmente não se trabalha, mas não é feriado por lei. */
  optional: boolean;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const FIXED: [string, string][] = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia da Consciência Negra'],
  ['12-25', 'Natal'],
];

export function holidays(year: number): Holiday[] {
  const p = easter(year);
  const rel = (days: number) => iso(new Date(p.getFullYear(), p.getMonth(), p.getDate() + days));
  const list: Holiday[] = FIXED.filter(([md]) => md !== '11-20' || year >= 2024).map(([md, name]) => ({ date: `${year}-${md}`, name, optional: false }));
  list.push(
    { date: rel(-48), name: 'Carnaval', optional: true },
    { date: rel(-47), name: 'Carnaval', optional: true },
    { date: rel(-2), name: 'Sexta-feira Santa', optional: false },
    { date: rel(60), name: 'Corpus Christi', optional: true },
  );
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Feriados de um mês (YYYY-MM). */
export const holidaysOfMonth = (month: string) => holidays(Number(month.slice(0, 4))).filter((h) => h.date.startsWith(month));
