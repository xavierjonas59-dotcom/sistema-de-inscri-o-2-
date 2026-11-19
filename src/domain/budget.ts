import { CONSUMED_STATUSES, RESERVED_STATUSES, scTotal } from './sc';
import type { AlertLevel, BudgetSummary, LimitOverride, Month, PurchaseRequest, Sector, Transfer } from './types';

/** Limiares de alerta visual do orçamento. */
export const ALERT_THRESHOLDS = { attention: 0.8, critical: 0.95 } as const;

export function alertLevel(usage: number): AlertLevel {
  if (usage > 1) return 'over';
  if (usage >= ALERT_THRESHOLDS.critical) return 'critical';
  if (usage >= ALERT_THRESHOLDS.attention) return 'attention';
  return 'ok';
}

export function baseLimitFor(sector: Sector, month: Month, overrides: LimitOverride[]): number {
  return overrides.find((x) => x.sectorId === sector.id && x.month === month)?.limit ?? sector.monthlyLimit;
}

/**
 * Saldo do setor na competência. O limite pertence ao setor (gestor e funcionários usam o mesmo saldo).
 *  - Reservado = SCs aprovadas pelo gestor, aguardando a Diretoria (valor atual da SC: se o gestor
 *    alterar o valor, a reserva acompanha automaticamente).
 *  - Consumido = SCs aprovadas pela Diretoria (aguardando NF, no financeiro ou pagas).
 *  - Reprovadas, devolvidas, canceladas, rascunhos e aguardando gestor não ocupam saldo.
 *  - Transferências de limite só contam depois da aprovação final.
 */
export function computeBudget(
  sector: Sector,
  month: Month,
  data: { overrides: LimitOverride[]; requests: PurchaseRequest[]; transfers: Transfer[] },
): BudgetSummary {
  const baseLimit = baseLimitFor(sector, month, data.overrides);
  let transfersIn = 0;
  let transfersOut = 0;
  for (const t of data.transfers) {
    if (t.month !== month || t.status !== 'APROVADA') continue;
    if (t.requestingSectorId === sector.id) transfersIn += t.amount;
    if (t.grantingSectorId === sector.id) transfersOut += t.amount;
  }
  let reserved = 0;
  let consumed = 0;
  for (const r of data.requests) {
    if (r.sectorId !== sector.id || r.month !== month) continue;
    if (RESERVED_STATUSES.includes(r.status)) reserved += scTotal(r);
    else if (CONSUMED_STATUSES.includes(r.status)) consumed += scTotal(r);
  }
  const limit = baseLimit + transfersIn - transfersOut;
  const used = reserved + consumed;
  const usage = limit > 0 ? used / limit : used > 0 ? Infinity : 0;
  return {
    sectorId: sector.id,
    month,
    baseLimit,
    transfersIn,
    transfersOut,
    limit,
    reserved,
    consumed,
    available: limit - used,
    usage,
    alert: alertLevel(usage),
  };
}

export function outgoingInFlight(sectorId: string, month: Month, transfers: Transfer[], exceptId?: string) {
  return transfers
    .filter((t) => t.id !== exceptId && t.grantingSectorId === sectorId && t.month === month && t.status === 'PENDENTE_DIRETORIA')
    .reduce((s, t) => s + t.amount, 0);
}
