-- =============================================================================
-- MKSAL · Controle de Despesas e Orçamentos por Setor
-- Schema + Row Level Security + RPCs de fluxo (Supabase / PostgreSQL 15)
--
-- Princípios:
--  * Isolamento por setor garantido NO BANCO (RLS), não só na interface.
--  * Mudanças de status só acontecem por funções (RPC) que validam as regras;
--    os clientes não têm permissão de UPDATE direto em despesas/transferências.
--  * Valores monetários em centavos (bigint) para evitar erros de arredondamento.
-- =============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------- tipos
create type public.app_role as enum ('DIRETORIA', 'GESTOR');
create type public.expense_status as enum ('PENDENTE_DIRETORIA', 'APROVADA', 'REJEITADA', 'CANCELADA');
create type public.transfer_status as enum (
  'PENDENTE_CEDENTE', 'PENDENTE_DIRETORIA', 'APROVADA', 'RECUSADA_CEDENTE', 'REJEITADA_DIRETORIA', 'CANCELADA'
);

-- ----------------------------------------------------------------------------- tabelas
create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_ceiling bigint not null check (default_ceiling >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Perfil de aplicação vinculado ao usuário do Supabase Auth.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role public.app_role not null,
  sector_id uuid references public.sectors (id),
  active boolean not null default true,
  constraint gestor_has_sector check (role = 'DIRETORIA' or sector_id is not null)
);

-- Teto específico por competência (sobrepõe o padrão do setor).
create table public.budget_overrides (
  sector_id uuid not null references public.sectors (id) on delete cascade,
  month char(7) not null check (month ~ '^\d{4}-\d{2}$'),
  ceiling bigint not null check (ceiling >= 0),
  primary key (sector_id, month)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references public.sectors (id),
  requester_id uuid not null references public.profiles (id),
  requester_name text not null,
  month char(7) not null check (month ~ '^\d{4}-\d{2}$'),
  description text not null check (length(trim(description)) >= 3),
  amount bigint not null check (amount > 0),
  category_id uuid not null references public.categories (id),
  justification text not null check (length(trim(justification)) >= 10),
  attachment_path text not null,          -- caminho no bucket "comprovantes"
  attachment_name text not null,
  status public.expense_status not null default 'PENDENTE_DIRETORIA',
  decision_reason text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.expenses (sector_id, month, status);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  requesting_sector_id uuid not null references public.sectors (id),
  granting_sector_id uuid not null references public.sectors (id),
  requester_id uuid not null references public.profiles (id),
  requester_name text not null,
  month char(7) not null check (month ~ '^\d{4}-\d{2}$'),
  amount bigint not null check (amount > 0),
  justification text not null check (length(trim(justification)) >= 10),
  status public.transfer_status not null default 'PENDENTE_CEDENTE',
  grantor_decision_by uuid references public.profiles (id),
  grantor_decision_at timestamptz,
  grantor_note text,
  director_decision_by uuid references public.profiles (id),
  director_decision_at timestamptz,
  director_note text,
  created_at timestamptz not null default now(),
  constraint different_sectors check (requesting_sector_id <> granting_sector_id)
);
create index on public.transfers (month, status);

-- Trilha de auditoria (histórico exibido nas telas).
create table public.history (
  id bigserial primary key,
  entity text not null check (entity in ('expense', 'transfer')),
  entity_id uuid not null,
  at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id),
  user_name text not null,
  action text not null,
  note text
);
create index on public.history (entity, entity_id);

-- ----------------------------------------------------------------------------- helpers
create or replace function public.me() returns public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_director() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'DIRETORIA')
$$;

create or replace function public.my_sector() returns uuid
language sql stable security definer set search_path = public as $$
  select sector_id from public.profiles where id = auth.uid() and active
$$;

-- Orçamento calculado (mesmas regras de src/domain/budget.ts).
create or replace function public._budget(p_sector uuid, p_month char(7))
returns table (
  sector_id uuid, month char(7), base_ceiling bigint, transfers_in bigint, transfers_out bigint,
  ceiling bigint, approved bigint, pending bigint, available bigint
)
language sql stable security definer set search_path = public as $$
  with base as (
    select coalesce(
      (select o.ceiling from budget_overrides o where o.sector_id = p_sector and o.month = p_month),
      (select s.default_ceiling from sectors s where s.id = p_sector)
    ) as v
  ),
  tin as (select coalesce(sum(amount), 0)::bigint v from transfers
          where requesting_sector_id = p_sector and month = p_month and status = 'APROVADA'),
  tout as (select coalesce(sum(amount), 0)::bigint v from transfers
           where granting_sector_id = p_sector and month = p_month and status = 'APROVADA'),
  ex as (select coalesce(sum(amount) filter (where status = 'APROVADA'), 0)::bigint a,
                coalesce(sum(amount) filter (where status = 'PENDENTE_DIRETORIA'), 0)::bigint p
         from expenses where sector_id = p_sector and month = p_month)
  select p_sector, p_month, base.v, tin.v, tout.v,
         base.v + tin.v - tout.v, ex.a, ex.p, base.v + tin.v - tout.v - ex.a - ex.p
  from base, tin, tout, ex
