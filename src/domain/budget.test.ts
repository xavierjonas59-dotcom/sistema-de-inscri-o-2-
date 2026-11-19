import { describe, expect, it } from 'vitest';
import { alertLevel } from './budget';
import { parseMoney } from './format';
import { canonical } from './sc';

describe('alertLevel', () => {
  it('classifica pelos limiares de 80% e 95%', () => {
    expect(alertLevel(0.79)).toBe('ok');
    expect(alertLevel(0.8)).toBe('attention');
    expect(alertLevel(0.95)).toBe('critical');
    expect(alertLevel(1.01)).toBe('over');
  });
});

describe('parseMoney', () => {
  it('aceita formatos brasileiros', () => {
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('R$ 32.000,00')).toBe(3200000);
    expect(parseMoney('15')).toBe(1500);
    expect(Number.isNaN(parseMoney('abc'))).toBe(true);
  });
});

describe('canonical', () => {
  it('independe da ordem das chaves', () => {
    expect(canonical({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(canonical({ a: [{ x: 1, y: 2 }], b: 1 }));
  });
});
