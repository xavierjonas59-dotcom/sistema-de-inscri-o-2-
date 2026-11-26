import { describe, expect, it } from 'vitest';
import { easter, holidays, holidaysOfMonth } from './holidays';

describe('feriados nacionais', () => {
  it('calcula a Páscoa', () => {
    expect(easter(2025).toDateString()).toBe(new Date(2025, 3, 20).toDateString());
    expect(easter(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
    expect(easter(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString());
  });
  it('datas móveis de 2026', () => {
    const h = holidays(2026);
    const at = (name: string) => h.filter((x) => x.name === name).map((x) => x.date);
    expect(at('Carnaval')).toEqual(['2026-02-16', '2026-02-17']);
    expect(at('Sexta-feira Santa')).toEqual(['2026-04-03']);
    expect(at('Corpus Christi')).toEqual(['2026-06-04']);
  });
  it('novembro tem Finados, República e Consciência Negra', () => {
    expect(holidaysOfMonth('2026-11').map((x) => x.date)).toEqual(['2026-11-02', '2026-11-15', '2026-11-20']);
  });
});