$$;
revoke all on function public._budget(uuid, char) from public, anon, authenticated;

-- API pública de orçamento: gestor só consulta o próprio setor.
create or replace function public.sector_budget(p_sector uuid, p_month char(7))
returns table (
  sector_id uuid, month char(7), base_ceiling bigint, transfers_in bigint, transfers_out bigint,
  ceiling bigint, approved bigint, pending bigint, available bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_director() and p_sector is distinct from public.my_sector() then
    raise exception 'Você não tem acesso aos dados de outro setor.' using errcode = '42501';
  end if;
  return query select * from public._budget(p_sector, p_month);
end $$;

create or replace function public.all_budgets(p_month char(7))
returns table (
  sector_id uuid, month char(7), base_ceiling bigint, transfers_in bigint, transfers_out bigint,
  ceiling bigint, approved bigint, pending bigint, available bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_director() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return query select b.* from sectors s cross join lateral public._budget(s.id, p_month) b where s.active;
end $$;

-- Diretório mínimo de setores (id/nome), sem tetos, para escolher o cedente.
create or replace function public.sector_directory()
returns table (id uuid, name text) language sql stable security definer set search_path = public as $$
  select id, name from sectors where active and auth.uid() is not null order by name
$$;

create or replace function public._log(p_entity text, p_id uuid, p_action text, p_note text default null)
returns void language sql security definer set search_path = public as $$
  insert into history (entity, entity_id, user_id, user_name, action, note)
  select p_entity, p_id, p.id, p.name, p_action, nullif(trim(p_note), '') from profiles p where p.id = auth.uid()
$$;
revoke all on function public._log(text, uuid, text, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------- RPCs · despesas
create or replace function public.create_expense(
  p_month char(7), p_description text, p_amount bigint, p_category uuid, p_justification text,
  p_attachment_path text, p_attachment_name text
) returns public.expenses language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_avail bigint; v_row expenses;
begin
  v_me := public.me();
  if v_me.id is null or v_me.role <> 'GESTOR' then raise exception 'Ação exclusiva de gestores.' using errcode = '42501'; end if;
  if not exists (select 1 from categories where id = p_category and active) then raise exception 'Natureza inválida.'; end if;
  -- O anexo precisa estar na pasta do próprio setor no bucket.
  if split_part(p_attachment_path, '/', 1) <> v_me.sector_id::text then raise exception 'Anexo inválido.'; end if;

  perform pg_advisory_xact_lock(hashtext(v_me.sector_id::text || p_month)); -- evita corrida de saldo
  select available into v_avail from public._budget(v_me.sector_id, p_month);
  if p_amount > v_avail then
    raise exception 'Saldo insuficiente: disponível % centavos. Solicite uma transferência de limite.', greatest(v_avail, 0);
  end if;

  insert into expenses (sector_id, requester_id, requester_name, month, description, amount, category_id,
                        justification, attachment_path, attachment_name)
  values (v_me.sector_id, v_me.id, v_me.name, p_month, trim(p_description), p_amount, p_category,
          trim(p_justification), p_attachment_path, p_attachment_name)
  returning * into v_row;
  perform public._log('expense', v_row.id, 'Solicitação criada');
  return v_row;
end $$;

create or replace function public.decide_expense(p_id uuid, p_approve boolean, p_reason text default null)
returns public.expenses language plpgsql security definer set search_path = public as $$
declare v_row expenses; v_b record;
begin
  if not public.is_director() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  select * into v_row from expenses where id = p_id for update;
  if v_row.id is null then raise exception 'Solicitação não encontrada.'; end if;
  if v_row.status <> 'PENDENTE_DIRETORIA' then raise exception 'Esta solicitação já foi decidida.'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then raise exception 'Informe o motivo da rejeição.'; end if;
  if p_approve then
    select * into v_b from public._budget(v_row.sector_id, v_row.month);
    if v_b.approved + v_row.amount > v_b.ceiling then raise exception 'Aprovação excederia o teto do setor.'; end if;
  end if;
  update expenses set status = case when p_approve then 'APROVADA'::expense_status else 'REJEITADA' end,
         decision_reason = nullif(trim(p_reason), ''), decided_by = auth.uid(), decided_at = now()
   where id = p_id returning * into v_row;
  perform public._log('expense', p_id, case when p_approve then 'Aprovada pela Diretoria' else 'Rejeitada pela Diretoria' end, p_reason);
  return v_row;
end $$;

create or replace function public.cancel_expense(p_id uuid)
returns public.expenses language plpgsql security definer set search_path = public as $$
declare v_row expenses;
begin
  update expenses set status = 'CANCELADA'
   where id = p_id and status = 'PENDENTE_DIRETORIA' and sector_id = public.my_sector()
  returning * into v_row;
  if v_row.id is null then raise exception 'Somente solicitações pendentes do seu setor podem ser canceladas.'; end if;
  perform public._log('expense', p_id, 'Cancelada pelo solicitante');
  return v_row;
end $$;

-- ----------------------------------------------------------------------------- RPCs · transferências
create or replace function public.create_transfer(p_granting uuid, p_month char(7), p_amount bigint, p_justification text)
returns public.transfers language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_row transfers;
begin
  v_me := public.me();
  if v_me.id is null or v_me.role <> 'GESTOR' then raise exception 'Ação exclusiva de gestores.' using errcode = '42501'; end if;
  if p_granting = v_me.sector_id then raise exception 'Escolha um setor diferente do seu.'; end if;
  if not exists (select 1 from sectors where id = p_granting and active) then raise exception 'Setor cedente inválido.'; end if;
  insert into transfers (requesting_sector_id, granting_sector_id, requester_id, requester_name, month, amount, justification)
  values (v_me.sector_id, p_granting, v_me.id, v_me.name, p_month, p_amount, trim(p_justification))
  returning * into v_row;
  perform public._log('transfer', v_row.id, 'Pedido de transferência criado');
  return v_row;
end $$;

-- Passo 1: gestor do setor cedente.
create or replace function public.grantor_decide_transfer(p_id uuid, p_approve boolean, p_note text default null)
returns public.transfers language plpgsql security definer set search_path = public as $$
declare v_row transfers; v_free bigint;
begin
  select * into v_row from transfers where id = p_id for update;
  if v_row.id is null then raise exception 'Transferência não encontrada.'; end if;
  if v_row.granting_sector_id is distinct from public.my_sector() then
    raise exception 'Apenas o gestor do setor cedente pode decidir.' using errcode = '42501';
  end if;
  if v_row.status <> 'PENDENTE_CEDENTE' then raise exception 'Esta transferência não aguarda o cedente.'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'Informe o motivo da recusa.'; end if;
  if p_approve then
    perform pg_advisory_xact_lock(hashtext(v_row.granting_sector_id::text || v_row.month));
    select b.available - coalesce((select sum(amount) from transfers t
             where t.granting_sector_id = v_row.granting_sector_id and t.month = v_row.month
               and t.status = 'PENDENTE_DIRETORIA' and t.id <> p_id), 0)
      into v_free from public._budget(v_row.granting_sector_id, v_row.month) b;
    if v_row.amount > v_free then raise exception 'Seu saldo livre não cobre esta cessão.'; end if;
  end if;
  update transfers set status = case when p_approve then 'PENDENTE_DIRETORIA'::transfer_status else 'RECUSADA_CEDENTE' end,
         grantor_decision_by = auth.uid(), grantor_decision_at = now(), grantor_note = nullif(trim(p_note), '')
   where id = p_id returning * into v_row;
  perform public._log('transfer', p_id, case when p_approve then 'Aceita pelo gestor cedente' else 'Recusada pelo gestor cedente' end, p_note);
  return v_row;
end $$;

-- Passo 2: Diretoria. Só aqui o limite é efetivamente transferido (status APROVADA entra no cálculo de teto).
create or replace function public.director_decide_transfer(p_id uuid, p_approve boolean, p_note text default null)
returns public.transfers language plpgsql security definer set search_path = public as $$
declare v_row transfers; v_avail bigint;
begin
  if not public.is_director() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  select * into v_row from transfers where id = p_id for update;
  if v_row.id is null then raise exception 'Transferência não encontrada.'; end if;
  if v_row.status <> 'PENDENTE_DIRETORIA' then raise exception 'A transferência precisa do aceite do gestor cedente.'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'Informe o motivo da rejeição.'; end if;
  if p_approve then
    perform pg_advisory_xact_lock(hashtext(v_row.granting_sector_id::text || v_row.month));
    select available into v_avail from public._budget(v_row.granting_sector_id, v_row.month);
    if v_row.amount > v_avail then raise exception 'O setor cedente não tem mais saldo para ceder.'; end if;
  end if;
  update transfers set status = case when p_approve then 'APROVADA'::transfer_status else 'REJEITADA_DIRETORIA' end,
         director_decision_by = auth.uid(), director_decision_at = now(), director_note = nullif(trim(p_note), '')
   where id = p_id returning * into v_row;
  perform public._log('transfer', p_id,
    case when p_approve then 'Aprovada pela Diretoria — limite transferido' else 'Rejeitada pela Diretoria' end, p_note);
  return v_row;
end $$;

create or replace function public.cancel_transfer(p_id uuid)
returns public.transfers language plpgsql security definer set search_path = public as $$
declare v_row transfers;
begin
  update transfers set status = 'CANCELADA'
   where id = p_id and requesting_sector_id = public.my_sector()
     and status in ('PENDENTE_CEDENTE', 'PENDENTE_DIRETORIA')
  returning * into v_row;
  if v_row.id is null then raise exception 'Somente pedidos em andamento do seu setor podem ser cancelados.'; end if;
  perform public._log('transfer', p_id, 'Cancelada pelo solicitante');
  return v_row;
end $$;

-- ----------------------------------------------------------------------------- RLS
alter table public.sectors enable row level security;
alter table public.profiles enable row level security;
alter table public.budget_overrides enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.transfers enable row level security;
alter table public.history enable row level security;

-- Setores: Diretoria vê e gerencia todos; gestor vê apenas o próprio (nomes dos demais via sector_directory()).
create policy sectors_select on public.sectors for select to authenticated
  using (public.is_director() or id = public.my_sector());
create policy sectors_write on public.sectors for all to authenticated
  using (public.is_director()) with check (public.is_director());

-- Perfis: cada um vê o seu; Diretoria vê e gerencia todos.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_director());
create policy profiles_write on public.profiles for all to authenticated
  using (public.is_director()) with check (public.is_director());

create policy overrides_select on public.budget_overrides for select to authenticated
  using (public.is_director() or sector_id = public.my_sector());
create policy overrides_write on public.budget_overrides for all to authenticated
  using (public.is_director()) with check (public.is_director());

create policy categories_select on public.categories for select to authenticated using (true);
create policy categories_write on public.categories for all to authenticated
  using (public.is_director()) with check (public.is_director());

-- Despesas: isolamento total por setor. Escrita apenas via RPC (sem policies de insert/update).
create policy expenses_select on public.expenses for select to authenticated
  using (public.is_director() or sector_id = public.my_sector());

-- Transferências: gestor vê apenas as que envolvem o seu setor.
create policy transfers_select on public.transfers for select to authenticated
  using (public.is_director() or requesting_sector_id = public.my_sector() or granting_sector_id = public.my_sector());

-- Histórico segue a visibilidade da entidade.
create policy history_select on public.history for select to authenticated using (
  public.is_director()
  or (entity = 'expense' and exists (select 1 from expenses e where e.id = entity_id and e.sector_id = public.my_sector()))
  or (entity = 'transfer' and exists (select 1 from transfers t where t.id = entity_id
        and public.my_sector() in (t.requesting_sector_id, t.granting_sector_id)))
);

-- ----------------------------------------------------------------------------- Storage (comprovantes)
-- Arquivos ficam em comprovantes/<sector_id>/<uuid>.<ext>; gestor só lê/grava na pasta do seu setor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 2097152, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy comprovantes_read on storage.objects for select to authenticated using (
  bucket_id = 'comprovantes' and (public.is_director() or (storage.foldername(name))[1] = public.my_sector()::text)
);
create policy comprovantes_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'comprovantes' and (storage.foldername(name))[1] = public.my_sector()::text
);

-- ----------------------------------------------------------------------------- permissões de execução
revoke execute on all functions in schema public from anon;
grant execute on function
  public.sector_budget(uuid, char), public.all_budgets(char), public.sector_directory(),
  public.create_expense(char, text, bigint, uuid, text, text, text), public.decide_expense(uuid, boolean, text),
  public.cancel_expense(uuid), public.create_transfer(uuid, char, bigint, text),
  public.grantor_decide_transfer(uuid, boolean, text), public.director_decide_transfer(uuid, boolean, text),
  public.cancel_transfer(uuid), public.is_director(), public.my_sector()
to authenticated;
