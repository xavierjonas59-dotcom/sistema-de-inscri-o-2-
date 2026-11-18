import type {
  AlertLevel,
  BudgetOverride,
  BudgetSummary,
  Expense,
  Month,
  Sector,
  Transfer,
} from './types';

/** Limiares de alerta visual do orçamento. */
export const ALERT_THRESHOLDS = { attention: 0.8, critical: 0.95 } as const;

export function alertLevel(usage: number): AlertLevel {
  if (usage > 1) return 'over';
  if (usage >= ALERT_THRESHOLDS.critical) return 'critical';
  if (usage >= ALERT_THRESHOLDS.attention) return 'attention';
  return 'ok';
}

export function baseCeilingFor(sector: Sector, month: Month, overrides: BudgetOverride[]): number {
  const o = overrides.find((x) => x.sectorId === sector.id && x.month === month);
  return o ? o.ceiling : sector.defaultCeiling;
}

/**
 * Calcula o orçamento de um setor em uma competência.
 *
 * Regras:
 *  - Teto efetivo = teto base + transferências APROVADAS recebidas − APROVADAS cedidas.
 *    Transferências em andamento NÃO alteram tetos (só a aprovação final da Diretoria efetiva).
 *  - Gasto = despesas APROVADAS. Em análise = despesas PENDENTE_DIRETORIA.
 *  - Saldo disponível = teto efetivo − gasto − em análise (o pendente fica reservado,
 *    evitando que o gestor comprometa o mesmo saldo duas vezes).
 */
export function computeBudget(
  sector: Sector,
  month: Month,
  data: { overrides: BudgetOverride[]; expenses: Expense[]; transfers: Transfer[] },
): BudgetSummary {
  const baseCeiling = baseCeilingFor(sector, month, data.overrides);
  let transfersIn = 0;
  let transfersOut = 0;
  for (const t of data.transfers) {
    if (t.month !== month || t.status !== 'APROVADA') continue;
    if (t.requestingSectorId === sector.id) transfersIn += t.amount;
    if (t.grantingSectorId === sector.id) transfersOut += t.amount;
  }
  let approved = 0;
  let pending = 0;
  for (const e of data.expenses) {
    if (e.sectorId !== sector.id || e.month !== month) continue;
    if (e.status === 'APROVADA') approved += e.amount;
    else if (e.status === 'PENDENTE_DIRETORIA') pending += e.amount;
  }
  const ceiling = baseCeiling + transfersIn - transfersOut;
  const committed = approved + pending;
  const usage = ceiling > 0 ? committed / ceiling : committed > 0 ? Infinity : 0;
  return {
    sectorId: sector.id,
    month,
    baseCeiling,
    transfersIn,
    transfersOut,
    ceiling,
    approved,
    pending,
    available: ceiling - committed,
    usage,
    alert: alertLevel(usage),
  };
}

/** Soma de transferências que o setor já aceitou ceder e aguardam a Diretoria. */
export function outgoingInFlight(sectorId: string, month: Month, transfers: Transfer[], exceptId?: string) {
  return transfers
    .filter(
      (t) =>
        t.id !== exceptId &&
        t.grantingSectorId === sectorId &&
        t.month === month &&
        t.status === 'PENDENTE_DIRETORIA',
    )
    .reduce((s, t) => s + t.amount, 0);
}
