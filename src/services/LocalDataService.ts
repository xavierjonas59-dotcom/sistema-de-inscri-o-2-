import { computeBudget, outgoingInFlight } from '@/domain/budget';
import { money, shiftMonth } from '@/domain/format';
import {
  CANCELLABLE,
  CONSUMED_STATUSES,
  contentHash,
  diffContent,
  pickContent,
  scNumber,
  itemTotal,
  scTotal,
  sha256,
  validateContent,
} from '@/domain/sc';
import type {
  AccountBudget,
  AppliedSignature,
  LedgerAccount,
  AttachmentKind,
  CostCenter,
  LimitOverride,
  Month,
  Nature,
  Notification,
  PurchaseRequest,
  ScContent,
  ScStatus,
  Sector,
  SignatureSlot,
  Supplier,
  TimelineEntry,
  Transfer,
  TransferStatus,
  User,
  UserRecord,
} from '@/domain/types';
import {
  BusinessError,
  ForbiddenError,
  type AccountBudgetView,
  type DataService,
  type DirectorInfo,
  type NewFile,
  type RequestContext,
  type RequestFilter,
  type SpendingDetail,
  type UserInput,
  type ValidationResult,
} from './DataService';
import { buildSeed } from './seed';

export interface Database {
  version: number;
  seq: Record<string, number>;
  users: UserRecord[];
  sectors: Sector[];
  overrides: LimitOverride[];
  costCenters: CostCenter[];
  natures: Nature[];
  accounts: LedgerAccount[];
  accountBudgets: AccountBudget[];
  suppliers: Supplier[];
  requests: PurchaseRequest[];
  transfers: Transfer[];
  notifications: Notification[];
}

/** Armazenamento chave-valor assíncrono (IndexedDB no navegador, memória nos testes). */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export const DB_VERSION = 5;
const KEY = 'amc:db';
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

