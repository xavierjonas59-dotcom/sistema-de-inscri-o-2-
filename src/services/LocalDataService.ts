import { computeBudget, outgoingInFlight } from '@/domain/budget';
import { money } from '@/domain/format';
import type {
  BudgetOverride,
  Category,
  Expense,
  HistoryEntry,
  Month,
  Sector,
  Transfer,
  User,
  UserRecord,
} from '@/domain/types';
import {
  BusinessError,
  ForbiddenError,
  type DataService,
  type ExpenseFilter,
  type NewExpense,
  type NewTransfer,
  type TransferFilter,
  type UserInput,
} from './DataService';
import { buildSeed } from './seed';

export interface Database {
  version: number;
  users: UserRecord[];
  sectors: Sector[];
  overrides: BudgetOverride[];
  categories: Category[];
  expenses: Expense[];
  transfers: Transfer[];
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DB_VERSION = 1;
const KEY = 'mksal:db';
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`mksal:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const strip = ({ password: _p, ...u }: UserRecord): User => u;

/**
 * Implementação local (navegador) do DataService — modo demonstração.
 *
 * Aplica todas as regras de negócio e o isolamento por setor na camada de serviço.
 * ATENÇÃO: por rodar no cliente, NÃO é uma barreira de segurança real; em produção
 * use o backend Supabase, onde o isolamento é garantido por RLS no banco.
 */
export class LocalDataService implements DataService {
  private db: Database | null = null;
  private listeners = new Set<() => void>();

  constructor(private store: KeyValueStore, private now: () => Date = () => new Date()) {}

  // ---------------------------------------------------------------- infra
  private async load(): Promise<Database> {
    if (this.db) return this.db;
    const raw = this.store.getItem(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Database;
        if (parsed.version === DB_VERSION) return (this.db = parsed);
      } catch {
        /* base corrompida: recria */
      }
    }
    this.db = await buildSeed(this.now());
    this.persist();
    return this.db;
  }

  private persist() {
    this.store.setItem(KEY, JSON.stringify(this.db));
    this.listeners.forEach((l) => l());
  }

  async reset() {
    this.db = await buildSeed(this.now());
    this.persist();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private stamp(actor: User, action: string, note?: string): HistoryEntry {
    return { at: this.now().toISOString(), userId: actor.id, userName: actor.name, action, note };
  }

  // ---------------------------------------------------------------- RBAC
  private async actorOk(actor: User): Promise<Database> {
    const db = await this.load();
    const u = db.users.find((x) => x.id === actor.id);
    if (!u || !u.active) throw new ForbiddenError('Sessão inválida ou usuário inativo.');
    // Sempre confia no registro do banco, nunca no objeto recebido da UI.
    Object.assign(actor, strip(u));
    return db;
  }

  private async requireDirector(actor: User) {
    const db = await this.actorOk(actor);
    if (actor.role !== 'DIRETORIA') throw new ForbiddenError();
    return db;
  }

  private async requireManager(actor: User) {
    const db = await this.actorOk(actor);
    if (actor.role !== 'GESTOR' || !actor.sectorId) throw new ForbiddenError('Ação exclusiva de gestores de setor.');
    return db;
  }

  /** Gestor só pode acessar o próprio setor. */
  private assertSector(actor: User, sectorId: string) {
    if (actor.role === 'GESTOR' && actor.sectorId !== sectorId) {
      throw new ForbiddenError('Você não tem acesso aos dados de outro setor.');
    }
  }

  private sector(db: Database, id: string) {
    const s = db.sectors.find((x) => x.id === id);
    if (!s) throw new BusinessError('Setor não encontrado.');
    return s;
  }

  private budget(db: Database, sectorId: string, month: Month) {
    return computeBudget(this.sector(db, sectorId), month, db);
  }

  // ---------------------------------------------------------------- auth
  async login(email: string, password: string): Promise<User> {
    const db = await this.load();
    const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u || u.password !== (await hashPassword(password))) throw new BusinessError('E-mail ou senha inválidos.');
    if (!u.active) throw new BusinessError('Usuário inativo. Procure a Diretoria.');
    return strip(u);
  }

  async getUser(id: string) {
    const db = await this.load();
    const u = db.users.find((x) => x.id === id && x.active);
    return u ? strip(u) : null;
  }

  async sectorDirectory(actor: User) {
    const db = await this.actorOk(actor);
    return db.sectors.filter((s) => s.active).map(({ id, name }) => ({ id, name }));
  }

  async listCategories(actor: User, includeInactive = false) {
    const db = await this.actorOk(actor);
    return db.categories.filter((c) => includeInactive || c.active).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------------------------------------------------------------- orçamento
  async getBudget(actor: User, sectorId: string, month: Month) {
    const db = await this.actorOk(actor);
    this.assertSector(actor, sectorId);
    return this.budget(db, sectorId, month);
  }

  async getAllBudgets(actor: User, month: Month) {
    const db = await this.requireDirector(actor);
    return db.sectors.filter((s) => s.active).map((s) => this.budget(db, s.id, month));
  }

  // ---------------------------------------------------------------- despesas
  async listExpenses(actor: User, f: ExpenseFilter = {}) {
    const db = await this.actorOk(actor);
    const sectorId = actor.role === 'GESTOR' ? actor.sectorId! : f.sectorId;
    return db.expenses
      .filter(
        (e) =>
          (!sectorId || e.sectorId === sectorId) &&
          (!f.month || e.month === f.month) &&
          (!f.requesterId || e.requesterId === f.requesterId) &&
          (!f.status || e.status === f.status) &&
          (!f.categoryId || e.categoryId === f.categoryId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createExpense(actor: User, input: NewExpense) {
    const db = await this.requireManager(actor);
    const description = input.description.trim();
    const justification = input.justification.trim();
    if (description.length < 3) throw new BusinessError('Informe a descrição do item/serviço.');
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new BusinessError('Informe um valor maior que zero.');
    if (justification.length < 10) throw new BusinessError('A justificativa deve ter ao menos 10 caracteres.');
    const cat = db.categories.find((c) => c.id === input.categoryId && c.active);
    if (!cat) throw new BusinessError('Selecione uma natureza de despesa válida.');
    if (!input.attachment) throw new BusinessError('Anexe o comprovante ou orçamento (PDF ou imagem).');
    if (!ALLOWED_ATTACHMENT_TYPES.includes(input.attachment.mimeType))
      throw new BusinessError('Anexo deve ser PDF, PNG, JPG ou WEBP.');
    if (input.attachment.size > MAX_ATTACHMENT_BYTES) throw new BusinessError('Anexo excede o limite de 2 MB.');

    const b = this.budget(db, actor.sectorId!, input.month);
    if (input.amount > b.available) {
      throw new BusinessError(
        `Saldo insuficiente: disponível ${money(Math.max(0, b.available))} para ${money(input.amount)}. ` +
          'Solicite uma transferência temporária de limite a outro setor.',
      );
    }
    const e: Expense = {
      id: uid(),
      sectorId: actor.sectorId!,
      requesterId: actor.id,
      requesterName: actor.name,
      month: input.month,
      description,
      amount: input.amount,
      categoryId: cat.id,
      justification,
      attachment: input.attachment,
      status: 'PENDENTE_DIRETORIA',
      createdAt: this.now().toISOString(),
      history: [this.stamp(actor, 'Solicitação criada')],
    };
    db.expenses.push(e);
    this.persist();
    return e;
  }

  async decideExpense(actor: User, id: string, approve: boolean, reason?: string) {
    const db = await this.requireDirector(actor);
    const e = db.expenses.find((x) => x.id === id);
    if (!e) throw new BusinessError('Solicitação não encontrada.');
    if (e.status !== 'PENDENTE_DIRETORIA') throw new BusinessError('Esta solicitação já foi decidida.');
    if (!approve && !reason?.trim()) throw new BusinessError('Informe o motivo da rejeição.');
    if (approve) {
      // O pendente já está reservado; só bloqueia se o teto foi reduzido depois da solicitação.
      const b = this.budget(db, e.sectorId, e.month);
      if (b.approved + e.amount > b.ceiling)
        throw new BusinessError('Aprovação excederia o teto do setor (o teto foi reduzido após a solicitação).');
    }
    e.status = approve ? 'APROVADA' : 'REJEITADA';
    e.decisionReason = reason?.trim() || undefined;
    e.decidedAt = this.now().toISOString();
    e.decidedBy = actor.id;
    e.history.push(this.stamp(actor, approve ? 'Aprovada pela Diretoria' : 'Rejeitada pela Diretoria', e.decisionReason));
    this.persist();
    return e;
  }

  async cancelExpense(actor: User, id: string) {
    const db = await this.requireManager(actor);
    const e = db.expenses.find((x) => x.id === id);
    if (!e) throw new BusinessError('Solicitação não encontrada.');
    this.assertSector(actor, e.sectorId);
    if (e.status !== 'PENDENTE_DIRETORIA') throw new BusinessError('Somente solicitações pendentes podem ser canceladas.');
    e.status = 'CANCELADA';
    e.history.push(this.stamp(actor, 'Cancelada pelo solicitante'));
    this.persist();
    return e;
  }

  // ---------------------------------------------------------------- transferências
  async listTransfers(actor: User, f: TransferFilter = {}) {
    const db = await this.actorOk(actor);
    return db.transfers
      .filter((t) => {
        if (actor.role === 'GESTOR') {
          // Gestor vê apenas transferências em que seu setor é parte (solicitante ou cedente).
          if (t.requestingSectorId !== actor.sectorId && t.grantingSectorId !== actor.sectorId) return false;
        } else if (f.sectorId && t.requestingSectorId !== f.sectorId && t.grantingSectorId !== f.sectorId) return false;
        return (!f.month || t.month === f.month) && (!f.status || t.status === f.status);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createTransfer(actor: User, input: NewTransfer) {
    const db = await this.requireManager(actor);
    const justification = input.justification.trim();
    if (input.grantingSectorId === actor.sectorId) throw new BusinessError('Escolha um setor diferente do seu.');
    const grantor = this.sector(db, input.grantingSectorId);
    if (!grantor.active) throw new BusinessError('Setor cedente inativo.');
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new BusinessError('Informe um valor maior que zero.');
    if (justification.length < 10) throw new BusinessError('A justificativa deve ter ao menos 10 caracteres.');
    const t: Transfer = {
      id: uid(),
      requestingSectorId: actor.sectorId!,
      grantingSectorId: grantor.id,
      requesterId: actor.id,
      requesterName: actor.name,
      month: input.month,
      amount: input.amount,
      justification,
      status: 'PENDENTE_CEDENTE',
      createdAt: this.now().toISOString(),
      history: [this.stamp(actor, 'Pedido de transferência criado')],
    };
    db.transfers.push(t);
    this.persist();
    return t;
  }

  /** Passo 1: gestor do setor cedente aceita ou recusa. */
  async grantorDecide(actor: User, id: string, approve: boolean, note?: string) {
    const db = await this.requireManager(actor);
    const t = db.transfers.find((x) => x.id === id);
    if (!t) throw new BusinessError('Transferência não encontrada.');
    if (t.grantingSectorId !== actor.sectorId) throw new ForbiddenError('Apenas o gestor do setor cedente pode decidir.');
    if (t.status !== 'PENDENTE_CEDENTE') throw new BusinessError('Esta transferência não aguarda o cedente.');
    if (!approve && !note?.trim()) throw new BusinessError('Informe o motivo da recusa.');
    if (approve) {
      const b = this.budget(db, t.grantingSectorId, t.month);
      const free = b.available - outgoingInFlight(t.grantingSectorId, t.month, db.transfers, t.id);
      if (t.amount > free)
        throw new BusinessError(`Seu saldo livre (${money(Math.max(0, free))}) não cobre a cessão de ${money(t.amount)}.`);
    }
    t.status = approve ? 'PENDENTE_DIRETORIA' : 'RECUSADA_CEDENTE';
    t.grantorDecisionBy = actor.id;
    t.grantorDecisionAt = this.now().toISOString();
    t.grantorNote = note?.trim() || undefined;
    t.history.push(this.stamp(actor, approve ? 'Aceita pelo gestor cedente' : 'Recusada pelo gestor cedente', t.grantorNote));
    this.persist();
    return t;
  }

  /** Passo 2: Diretoria dá a aprovação final — só aqui o limite é efetivamente transferido. */
  async directorDecide(actor: User, id: string, approve: boolean, note?: string) {
    const db = await this.requireDirector(actor);
    const t = db.transfers.find((x) => x.id === id);
    if (!t) throw new BusinessError('Transferência não encontrada.');
    if (t.status !== 'PENDENTE_DIRETORIA')
      throw new BusinessError('A transferência precisa do aceite do gestor cedente antes da Diretoria.');
    if (!approve && !note?.trim()) throw new BusinessError('Informe o motivo da rejeição.');
    if (approve) {
      const b = this.budget(db, t.grantingSectorId, t.month);
      if (t.amount > b.available)
        throw new BusinessError(
          `O setor cedente não tem mais saldo para ceder (disponível ${money(Math.max(0, b.available))}).`,
        );
    }
    t.status = approve ? 'APROVADA' : 'REJEITADA_DIRETORIA';
    t.directorDecisionBy = actor.id;
    t.directorDecisionAt = this.now().toISOString();
    t.directorNote = note?.trim() || undefined;
    t.history.push(
      this.stamp(actor, approve ? 'Aprovada pela Diretoria — limite transferido' : 'Rejeitada pela Diretoria', t.directorNote),
    );
    this.persist();
    return t;
  }

  async cancelTransfer(actor: User, id: string) {
    const db = await this.requireManager(actor);
    const t = db.transfers.find((x) => x.id === id);
    if (!t) throw new BusinessError('Transferência não encontrada.');
    if (t.requestingSectorId !== actor.sectorId) throw new ForbiddenError();
    if (t.status !== 'PENDENTE_CEDENTE' && t.status !== 'PENDENTE_DIRETORIA')
      throw new BusinessError('Somente pedidos em andamento podem ser cancelados.');
    t.status = 'CANCELADA';
    t.history.push(this.stamp(actor, 'Cancelada pelo solicitante'));
    this.persist();
    return t;
  }

  // ---------------------------------------------------------------- administração
  async listUsers(actor: User) {
    const db = await this.requireDirector(actor);
    return db.users.map(strip).sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveUser(actor: User, input: UserInput) {
    const db = await this.requireDirector(actor);
    const email = input.email.trim().toLowerCase();
    if (input.name.trim().length < 3) throw new BusinessError('Informe o nome completo.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BusinessError('E-mail inválido.');
    if (db.users.some((u) => u.email === email && u.id !== input.id)) throw new BusinessError('E-mail já cadastrado.');
    if (input.role === 'GESTOR' && !input.sectorId) throw new BusinessError('Gestor precisa estar vinculado a um setor.');
    if (input.password !== undefined && input.password !== '' && input.password.length < 6)
      throw new BusinessError('A senha deve ter ao menos 6 caracteres.');
    const sectorId = input.role === 'GESTOR' ? input.sectorId : null;
    if (sectorId) this.sector(db, sectorId);

    if (input.id) {
      const u = db.users.find((x) => x.id === input.id);
      if (!u) throw new BusinessError('Usuário não encontrado.');
      if (u.id === actor.id && (!input.active || input.role !== 'DIRETORIA'))
        throw new BusinessError('Você não pode remover o seu próprio acesso de Diretoria.');
      Object.assign(u, { name: input.name.trim(), email, role: input.role, sectorId, active: input.active });
      if (input.password) u.password = await hashPassword(input.password);
      this.persist();
      return strip(u);
    }
    if (!input.password) throw new BusinessError('Defina uma senha inicial.');
    const u: UserRecord = {
      id: uid(),
      name: input.name.trim(),
      email,
      role: input.role,
      sectorId,
      active: input.active,
      password: await hashPassword(input.password),
    };
    db.users.push(u);
    this.persist();
    return strip(u);
  }

  async listSectors(actor: User) {
    const db = await this.requireDirector(actor);
    return [...db.sectors].sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveSector(actor: User, input: Partial<Sector> & Pick<Sector, 'name' | 'defaultCeiling'>) {
    const db = await this.requireDirector(actor);
    const name = input.name.trim();
    if (name.length < 2) throw new BusinessError('Informe o nome do setor.');
    if (!Number.isInteger(input.defaultCeiling) || input.defaultCeiling < 0) throw new BusinessError('Teto inválido.');
    if (db.sectors.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== input.id))
      throw new BusinessError('Já existe um setor com esse nome.');
    if (input.id) {
      const s = this.sector(db, input.id);
      Object.assign(s, { name, defaultCeiling: input.defaultCeiling, active: input.active ?? s.active });
      this.persist();
      return s;
    }
    const s: Sector = { id: uid(), name, defaultCeiling: input.defaultCeiling, active: input.active ?? true };
    db.sectors.push(s);
    this.persist();
    return s;
  }

  async listOverrides(actor: User, month: Month) {
    const db = await this.requireDirector(actor);
    return db.overrides.filter((o) => o.month === month);
  }

  async setOverride(actor: User, sectorId: string, month: Month, ceiling: number | null) {
    const db = await this.requireDirector(actor);
    this.sector(db, sectorId);
    db.overrides = db.overrides.filter((o) => !(o.sectorId === sectorId && o.month === month));
    if (ceiling !== null) {
      if (!Number.isInteger(ceiling) || ceiling < 0) throw new BusinessError('Teto inválido.');
      db.overrides.push({ sectorId, month, ceiling });
    }
    this.persist();
  }

  async saveCategory(actor: User, input: Partial<Category> & Pick<Category, 'name'>) {
    const db = await this.requireDirector(actor);
    const name = input.name.trim();
    if (name.length < 2) throw new BusinessError('Informe o nome da natureza.');
    if (db.categories.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== input.id))
      throw new BusinessError('Natureza já cadastrada.');
    if (input.id) {
      const c = db.categories.find((x) => x.id === input.id);
      if (!c) throw new BusinessError('Natureza não encontrada.');
      Object.assign(c, { name, active: input.active ?? c.active });
      this.persist();
      return c;
    }
    const c: Category = { id: uid(), name, active: true };
    db.categories.push(c);
    this.persist();
    return c;
  }
}