export async function hashPassword(password: string): Promise<string> {
  return sha256(`amc:${password}`);
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

const strip = ({ passwordHash: _p, ...u }: UserRecord): User => u;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/**
 * Implementação do DataService com todas as regras de negócio e permissões.
 *
 * O código não depende do navegador além do `KeyValueStore`, para poder rodar no servidor
 * (ex.: Supabase Edge Function) sem mudanças. No modo demonstração roda no navegador e,
 * por isso, NÃO é uma barreira de segurança real até ser publicado no servidor.
 */
export class LocalDataService implements DataService {
  private db: Database | null = null;
  private loading: Promise<Database> | null = null;
  private listeners = new Set<() => void>();

  constructor(private store: KeyValueStore, private now: () => Date = () => new Date()) {}

  // ------------------------------------------------------------------ infraestrutura
  private load(): Promise<Database> {
    if (this.db) return Promise.resolve(this.db);
    this.loading ??= (async () => {
      const raw = await this.store.get(KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Database;
          if (parsed.version === DB_VERSION) return (this.db = parsed);
        } catch {
          /* base corrompida: recria */
        }
      }
      this.db = await buildSeed(this.now());
      await this.store.set(KEY, JSON.stringify(this.db));
      return this.db;
    })();
    return this.loading;
  }

  private async persist() {
    await this.store.set(KEY, JSON.stringify(this.db));
    this.listeners.forEach((l) => l());
  }

  async reset() {
    this.db = await buildSeed(this.now());
    await this.persist();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private iso = () => this.now().toISOString();
  private entry(actor: User, action: string, note?: string): TimelineEntry {
    return { at: this.iso(), userId: actor.id, userName: actor.name, action, note: note?.trim() || undefined };
  }

  // ------------------------------------------------------------------ permissões
  /** Sempre recarrega o perfil do banco: nunca confia no objeto vindo da tela. */
  private async auth(actor: User, roles?: User['role'][]): Promise<Database> {
    const db = await this.load();
    const u = db.users.find((x) => x.id === actor.id);
    if (!u || !u.active) throw new ForbiddenError('Sessão inválida ou usuário inativo.');
    Object.assign(actor, strip(u));
    if (roles && !roles.includes(actor.role)) throw new ForbiddenError();
    return db;
  }

  private async checkPassword(db: Database, actor: User, password: string | null) {
    const u = db.users.find((x) => x.id === actor.id)!;
    if (!password || u.passwordHash !== (await hashPassword(password))) throw new BusinessError('Senha incorreta. A assinatura não foi aplicada.');
  }

  private canView(actor: User, sc: PurchaseRequest) {
    switch (actor.role) {
      case 'FUNCIONARIO':
        return sc.requesterId === actor.id;
      case 'GESTOR':
        return sc.sectorId === actor.sectorId && (sc.status !== 'RASCUNHO' || sc.requesterId === actor.id);
      case 'DIRETORIA':
        return sc.status !== 'RASCUNHO' || sc.requesterId === actor.id;
      case 'FINANCEIRO':
        return sc.status === 'ENVIADA_FINANCEIRO' || sc.status === 'PAGA';
      default:
        return false;
    }
  }

  private find(db: Database, actor: User, id: string) {
    const sc = db.requests.find((x) => x.id === id);
    if (!sc || !this.canView(actor, sc)) throw new BusinessError('Solicitação não encontrada.');
    return sc;
  }

  /** Aprovação do setor: o gestor do setor ou o diretor responsável pelo setor. */
  private isSectorManager = (actor: User, sc: PurchaseRequest) =>
    (actor.role === 'GESTOR' || actor.role === 'DIRETORIA') && !!actor.sectorId && actor.sectorId === sc.sectorId;

  /** Diretor apto a liberar o pagamento desta SC (ativo e com limite suficiente). */
  private eligibleDirector(db: Database, directorId: string | undefined, total: number): UserRecord {
    const d = db.users.find((u) => u.id === directorId && u.role === 'DIRETORIA' && u.active);
    if (!d) throw new BusinessError('Escolha o diretor que vai liberar o pagamento.');
    if (d.paymentLimit !== null && total > d.paymentLimit)
      throw new BusinessError(`${d.name} não pode liberar este valor. Escolha outro diretor.`);
    return d;
  }

  private assign(sc: PurchaseRequest, d: UserRecord) {
    sc.assignedDirectorId = d.id;
    sc.assignedDirectorName = d.name;
  }

  private expectStatus(sc: PurchaseRequest, ...statuses: ScStatus[]) {
    if (!statuses.includes(sc.status)) throw new BusinessError('Esta ação não é permitida no status atual da solicitação.');
  }

  private sector(db: Database, id: string) {
    const s = db.sectors.find((x) => x.id === id);
    if (!s) throw new BusinessError('Setor não encontrado.');
    return s;
  }

  private budget(db: Database, sectorId: string, month: Month) {
    return computeBudget(this.sector(db, sectorId), month, db);
  }

  private names(db: Database) {
    return {
      costCenter: (id: string) => {
        const c = db.costCenters.find((x) => x.id === id);
        return c ? `${c.code} - ${c.name}` : '—';
      },
      nature: (id: string | null) => {
        const n = db.natures.find((x) => x.id === id);
        return n ? `${n.code} - ${n.name}` : '—';
      },
    };
  }

  private notify(db: Database, userIds: (string | undefined)[], text: string, scId?: string, except?: string) {
    for (const userId of new Set(userIds.filter((x): x is string => !!x && x !== except))) {
      db.notifications.push({ id: uid(), userId, text, scId, at: this.iso(), read: false });
    }
  }
  private usersBy(db: Database, pred: (u: UserRecord) => boolean) {
    return db.users.filter((u) => u.active && pred(u)).map((u) => u.id);
  }

  /** Bloqueia aprovação acima do saldo disponível, informando quanto falta. */
  private assertBudget(db: Database, sc: PurchaseRequest) {
    const b = this.budget(db, sc.sectorId, sc.month);
    const total = scTotal(sc);
    if (total > b.available) {
      throw new BusinessError(
        `Saldo insuficiente no setor: disponível ${money(Math.max(0, b.available))}, solicitação de ${money(total)}. ` +
          `Faltam ${money(total - Math.max(0, b.available))}.`,
      );
    }
  }

  // ------------------------------------------------------------------ contábil
  /** Diretoria escolhida (Antônio, Manoel e Ana) e o Admin definem limites e orçamentos. */
  private isBudgetEditor = (actor: User) => actor.role === 'ADMIN' || (actor.role === 'DIRETORIA' && !!actor.budgetEditor);

  private accountOf(db: Database, natureId: string | null) {
    const n = db.natures.find((x) => x.id === natureId);
    return n?.accountId ? (db.accounts.find((a) => a.id === n.accountId) ?? null) : null;
  }

  /** Reservado + consumido por conta contábil no setor/mês (sem a SC informada). */
  private accountUsage(db: Database, sectorIds: string[] | null, month: Month, exceptId?: string) {
    const use = new Map<string | null, { consumed: number; reserved: number }>();
    for (const r of db.requests) {
      if (r.id === exceptId || r.month !== month || (sectorIds && !sectorIds.includes(r.sectorId))) continue;
      const consumed = CONSUMED_STATUSES.includes(r.status);
      const reserved = r.status === 'AGUARDANDO_DIRETORIA';
      if (!consumed && !reserved) continue;
      const key = this.accountOf(db, r.natureId)?.id ?? null;
      const row = use.get(key) ?? { consumed: 0, reserved: 0 };
      if (consumed) row.consumed += scTotal(r);
      else row.reserved += scTotal(r);
      use.set(key, row);
    }
    return use;
  }

  /**
   * Bloqueio pelo orçamento da conta contábil. Vale quando a diretoria distribuiu o limite do setor
   * em contas naquele mês: a natureza precisa estar ligada a uma conta com saldo suficiente.
   */
  private assertAccountBudget(db: Database, sc: PurchaseRequest) {
    const plan = db.accountBudgets.filter((b) => b.sectorId === sc.sectorId && b.month === sc.month && b.amount > 0);
    if (!plan.length) return;
    const nature = db.natures.find((n) => n.id === sc.natureId);
    const account = this.accountOf(db, sc.natureId);
    if (!account)
      throw new BusinessError(`A natureza ${nature ? `${nature.code} - ${nature.name}` : 'escolhida'} não está ligada a uma conta contábil. Peça para ligar no Contábil.`);
    const budget = plan.find((b) => b.accountId === account.id)?.amount ?? 0;
    const sector = this.sector(db, sc.sectorId).name;
    if (!budget)
      throw new BusinessError(`A conta ${account.code} - ${account.name} não tem orçamento para ${sector} neste mês. Peça à diretoria para incluir no Contábil.`);
    const u = this.accountUsage(db, [sc.sectorId], sc.month, sc.id).get(account.id) ?? { consumed: 0, reserved: 0 };
    const available = budget - u.consumed - u.reserved;
    const total = scTotal(sc);
    if (total > available)
      throw new BusinessError(
        `Orçamento insuficiente na conta ${account.code} - ${account.name}: disponível ${money(Math.max(0, available))}, ` +
          `esta SC precisa de ${money(total)}. Peça à diretoria para ajustar o orçamento da conta no Contábil.`,
      );
  }

  private async sign(db: Database, actor: User, sc: PurchaseRequest, slot: SignatureSlot, password: string, ctx: RequestContext) {
    if (!actor.signature) throw new BusinessError('Cadastre a sua assinatura em "Meu perfil" antes de aprovar.');
    await this.checkPassword(db, actor, password);
    const hash = await contentHash(sc);
    const sig: AppliedSignature = {
      slot,
      userId: actor.id,
      name: actor.name,
      cargo: actor.cargo,
      imageDataUrl: actor.signature.dataUrl,
      signedAt: this.iso(),
      ip: ctx.ip,
      contentHash: hash,
      code: (await sha256(`${hash}:${actor.id}:${slot}:${this.iso()}`)).slice(0, 8).toUpperCase().replace(/(.{4})/, '$1-'),
      method: 'INTERNA',
    };
    sc.signatures[slot] = sig;
    sc.timeline.push(this.entry(actor, slot === 'COMPRA' ? 'Assinou a Autorização de Compra' : 'Assinou a Autorização de Pagamento', `Código ${sig.code} · IP ${ctx.ip}`));
  }

  /** Alteração de conteúdo invalida as assinaturas já aplicadas. */
  private invalidateSignatures(actor: User, sc: PurchaseRequest) {
    for (const slot of ['COMPRA', 'PAGAMENTO'] as SignatureSlot[]) {
      const s = sc.signatures[slot];
      if (s && !s.invalidatedAt) {
        s.invalidatedAt = this.iso();
        sc.timeline.push(this.entry(actor, `Assinatura de ${s.name} invalidada por alteração no conteúdo`));
      }
    }
  }

  private applyContent(db: Database, actor: User, sc: PurchaseRequest, content: ScContent, logChanges: boolean) {
    const clean = clone(pickContent(content));
    clean.items = clean.items.filter((i, idx) => i.description.trim() || idx === 0);
    const supplier = clean.supplierId ? db.suppliers.find((s) => s.id === clean.supplierId) : undefined;
    if (clean.supplierId && !supplier) throw new BusinessError('Fornecedor não encontrado.');
    if (clean.natureId && !db.natures.some((n) => n.id === clean.natureId)) throw new BusinessError('Natureza inválida.');
    if (clean.apportionment.some((a) => a.costCenterId && !db.costCenters.some((c) => c.id === a.costCenterId)))
      throw new BusinessError('Centro de custo inválido.');
    const changes = diffContent(pickContent(sc), clean, this.names(db));
    if (logChanges && changes.length) {
      const at = this.iso();
      sc.changes.push(...changes.map((c) => ({ ...c, userId: actor.id, userName: actor.name, at })));
      sc.timeline.push(this.entry(actor, `Alterou ${changes.length} campo(s)`, changes.map((c) => c.field).join(', ')));
      this.invalidateSignatures(actor, sc);
    }
    Object.assign(sc, clean);
    return changes.length;
  }

  private assertValid(sc: PurchaseRequest) {
    const errors = validateContent(sc, { forSubmit: true });
    if (errors.length) throw new BusinessError(errors.join(' '));
  }

  // ------------------------------------------------------------------ autenticação
  async login(email: string, password: string): Promise<User> {
    const db = await this.load();
    const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u || u.passwordHash !== (await hashPassword(password))) throw new BusinessError('E-mail ou senha inválidos.');
    if (!u.active) throw new BusinessError('Usuário inativo. Procure o gestor do seu setor.');
    return strip(u);
  }

  async requestPasswordReset(email: string) {
    const db = await this.load();
    const u = db.users.find((x) => x.active && x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) return;
    this.notify(db, this.usersBy(db, (x) => x.role === 'ADMIN'), `${u.name} (${u.email}) pediu uma nova senha.`);
    await this.persist();
  }

  async changePassword(actor: User, current: string, next: string) {
    const db = await this.auth(actor);
    const u = db.users.find((x) => x.id === actor.id)!;
    if (u.passwordHash !== (await hashPassword(current))) throw new BusinessError('Senha atual incorreta.');
    if (next.length < 6) throw new BusinessError('A nova senha deve ter ao menos 6 caracteres.');
    if (next === current) throw new BusinessError('A nova senha deve ser diferente da atual.');
    u.passwordHash = await hashPassword(next);
    await this.persist();
  }

  async getUser(id: string) {
    const db = await this.load();
    const u = db.users.find((x) => x.id === id && x.active);
    return u ? strip(u) : null;
  }

  // ------------------------------------------------------------------ cadastros de apoio
  async sectorDirectory(actor: User) {
    const db = await this.auth(actor);
    return db.sectors.filter((s) => s.active).map(({ id, name }) => ({ id, name }));
  }
  async listCostCenters(actor: User, includeInactive = false) {
    const db = await this.auth(actor);
    return db.costCenters.filter((c) => includeInactive || c.active).sort((a, b) => a.code.localeCompare(b.code));
  }
  async listNatures(actor: User, includeInactive = false) {
    const db = await this.auth(actor);
    return db.natures.filter((c) => includeInactive || c.active).sort((a, b) => a.code.localeCompare(b.code));
  }
  async listSuppliers(actor: User, includeInactive = false) {
    const db = await this.auth(actor);
    return db.suppliers.filter((c) => includeInactive || c.active).sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveSupplier(actor: User, input: Partial<Supplier> & Pick<Supplier, 'name'>) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA', 'ADMIN']);
    const name = input.name.trim();
    if (name.length < 2) throw new BusinessError('Informe o nome do fornecedor.');
    if (input.id) {
      if (actor.role !== 'ADMIN') throw new ForbiddenError('Apenas o Admin edita fornecedores cadastrados.');
      const s = db.suppliers.find((x) => x.id === input.id);
      if (!s) throw new BusinessError('Fornecedor não encontrado.');
      Object.assign(s, { ...input, name });
      await this.persist();
      return s;
    }
    if (db.suppliers.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new BusinessError('Fornecedor já cadastrado.');
    const code = input.code?.trim() || String(1000 + db.suppliers.length + 1);
    const s: Supplier = {
      id: uid(),
      code,
      name,
      contact: input.contact?.trim() ?? '',
      bankData: input.bankData ?? { bank: '', agency: '', account: '', pix: '' },
      active: true,
    };
    db.suppliers.push(s);
    await this.persist();
    return s;
  }

  // ------------------------------------------------------------------ saldo
  async getBudget(actor: User, sectorId: string, month: Month) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA', 'ADMIN']);
    if ((actor.role === 'FUNCIONARIO' || actor.role === 'GESTOR') && actor.sectorId !== sectorId)
      throw new ForbiddenError('Você não tem acesso aos dados de outro setor.');
    return this.budget(db, sectorId, month);
  }

  async getAllBudgets(actor: User, month: Month) {
    const db = await this.auth(actor, ['DIRETORIA', 'ADMIN']);
    return db.sectors.filter((s) => s.active).map((s) => this.budget(db, s.id, month));
  }

  // ------------------------------------------------------------------ Solicitação de Compras
  async listRequests(actor: User, f: RequestFilter = {}) {
    const db = await this.auth(actor);
    const statuses = f.status ? ([] as ScStatus[]).concat(f.status) : null;
    return db.requests
      .filter(
        (r) =>
          this.canView(actor, r) &&
          (!f.month || r.month === f.month) &&
          (!statuses || statuses.includes(r.status)) &&
          (!f.sectorId || r.sectorId === f.sectorId) &&
          (!f.mine || r.requesterId === actor.id),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRequest(actor: User, id: string) {
    const db = await this.auth(actor);
    return this.find(db, actor, id);
  }

  /** Cria ou atualiza um rascunho (ou uma SC devolvida) do próprio solicitante. */
  async saveDraft(actor: User, id: string | null, content: ScContent) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA']);
    if (!actor.sectorId) throw new ForbiddenError('Usuário sem setor.');
    if (!id) {
      const now = this.now();
      const year = now.getFullYear();
      db.seq[year] = (db.seq[year] ?? 0) + 1;
      const date = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const sc: PurchaseRequest = {
        ...clone(pickContent(content)),
        id: uid(),
        number: scNumber(year, db.seq[year]),
        sectorId: actor.sectorId,
        requesterId: actor.id,
        requesterName: actor.name,
        date,
        month: date.slice(0, 7),
        createdAt: this.iso(),
        status: 'RASCUNHO',
        assignedDirectorId: null,
        assignedDirectorName: null,
        signatures: {},
        attachments: [],
        changes: [],
        timeline: [this.entry(actor, 'Criou a solicitação')],
        messages: [],
      };
      this.applyContent(db, actor, sc, content, false);
      db.requests.push(sc);
      await this.persist();
      return sc;
    }
    const sc = this.find(db, actor, id);
    if (sc.requesterId !== actor.id) throw new ForbiddenError('Somente o solicitante edita o rascunho.');
    this.expectStatus(sc, 'RASCUNHO', 'DEVOLVIDA');
    this.applyContent(db, actor, sc, content, sc.status === 'DEVOLVIDA');
    await this.persist();
    return sc;
  }

  /**
   * Envia a SC. Funcionário → "Aguardando gestor".
   * Gestor → já entra como "Aguardando diretoria", com a Autorização de Compra dele (exige senha e saldo).
   */
  async submit(actor: User, id: string, password: string | null, ctx: RequestContext, directorId?: string) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA']);
    const sc = this.find(db, actor, id);
    if (sc.requesterId !== actor.id) throw new ForbiddenError('Somente o solicitante envia a solicitação.');
    this.expectStatus(sc, 'RASCUNHO', 'DEVOLVIDA');
    this.assertValid(sc);
    sc.submittedAt = this.iso();
    sc.returnReason = undefined;
    if (this.isSectorManager(actor, sc)) {
      const director = this.eligibleDirector(db, directorId, scTotal(sc));
      this.assertBudget(db, sc);
      await this.sign(db, actor, sc, 'COMPRA', password ?? '', ctx);
      this.assign(sc, director);
      sc.status = 'AGUARDANDO_DIRETORIA';
      sc.timeline.push(this.entry(actor, `Enviou para liberação de ${director.name}`, 'Solicitação do próprio aprovador do setor'));
      this.notify(db, [director.id], `${sc.number} aguarda a sua liberação de pagamento (${money(scTotal(sc))}).`, sc.id, actor.id);
    } else {
      sc.status = 'AGUARDANDO_GESTOR';
      sc.timeline.push(this.entry(actor, 'Enviou para o gestor'));
      this.notify(db, this.usersBy(db, (u) => (u.role === 'GESTOR' || u.role === 'DIRETORIA') && u.sectorId === sc.sectorId), `${actor.name} criou a ${sc.number} (${money(scTotal(sc))}).`, sc.id);
    }
    await this.persist();
    return sc;
  }

  /**
   * Gestor altera itens, valores, fornecedor, pagamento e rateio antes da Diretoria.
   * Cada campo alterado vira um registro (antes/depois). Se a SC já estava na Diretoria,
   * a Autorização de Compra é invalidada e ela volta para "Aguardando gestor" (a reserva é liberada
   * e recalculada na nova aprovação).
   */
  async managerEdit(actor: User, id: string, content: ScContent) {
    const db = await this.auth(actor, ['GESTOR', 'DIRETORIA']);
    const sc = this.find(db, actor, id);
    if (!this.isSectorManager(actor, sc)) throw new ForbiddenError();
    this.expectStatus(sc, 'AGUARDANDO_GESTOR', 'AGUARDANDO_DIRETORIA');
    const changed = this.applyContent(db, actor, sc, content, true);
    if (!changed) return sc;
    if (sc.status === 'AGUARDANDO_DIRETORIA') {
      sc.status = 'AGUARDANDO_GESTOR';
      sc.assignedDirectorId = null;
      sc.assignedDirectorName = null;
      sc.timeline.push(this.entry(actor, 'Voltou para "Aguardando gestor" por alteração; nova aprovação necessária'));
    }
    if (sc.requesterId !== actor.id) this.notify(db, [sc.requesterId], `O gestor alterou a ${sc.number}. Veja o que mudou.`, sc.id);
    await this.persist();
    return sc;
  }

  async managerApprove(actor: User, id: string, password: string, ctx: RequestContext, directorId: string) {
    const db = await this.auth(actor, ['GESTOR', 'DIRETORIA']);
    const sc = this.find(db, actor, id);
    if (!this.isSectorManager(actor, sc)) throw new ForbiddenError('Somente o gestor ou o diretor do setor aprova esta etapa.');
    this.expectStatus(sc, 'AGUARDANDO_GESTOR');
    this.assertValid(sc);
    const director = this.eligibleDirector(db, directorId, scTotal(sc));
    this.assertBudget(db, sc);
    this.assertAccountBudget(db, sc);
    await this.sign(db, actor, sc, 'COMPRA', password, ctx);
    this.assign(sc, director);
    sc.status = 'AGUARDANDO_DIRETORIA';
    sc.timeline.push(this.entry(actor, `Aprovou e enviou para liberação de ${director.name}`, `Valor reservado: ${money(scTotal(sc))}`));
    this.notify(db, [sc.requesterId], `${sc.number} foi aprovada no setor e enviada para liberação de ${director.name}.`, sc.id, actor.id);
    this.notify(db, [director.id], `${sc.number} aguarda a sua liberação de pagamento (${money(scTotal(sc))}).`, sc.id, actor.id);
    await this.persist();
    return sc;
  }

  async returnForAdjustment(actor: User, id: string, reason: string) {
    const db = await this.auth(actor, ['GESTOR', 'DIRETORIA']);
    const sc = this.find(db, actor, id);
    if (!this.isSectorManager(actor, sc)) throw new ForbiddenError();
    this.expectStatus(sc, 'AGUARDANDO_GESTOR');
    if (!reason?.trim()) throw new BusinessError('Informe o motivo da devolução.');
    sc.status = 'DEVOLVIDA';
    sc.returnReason = reason.trim();
    sc.timeline.push(this.entry(actor, 'Devolveu para ajuste', reason));
    this.notify(db, [sc.requesterId], `${sc.number} foi devolvida para ajuste: ${reason.trim()}`, sc.id, actor.id);
    await this.persist();
    return sc;
  }

  /** Gestor reprova na sua etapa; Diretoria reprova na etapa dela. Encerra a SC e libera a reserva. */
  async reject(actor: User, id: string, reason: string) {
    const db = await this.auth(actor, ['GESTOR', 'DIRETORIA']);
    const sc = this.find(db, actor, id);
    const sectorStage = sc.status === 'AGUARDANDO_GESTOR';
    if (sectorStage) {
      if (!this.isSectorManager(actor, sc)) throw new ForbiddenError();
    } else {
      this.expectStatus(sc, 'AGUARDANDO_DIRETORIA');
      if (sc.assignedDirectorId !== actor.id) throw new ForbiddenError('Esta SC está com outro diretor.');
    }
    if (!reason?.trim()) throw new BusinessError('Informe o motivo da reprovação.');
    sc.status = 'REPROVADA';
    sc.rejectReason = reason.trim();
    sc.timeline.push(this.entry(actor, sectorStage ? 'Reprovou (aprovação do setor)' : 'Reprovou (liberação de pagamento)', reason));
    const managers = this.usersBy(db, (u) => u.role === 'GESTOR' && u.sectorId === sc.sectorId);
    this.notify(db, sectorStage ? [sc.requesterId] : [sc.requesterId, ...managers], `${sc.number} foi reprovada: ${reason.trim()}`, sc.id, actor.id);
    await this.persist();
    return sc;
  }

  /** Somente a Diretoria assina a Autorização de Pagamento. Reservado → consumido. */
  async directorApprove(actor: User, id: string, password: string, ctx: RequestContext) {
    const db = await this.auth(actor, ['DIRETORIA']);
    const sc = this.find(db, actor, id);
    this.expectStatus(sc, 'AGUARDANDO_DIRETORIA');
    if (sc.assignedDirectorId !== actor.id) throw new ForbiddenError(`Esta SC aguarda a liberação de ${sc.assignedDirectorName ?? 'outro diretor'}.`);
    const me = db.users.find((u) => u.id === actor.id)!;
    if (me.paymentLimit !== null && scTotal(sc) > me.paymentLimit)
      throw new BusinessError('Este valor precisa ser liberado por outro diretor. Use "Encaminhar para outro diretor".');
    const compra = sc.signatures.COMPRA;
    if (!compra || compra.invalidatedAt || compra.contentHash !== (await contentHash(sc)))
      throw new BusinessError('A Autorização de Compra não é válida para o conteúdo atual. É preciso nova aprovação do gestor.');
    this.assertAccountBudget(db, sc);
    await this.sign(db, actor, sc, 'PAGAMENTO', password, ctx);
    sc.status = 'AGUARDANDO_NF';
    sc.timeline.push(this.entry(actor, 'Liberou o pagamento (Diretoria)', `Valor consumido: ${money(scTotal(sc))}`));
    const managers = this.usersBy(db, (u) => u.role === 'GESTOR' && u.sectorId === sc.sectorId);
    this.notify(db, [sc.requesterId, ...managers], `${sc.number} foi aprovada pela Diretoria. Anexe a NF e os comprovantes.`, sc.id, actor.id);
    await this.persist();
    return sc;
  }

  async forwardToDirector(actor: User, id: string, directorId: string, note: string) {
    const db = await this.auth(actor, ['DIRETORIA']);
    const sc = this.find(db, actor, id);
    this.expectStatus(sc, 'AGUARDANDO_DIRETORIA');
    if (sc.assignedDirectorId !== actor.id) throw new ForbiddenError('Só o diretor escolhido pode encaminhar.');
    if (directorId === actor.id) throw new BusinessError('Escolha outro diretor.');
    const d = this.eligibleDirector(db, directorId, scTotal(sc));
    this.assign(sc, d);
    sc.timeline.push(this.entry(actor, `Encaminhou a liberação para ${d.name}`, note));
    this.notify(db, [d.id], `${actor.name} encaminhou a ${sc.number} (${money(scTotal(sc))}) para a sua liberação.`, sc.id);
    await this.persist();
    return sc;
  }

  async listDirectors(actor: User, total?: number): Promise<DirectorInfo[]> {
    const db = await this.auth(actor);
    return db.users
      .filter((u) => u.role === 'DIRETORIA' && u.active && (total === undefined || u.paymentLimit === null || total <= u.paymentLimit))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name, cargo, sectorId, paymentLimit }) => (actor.role === 'ADMIN' ? { id, name, cargo, sectorId, paymentLimit } : { id, name, cargo, sectorId }));
  }

  async postMessage(actor: User, id: string, text: string) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA', 'FINANCEIRO']);
    const sc = this.find(db, actor, id);
    if (['PAGA', 'REPROVADA', 'CANCELADA'].includes(sc.status)) throw new BusinessError('A solicitação está encerrada; a conversa é só para leitura.');
    const body = text.trim();
    if (!body) throw new BusinessError('Escreva a mensagem.');
    if (body.length > 2000) throw new BusinessError('Mensagem muito longa (máximo 2.000 caracteres).');
    sc.messages.push({ id: uid(), userId: actor.id, userName: actor.name, text: body, at: this.iso() });
    const approvers = this.usersBy(db, (u) => (u.role === 'GESTOR' || u.role === 'DIRETORIA') && u.sectorId === sc.sectorId);
    const participants = [sc.requesterId, ...approvers, sc.assignedDirectorId ?? undefined, ...sc.messages.map((m) => m.userId)];
    const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    this.notify(db, participants, `${actor.name} na ${sc.number}: "${preview}"`, sc.id, actor.id);
    await this.persist();
    return sc;
  }

  /** Funcionário e gestor só veem o próprio setor; diretoria e admin, qualquer setor ou a empresa toda. */
  private spendingScope(actor: User, sectorId: string | null) {
    if (actor.role === 'FUNCIONARIO' || actor.role === 'GESTOR') return actor.sectorId;
    return sectorId;
  }

  async spendingByMonth(actor: User, sectorId: string | null, months: number) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA', 'ADMIN']);
    const scope = this.spendingScope(actor, sectorId);
    const now = this.now();
    const list: { month: Month; consumed: number; reserved: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, consumed: 0, reserved: 0 });
    }
    const byMonth = new Map(list.map((x) => [x.month, x]));
    for (const r of db.requests) {
      if (scope && r.sectorId !== scope) continue;
      const row = byMonth.get(r.month);
      if (!row) continue;
      if (CONSUMED_STATUSES.includes(r.status)) row.consumed += scTotal(r);
      else if (r.status === 'AGUARDANDO_DIRETORIA') row.reserved += scTotal(r);
    }
    return list;
  }

  async spendingByNature(actor: User, sectorId: string | null, month: Month) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA', 'ADMIN']);
    const scope = this.spendingScope(actor, sectorId);
    const totals = new Map<string | null, number>();
    for (const r of db.requests) {
      if ((scope && r.sectorId !== scope) || r.month !== month || !CONSUMED_STATUSES.includes(r.status)) continue;
      totals.set(r.natureId, (totals.get(r.natureId) ?? 0) + scTotal(r));
    }
    return [...totals].map(([natureId, consumed]) => ({ natureId, consumed })).sort((a, b) => b.consumed - a.consumed);
  }

  async spendingByDay(actor: User, sectorId: string | null, days: number) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA', 'ADMIN']);
    const scope = this.spendingScope(actor, sectorId);
    const now = this.now();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const list: { date: string; consumed: number }[] = [];
    for (let i = days - 1; i >= 0; i--) list.push({ date: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)), consumed: 0 });
    const byDate = new Map(list.map((x) => [x.date, x]));
    for (const r of db.requests) {
      if ((scope && r.sectorId !== scope) || !CONSUMED_STATUSES.includes(r.status)) continue;
      const row = byDate.get(r.date);
      if (row) row.consumed += scTotal(r);
    }
    return list;
  }

  async spendingDetails(actor: User, sectorId: string | null, month: Month): Promise<SpendingDetail[]> {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA', 'ADMIN']);
    const scope = this.spendingScope(actor, sectorId);
    return db.requests
      .filter((r) => (!scope || r.sectorId === scope) && r.month === month && CONSUMED_STATUSES.includes(r.status))
      .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
      .map((r) => ({
        id: r.id,
        number: r.number,
        date: r.date,
        sectorId: r.sectorId,
        requesterName: r.requesterName,
        supplierName: r.supplierName,
        natureId: r.natureId,
        status: r.status,
        total: scTotal(r),
        items: r.items.filter((i) => i.description.trim()).map((i) => ({ description: i.description, quantity: i.quantity, total: itemTotal(i) })),
        canOpen: this.canView(actor, r),
      }));
  }

  async listAccounts(actor: User) {
    const db = await this.auth(actor);
    return [...db.accounts].sort((a, b) => a.code.localeCompare(b.code));
  }

  async getAccountBudget(actor: User, sectorId: string | null, month: Month): Promise<AccountBudgetView> {
    const db = await this.auth(actor, ['GESTOR', 'DIRETORIA', 'ADMIN']);
    // Gestor só enxerga o próprio setor, mesmo pedindo outro.
    const scope = actor.role === 'GESTOR' ? actor.sectorId : sectorId;
    const sectors = scope ? [this.sector(db, scope)] : db.sectors.filter((s) => s.active);
    const ids = sectors.map((s) => s.id);
    const budgets = sectors.map((s) => computeBudget(s, month, db));
    const baseLimit = budgets.reduce((t, b) => t + b.baseLimit, 0);
    const limit = budgets.reduce((t, b) => t + b.limit, 0);
    const planned = new Map<string, number>();
    for (const b of db.accountBudgets) if (b.month === month && ids.includes(b.sectorId)) planned.set(b.accountId, (planned.get(b.accountId) ?? 0) + b.amount);
    const usage = this.accountUsage(db, ids, month);
    const keys = new Set<string | null>([...[...planned].filter(([, v]) => v > 0).map(([k]) => k), ...usage.keys()]);
    const rows = [...keys].map((accountId) => {
      const acc = accountId ? db.accounts.find((a) => a.id === accountId) : null;
      const budget = accountId ? (planned.get(accountId) ?? 0) : 0;
      const u = usage.get(accountId) ?? { consumed: 0, reserved: 0 };
      return {
        accountId,
        code: acc?.code ?? '',
        name: acc?.name ?? 'Sem conta contábil',
        group: acc?.group ?? 'Sem conta contábil',
        budget,
        share: baseLimit > 0 ? budget / baseLimit : 0,
        consumed: u.consumed,
        reserved: u.reserved,
        available: budget - u.consumed - u.reserved,
      };
    });
    rows.sort((a, b) => (a.accountId === null ? 1 : b.accountId === null ? -1 : a.code.localeCompare(b.code)));
    const distributed = rows.reduce((t, r) => t + r.budget, 0);
    return {
      sectorId: scope,
      month,
      baseLimit,
      limit,
      distributed,
      undistributed: baseLimit - distributed,
      consumed: budgets.reduce((t, b) => t + b.consumed, 0),
      reserved: budgets.reduce((t, b) => t + b.reserved, 0),
      rows,
      canEdit: this.isBudgetEditor(actor) && !!scope,
    };
  }

  /**
   * A diretoria define o limite do setor no mês e quanto dele vai para cada conta contábil.
   * Com `repeat`, aplica o mesmo a todos os meses seguintes até dezembro.
   */
  async saveAccountBudget(actor: User, sectorId: string, month: Month, input: { limit: number; entries: { accountId: string; amount: number }[] }, repeat = false) {
    const db = await this.auth(actor, ['DIRETORIA', 'ADMIN']);
    if (!this.isBudgetEditor(actor)) throw new ForbiddenError('Somente a diretoria responsável (Antônio, Manoel e Ana) ou o Admin altera limites e orçamentos.');
    this.sector(db, sectorId);
    if (!Number.isInteger(input.limit) || input.limit < 0) throw new BusinessError('Limite do setor inválido.');
    const seen = new Set<string>();
    for (const e of input.entries) {
      if (!db.accounts.some((a) => a.id === e.accountId)) throw new BusinessError('Conta contábil não encontrada.');
      if (seen.has(e.accountId)) throw new BusinessError('Conta contábil repetida.');
      seen.add(e.accountId);
      if (!Number.isInteger(e.amount) || e.amount < 0) throw new BusinessError('Valor de orçamento inválido.');
    }
    const total = input.entries.reduce((t, e) => t + e.amount, 0);
    if (total > input.limit)
      throw new BusinessError(`A soma das contas (${money(total)}) passa do limite do setor (${money(input.limit)}). Diminua alguma conta ou aumente o limite.`);
    const months: Month[] = [month];
    if (repeat) for (let m = shiftMonth(month, 1); m <= `${month.slice(0, 4)}-12`; m = shiftMonth(m, 1)) months.push(m);
    for (const m of months) {
      db.overrides = db.overrides.filter((o) => !(o.sectorId === sectorId && o.month === m));
      db.overrides.push({ sectorId, month: m, limit: input.limit });
      db.accountBudgets = db.accountBudgets.filter((b) => !(b.sectorId === sectorId && b.month === m));
      for (const e of input.entries) if (e.amount > 0) db.accountBudgets.push({ sectorId, month: m, accountId: e.accountId, amount: e.amount });
    }
    await this.persist();
    return this.getAccountBudget(actor, sectorId, month);
  }

  async setNatureAccount(actor: User, natureId: string, accountId: string | null) {
    const db = await this.auth(actor, ['DIRETORIA', 'ADMIN']);
    if (!this.isBudgetEditor(actor)) throw new ForbiddenError();
    const n = db.natures.find((x) => x.id === natureId);
    if (!n) throw new BusinessError('Natureza não encontrada.');
    if (accountId && !db.accounts.some((a) => a.id === accountId)) throw new BusinessError('Conta contábil não encontrada.');
    n.accountId = accountId;
    // Ligou a uma conta: a natureza passa a aparecer na SC.
    if (accountId) n.active = true;
    await this.persist();
    return n;
  }

  async cancel(actor: User, id: string) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA']);
    const sc = this.find(db, actor, id);
    if (sc.requesterId !== actor.id && !this.isSectorManager(actor, sc)) throw new ForbiddenError();
    this.expectStatus(sc, ...CANCELLABLE);
    sc.status = 'CANCELADA';
    sc.timeline.push(this.entry(actor, 'Cancelou a solicitação'));
    await this.persist();
    return sc;
  }

  async addAttachment(actor: User, id: string, kind: AttachmentKind, file: NewFile) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA']);
    const sc = this.find(db, actor, id);
    if (sc.requesterId !== actor.id && !this.isSectorManager(actor, sc)) throw new ForbiddenError();
    if (kind === 'ORCAMENTO') this.expectStatus(sc, 'RASCUNHO', 'DEVOLVIDA', 'AGUARDANDO_GESTOR');
    else if (kind === 'NF' || kind === 'BOLETO' || kind === 'COMPROVANTE' || kind === 'PDF_ASSINADO') this.expectStatus(sc, 'AGUARDANDO_NF');
    else throw new ForbiddenError('O comprovante de pagamento é anexado pelo Financeiro.');
    this.checkFile(file);
    sc.attachments.push({ id: uid(), kind, ...file, uploadedBy: actor.id, uploadedByName: actor.name, uploadedAt: this.iso() });
    sc.timeline.push(this.entry(actor, `Anexou ${ATTACHMENT_LABEL[kind]}`, file.name));
    await this.persist();
    return sc;
  }

  async removeAttachment(actor: User, id: string, attachmentId: string) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA']);
    const sc = this.find(db, actor, id);
    const a = sc.attachments.find((x) => x.id === attachmentId);
    if (!a) throw new BusinessError('Anexo não encontrado.');
    if (a.uploadedBy !== actor.id && !this.isSectorManager(actor, sc)) throw new ForbiddenError();
    if (a.kind === 'ORCAMENTO') this.expectStatus(sc, 'RASCUNHO', 'DEVOLVIDA', 'AGUARDANDO_GESTOR');
    else this.expectStatus(sc, 'AGUARDANDO_NF');
    sc.attachments = sc.attachments.filter((x) => x.id !== attachmentId);
    sc.timeline.push(this.entry(actor, `Removeu ${ATTACHMENT_LABEL[a.kind]}`, a.name));
    await this.persist();
    return sc;
  }

  private checkFile(file: NewFile) {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.mimeType)) throw new BusinessError('Use arquivos PDF, JPG ou PNG.');
    if (file.size > MAX_ATTACHMENT_BYTES) throw new BusinessError('Arquivo maior que 5 MB.');
  }

  async sendToFinance(actor: User, id: string) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA']);
    const sc = this.find(db, actor, id);
    if (sc.requesterId !== actor.id && !this.isSectorManager(actor, sc)) throw new ForbiddenError();
    this.expectStatus(sc, 'AGUARDANDO_NF');
    if (!sc.attachments.some((a) => a.kind === 'NF')) throw new BusinessError('Anexe ao menos a nota fiscal antes de enviar para pagamento.');
    sc.status = 'ENVIADA_FINANCEIRO';
    sc.timeline.push(this.entry(actor, 'Enviou ao financeiro'));
    this.notify(db, this.usersBy(db, (u) => u.role === 'FINANCEIRO'), `${sc.number} foi enviada para pagamento (${money(scTotal(sc))}).`, sc.id);
    const managers = this.usersBy(db, (u) => u.role === 'GESTOR' && u.sectorId === sc.sectorId);
    this.notify(db, [sc.requesterId, ...managers], `${sc.number} foi enviada ao financeiro.`, sc.id, actor.id);
    await this.persist();
    return sc;
  }

  async markPaid(actor: User, id: string, paidAt: string, proof: NewFile) {
    const db = await this.auth(actor, ['FINANCEIRO']);
    const sc = this.find(db, actor, id);
    this.expectStatus(sc, 'ENVIADA_FINANCEIRO');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) throw new BusinessError('Informe a data do pagamento.');
    if (!proof) throw new BusinessError('Anexe o comprovante de pagamento.');
    this.checkFile(proof);
    sc.attachments.push({ id: uid(), kind: 'COMPROVANTE_PAGAMENTO', ...proof, uploadedBy: actor.id, uploadedByName: actor.name, uploadedAt: this.iso() });
    sc.status = 'PAGA';
    sc.paidAt = paidAt;
    sc.timeline.push(this.entry(actor, 'Marcou como paga', `Pagamento em ${paidAt.split('-').reverse().join('/')}`));
    const managers = this.usersBy(db, (u) => u.role === 'GESTOR' && u.sectorId === sc.sectorId);
    this.notify(db, [sc.requesterId, ...managers], `${sc.number} foi paga.`, sc.id, actor.id);
    await this.persist();
    return sc;
  }

  async approverEmails(actor: User, id: string) {
    const db = await this.auth(actor);
    const sc = this.find(db, actor, id);
    if (sc.status === 'AGUARDANDO_DIRETORIA')
      return db.users.filter((u) => u.id === sc.assignedDirectorId && u.active).map((u) => u.email);
    if (sc.status === 'AGUARDANDO_GESTOR')
      return db.users.filter((u) => u.active && (u.role === 'GESTOR' || u.role === 'DIRETORIA') && u.sectorId === sc.sectorId).map((u) => u.email);
    return [];
  }

  async logEmailRequest(actor: User, id: string, to: string[], cc: string[]) {
    const db = await this.auth(actor, ['FUNCIONARIO', 'GESTOR', 'DIRETORIA']);
    const sc = this.find(db, actor, id);
    if (sc.requesterId !== actor.id && !this.isSectorManager(actor, sc)) throw new ForbiddenError();
    this.expectStatus(sc, 'AGUARDANDO_GESTOR', 'AGUARDANDO_DIRETORIA');
    if (!to.length) throw new BusinessError('Informe ao menos um destinatário.');
    const bad = [...to, ...cc].find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (bad) throw new BusinessError(`E-mail inválido: ${bad}`);
    sc.timeline.push(this.entry(actor, 'Notificou por e-mail', `Para: ${to.join(', ')}${cc.length ? `; Cc: ${cc.join(', ')}` : ''}`));
    await this.persist();
    return sc;
  }

  async validate(number: string): Promise<ValidationResult | null> {
    const db = await this.load();
    const sc = db.requests.find((r) => r.number.toUpperCase() === number.trim().toUpperCase());
    if (!sc || sc.status === 'RASCUNHO') return null;
    const hash = await contentHash(sc);
    return {
      number: sc.number,
      status: sc.status,
      sectorName: this.sector(db, sc.sectorId).name,
      requesterName: sc.requesterName,
      date: sc.date,
      total: scTotal(sc),
      signatures: (['COMPRA', 'PAGAMENTO'] as SignatureSlot[])
        .map((slot) => sc.signatures[slot])
        .filter((s): s is AppliedSignature => !!s)
        .map((s) => ({
          slot: s.slot === 'COMPRA' ? 'Autorização de Compra' : 'Autorização de Pagamento',
          name: s.name,
          cargo: s.cargo,
          signedAt: s.signedAt,
          code: s.code,
          valid: !s.invalidatedAt && s.contentHash === hash,
        })),
    };
  }

  // ------------------------------------------------------------------ usuários
  async listUsers(actor: User) {
    const db = await this.auth(actor, ['ADMIN', 'GESTOR']);
    return db.users
      .filter((u) => actor.role === 'ADMIN' || u.sectorId === actor.sectorId)
      .map(strip)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Admin: cria/edita qualquer usuário.
   * Gestor: só usuários do próprio setor; quem ele cria é sempre Funcionário do setor dele.
   */
  async saveUser(actor: User, input: UserInput) {
    const db = await this.auth(actor, ['ADMIN', 'GESTOR']);
    const email = input.email.trim().toLowerCase();
    const isManager = actor.role === 'GESTOR';
    if (input.name.trim().length < 3) throw new BusinessError('Informe o nome completo.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BusinessError('E-mail inválido.');
    if (db.users.some((u) => u.email === email && u.id !== input.id)) throw new BusinessError('E-mail já cadastrado.');
    if (input.password && input.password.length < 6) throw new BusinessError('A senha deve ter ao menos 6 caracteres.');

    const role = isManager ? 'FUNCIONARIO' : input.role;
    const sectorId = isManager ? actor.sectorId : role === 'FUNCIONARIO' || role === 'GESTOR' || role === 'DIRETORIA' ? input.sectorId : null;
    const paymentLimit = role === 'DIRETORIA' && !isManager ? (input.paymentLimit ?? null) : null;
    if (paymentLimit !== null && (!Number.isInteger(paymentLimit) || paymentLimit <= 0)) throw new BusinessError('Limite de liberação inválido.');
    const budgetEditor = !isManager && role === 'DIRETORIA' && !!input.budgetEditor;
    if ((role === 'FUNCIONARIO' || role === 'GESTOR') && !sectorId) throw new BusinessError('Funcionário e gestor precisam de um setor.');
    if (sectorId) this.sector(db, sectorId);

    if (input.id) {
      const u = db.users.find((x) => x.id === input.id);
      if (!u) throw new BusinessError('Usuário não encontrado.');
      if (isManager && (u.sectorId !== actor.sectorId || u.role !== 'FUNCIONARIO'))
        throw new ForbiddenError('O gestor só edita funcionários do próprio setor.');
      if (u.id === actor.id && (!input.active || role !== u.role)) throw new BusinessError('Você não pode alterar o seu próprio perfil ou desativar a si mesmo.');
      Object.assign(u, { name: input.name.trim(), email, role, sectorId, cargo: input.cargo.trim(), active: input.active, paymentLimit, budgetEditor });
      if (input.password) u.passwordHash = await hashPassword(input.password);
      await this.persist();
      return strip(u);
    }
    if (!input.password) throw new BusinessError('Defina uma senha inicial.');
    const u: UserRecord = {
      id: uid(),
      name: input.name.trim(),
      email,
      role,
      sectorId,
      cargo: input.cargo.trim() || (role === 'FUNCIONARIO' ? 'Funcionário' : ''),
      active: input.active,
      paymentLimit,
      budgetEditor,
      signature: null,
      passwordHash: await hashPassword(input.password),
    };
    db.users.push(u);
    await this.persist();
    return strip(u);
  }

  async setMySignature(actor: User, dataUrl: string | null) {
    const db = await this.auth(actor, ['GESTOR', 'DIRETORIA']);
    if (dataUrl !== null && !/^data:image\/png;base64,/.test(dataUrl)) throw new BusinessError('A assinatura deve ser uma imagem PNG.');
    if (dataUrl && dataUrl.length > 700_000) throw new BusinessError('Imagem da assinatura muito grande.');
    const u = db.users.find((x) => x.id === actor.id)!;
    u.signature = dataUrl ? { dataUrl, updatedAt: this.iso() } : null;
    await this.persist();
    return strip(u);
  }

  // ------------------------------------------------------------------ administração
  async listSectors(actor: User) {
    const db = await this.auth(actor, ['ADMIN']);
    return [...db.sectors].sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveSector(actor: User, input: Partial<Sector> & Pick<Sector, 'name' | 'monthlyLimit'>) {
    const db = await this.auth(actor, ['ADMIN']);
    const name = input.name.trim();
    if (name.length < 2) throw new BusinessError('Informe o nome do setor.');
    if (!Number.isInteger(input.monthlyLimit) || input.monthlyLimit < 0) throw new BusinessError('Limite inválido.');
    if (db.sectors.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== input.id)) throw new BusinessError('Já existe um setor com esse nome.');
    if (input.id) {
      const s = this.sector(db, input.id);
      Object.assign(s, { name, monthlyLimit: input.monthlyLimit, active: input.active ?? s.active });
      await this.persist();
      return s;
    }
    const s: Sector = { id: uid(), name, monthlyLimit: input.monthlyLimit, active: input.active ?? true };
    db.sectors.push(s);
    await this.persist();
    return s;
  }

  async listOverrides(actor: User, month: Month) {
    const db = await this.auth(actor, ['ADMIN']);
    return db.overrides.filter((o) => o.month === month);
  }

  async setOverride(actor: User, sectorId: string, month: Month, limit: number | null) {
    const db = await this.auth(actor, ['ADMIN']);
    this.sector(db, sectorId);
    db.overrides = db.overrides.filter((o) => !(o.sectorId === sectorId && o.month === month));
    if (limit !== null) {
      if (!Number.isInteger(limit) || limit < 0) throw new BusinessError('Limite inválido.');
      db.overrides.push({ sectorId, month, limit });
    }
    await this.persist();
  }

  async saveCostCenter(actor: User, input: Partial<CostCenter> & Pick<CostCenter, 'code' | 'name'>) {
    const db = await this.auth(actor, ['ADMIN']);
    return this.saveCoded(db, db.costCenters, input, 'Centro de custo');
  }

  async saveNature(actor: User, input: Partial<Nature> & Pick<Nature, 'code' | 'name'>) {
    const db = await this.auth(actor, ['ADMIN']);
    return this.saveCoded(db, db.natures, input, 'Natureza');
  }

  private async saveCoded<T extends { id: string; code: string; name: string; active: boolean }>(
    _db: Database,
    list: T[],
    input: Partial<T> & Pick<T, 'code' | 'name'>,
    label: string,
  ): Promise<T> {
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name) throw new BusinessError(`Informe código e nome.`);
    if (list.some((x) => x.code === code && x.id !== input.id)) throw new BusinessError(`${label} com este código já existe.`);
    if (input.id) {
      const x = list.find((y) => y.id === input.id);
      if (!x) throw new BusinessError(`${label} não encontrado.`);
      Object.assign(x, { code, name, active: input.active ?? x.active });
      await this.persist();
      return x;
    }
    const x = { id: uid(), code, name, active: true } as T;
    list.push(x);
    await this.persist();
    return x;
  }

  // ------------------------------------------------------------------ transferências de limite
  async listTransfers(actor: User, f: { status?: TransferStatus; month?: Month } = {}) {
    const db = await this.auth(actor, ['GESTOR', 'DIRETORIA']);
    return db.transfers
      .filter(
        (t) =>
          (actor.role === 'DIRETORIA' || t.requestingSectorId === actor.sectorId || t.grantingSectorId === actor.sectorId) &&
          (!f.status || t.status === f.status) &&
          (!f.month || t.month === f.month),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createTransfer(actor: User, input: { grantingSectorId: string; amount: number; justification: string; month: Month }) {
    const db = await this.auth(actor, ['GESTOR']);
    if (input.grantingSectorId === actor.sectorId) throw new BusinessError('Escolha um setor diferente do seu.');
    this.sector(db, input.grantingSectorId);
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new BusinessError('Informe um valor maior que zero.');
    if (input.justification.trim().length < 10) throw new BusinessError('A justificativa deve ter ao menos 10 caracteres.');
    const t: Transfer = {
      id: uid(),
      requestingSectorId: actor.sectorId!,
      grantingSectorId: input.grantingSectorId,
      requesterId: actor.id,
      requesterName: actor.name,
      month: input.month,
      amount: input.amount,
      justification: input.justification.trim(),
      status: 'PENDENTE_CEDENTE',
      createdAt: this.iso(),
      history: [this.entry(actor, 'Pedido de transferência criado')],
    };
    db.transfers.push(t);
    this.notify(db, this.usersBy(db, (u) => u.role === 'GESTOR' && u.sectorId === input.grantingSectorId), `Pedido de ${money(t.amount)} de limite para o seu setor analisar.`);
    await this.persist();
    return t;
  }

  async grantorDecide(actor: User, id: string, approve: boolean, note?: string) {
    const db = await this.auth(actor, ['GESTOR']);
    const t = db.transfers.find((x) => x.id === id);
    if (!t || t.grantingSectorId !== actor.sectorId) throw new ForbiddenError('Apenas o gestor do setor cedente pode decidir.');
    if (t.status !== 'PENDENTE_CEDENTE') throw new BusinessError('Esta transferência não aguarda o cedente.');
    if (!approve && !note?.trim()) throw new BusinessError('Informe o motivo da recusa.');
    if (approve) {
      const free = this.budget(db, t.grantingSectorId, t.month).available - outgoingInFlight(t.grantingSectorId, t.month, db.transfers, t.id);
      if (t.amount > free) throw new BusinessError(`Seu saldo livre (${money(Math.max(0, free))}) não cobre a cessão de ${money(t.amount)}.`);
    }
    t.status = approve ? 'PENDENTE_DIRETORIA' : 'RECUSADA_CEDENTE';
    t.history.push(this.entry(actor, approve ? 'Aceita pelo gestor cedente' : 'Recusada pelo gestor cedente', note));
    await this.persist();
    return t;
  }

  async directorDecideTransfer(actor: User, id: string, approve: boolean, note?: string) {
    const db = await this.auth(actor, ['DIRETORIA']);
    const t = db.transfers.find((x) => x.id === id);
    if (!t) throw new BusinessError('Transferência não encontrada.');
    if (t.status !== 'PENDENTE_DIRETORIA') throw new BusinessError('A transferência precisa do aceite do gestor cedente.');
    if (!approve && !note?.trim()) throw new BusinessError('Informe o motivo da rejeição.');
    if (approve && t.amount > this.budget(db, t.grantingSectorId, t.month).available)
      throw new BusinessError('O setor cedente não tem mais saldo para ceder.');
    t.status = approve ? 'APROVADA' : 'REJEITADA_DIRETORIA';
    t.history.push(this.entry(actor, approve ? 'Aprovada pela Diretoria; limite transferido' : 'Rejeitada pela Diretoria', note));
    await this.persist();
    return t;
  }

  async cancelTransfer(actor: User, id: string) {
    const db = await this.auth(actor, ['GESTOR']);
    const t = db.transfers.find((x) => x.id === id);
    if (!t || t.requestingSectorId !== actor.sectorId) throw new ForbiddenError();
    if (t.status !== 'PENDENTE_CEDENTE' && t.status !== 'PENDENTE_DIRETORIA') throw new BusinessError('Somente pedidos em andamento podem ser cancelados.');
    t.status = 'CANCELADA';
    t.history.push(this.entry(actor, 'Cancelada pelo solicitante'));
    await this.persist();
    return t;
  }

  // ------------------------------------------------------------------ notificações
  async listNotifications(actor: User) {
    const db = await this.auth(actor);
    return db.notifications.filter((n) => n.userId === actor.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
  }

  async markNotificationsRead(actor: User, ids: string[]) {
    const db = await this.auth(actor);
    db.notifications.forEach((n) => n.userId === actor.id && ids.includes(n.id) && (n.read = true));
    await this.persist();
  }
}

export const ATTACHMENT_LABEL: Record<AttachmentKind, string> = {
  NF: 'nota fiscal',
  BOLETO: 'boleto',
  COMPROVANTE: 'comprovante',
  ORCAMENTO: 'orçamento',
  COMPROVANTE_PAGAMENTO: 'comprovante de pagamento',
  PDF_ASSINADO: 'PDF assinado (gov.br)',
};
