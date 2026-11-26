import { useEffect, useRef, useState, type ReactNode } from 'react';
import logo from '@/assets/logo-planilha-azul.png';
import logoDark from '@/assets/logo-planilha-claro.png';
import { navigate, useQuery, useSession, useUser } from '@/app/session';
import { dateTime, money, monthLabel, shiftMonth } from '@/domain/format';
import { ROLE_LABEL, SC_STATUS, scTotal } from '@/domain/sc';
import type { Role } from '@/domain/types';
import { api } from '@/services/api';
import { Icon, type IconName } from '@/components/ui/icons';
import { ThemeSwitch } from '@/components/ui/ThemeSwitch';
import { cx } from '@/components/ui/primitives';
import { CommandPalette, type Screen } from './CommandPalette';
import { MonthCalendar } from '@/components/charts/MonthCalendar';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  badge?: number;
}
interface NavGroup {
  title?: string;
  items: NavItem[];
}

const initials = (name: string) => {
  const words = name.replace(/\(.*?\)/g, '').split(/[\s.]+/).filter(Boolean);
  return (words.length > 1 ? words.map((p) => p[0]).slice(0, 2).join('') : (words[0] ?? '').slice(0, 2)).toUpperCase();
};

/**
 * Estrutura no estilo do Alto: menu lateral claro com grupos, item ativo em pílula branca,
 * cartão do setor no topo e a pessoa no rodapé; barra superior com caminho, busca (Ctrl K) e avisos.
 */
export function AppShell({ path, children }: { path: string; children: ReactNode }) {
  const user = useUser();
  const { logout, month, setMonth } = useSession();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useCollapsed();

  const { data: counts } = useQuery(async () => {
    if (user.role === 'GESTOR') return { gestor: (await api.listRequests(user, { status: 'AGUARDANDO_GESTOR' })).length };
    if (user.role === 'DIRETORIA') {
      const all = await api.listRequests(user, { status: ['AGUARDANDO_DIRETORIA', 'AGUARDANDO_GESTOR'] });
      return {
        dir:
          all.filter((r) => r.status === 'AGUARDANDO_DIRETORIA' && r.assignedDirectorId === user.id).length +
          all.filter((r) => r.status === 'AGUARDANDO_GESTOR' && !!user.sectorId && r.sectorId === user.sectorId).length,
      };
    }
    if (user.role === 'FINANCEIRO') return { fin: (await api.listRequests(user, { status: 'ENVIADA_FINANCEIRO' })).length };
    return {};
  }, [user.id]);
  const { data: sectors } = useQuery(() => api.sectorDirectory(user), [user.id]);
  const sectorName = sectors?.find((s) => s.id === user.sectorId)?.name;

  const nav: Record<Role, NavGroup[]> = {
    FUNCIONARIO: [
      { items: [{ path: '/', label: 'Início', icon: 'home' }] },
      { title: 'Solicitações', items: [{ path: '/sc', label: 'Minhas', icon: 'file' }, { path: '/sc/nova', label: 'Nova SC', icon: 'filePlus' }] },
    ],
    GESTOR: [
      { items: [{ path: '/', label: 'Início', icon: 'home' }] },
      {
        title: 'Solicitações',
        items: [
          { path: '/sc', label: 'Do setor', icon: 'file', badge: counts?.gestor },
          { path: '/sc/nova', label: 'Nova SC', icon: 'filePlus' },
          { path: '/transferencias', label: 'Transferência de limite', icon: 'transfer' },
        ],
      },
      { title: 'Organização', items: [{ path: '/usuarios', label: 'Usuários do setor', icon: 'users' }] },
    ],
    DIRETORIA: [
      { items: [{ path: '/', label: 'Início', icon: 'home' }] },
      {
        title: 'Solicitações',
        items: [
          { path: '/aprovacoes', label: 'Aprovações', icon: 'check', badge: counts?.dir },
          { path: '/sc', label: 'Todas', icon: 'file' },
          ...(user.sectorId ? [{ path: '/sc/nova', label: 'Nova SC', icon: 'filePlus' as IconName }] : []),
          { path: '/transferencias', label: 'Transferência de limite', icon: 'transfer' },
        ],
      },
    ],
    FINANCEIRO: [{ title: 'Financeiro', items: [{ path: '/', label: 'Contas a Pagar', icon: 'wallet', badge: counts?.fin }] }],
    ADMIN: [
      { items: [{ path: '/', label: 'Início', icon: 'home' }] },
      {
        title: 'Organização',
        items: [
          { path: '/setores', label: 'Setores e limites', icon: 'building' },
          { path: '/usuarios', label: 'Usuários', icon: 'users' },
          { path: '/cadastros', label: 'Centros de custo e naturezas', icon: 'tag' },
          { path: '/fornecedores', label: 'Fornecedores', icon: 'truck' },
        ],
      },
    ],
  };
  const groups = nav[user.role];
  const all = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));
  const screens: Screen[] = [
    ...all.map((i) => ({ path: i.path, label: i.label, icon: i.icon, group: i.group ?? 'Início' })),
    { path: '/perfil?aba=dados', label: 'Meu perfil', icon: 'user', group: 'Conta' },
    { path: '/perfil?aba=seguranca', label: 'Trocar senha', icon: 'shield', group: 'Conta' },
  ];
  const active = all.filter((i) => (i.path === '/' ? path === '/' : path === i.path || path.startsWith(i.path + '/'))).sort((a, b) => b.path.length - a.path.length)[0];
  const crumb =
    path === '/perfil' ? ['Meu perfil'] : path === '/sc/ver' ? ['Solicitações', 'Solicitação'] : path === '/sc/editar' ? ['Solicitações', 'Editar solicitação'] : active?.group ? [active.group, active.label] : [active?.label ?? 'Início'];

  const workspace = user.sectorId ? { title: sectorName ?? '', sub: 'Setor' } : { title: 'AM Comercial', sub: user.role === 'DIRETORIA' ? 'Diretoria' : ROLE_LABEL[user.role] };

  /** mini = menu recolhido (só ícones). No celular o menu abre sempre completo. */
  const sidebar = (mini: boolean) => (
    <nav className="flex h-full flex-col" aria-label="Menu principal">
      <div className={cx('flex h-16 items-center', mini ? 'justify-center' : 'justify-between pl-6 pr-3')}>
        {!mini && (
          <>
            <img src={logo} alt="AM Comercial" className="h-9 dark:hidden" />
            <img src={logoDark} alt="AM Comercial" className="hidden h-9 dark:block" />
          </>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="hidden h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground lg:grid"
          aria-label={mini ? 'Expandir menu' : 'Recolher menu'}
          title={mini ? 'Expandir menu' : 'Recolher menu'}
        >
          <Icon name="sidebar" size={19} />
        </button>
      </div>
      <div className="px-3">
        <div className={cx('flex items-center gap-3 rounded-md border bg-card shadow-soft', mini ? 'justify-center p-1.5' : 'px-3 py-2.5')} title={mini ? `${workspace.title} (${workspace.sub})` : undefined}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-info-soft text-[13px] font-semibold text-brand">{initials(workspace.title)}</span>
          {!mini && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{workspace.title}</div>
              <div className="truncate text-[13px] text-muted-foreground">{workspace.sub}</div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex-1 space-y-4 overflow-y-auto px-3">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title && (mini ? gi > 0 && <div className="mx-2 mb-2 border-t" /> : <div className="px-3 pb-1.5 text-[13px] text-muted-foreground">{g.title}</div>)}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const on = active?.path === it.path;
                return (
                  <li key={it.path}>
                    <a
                      href={`#${it.path}`}
                      aria-current={on ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                      title={mini ? it.label : undefined}
                      aria-label={mini ? it.label : undefined}
                      className={cx(
                        'relative flex h-10 items-center gap-3 rounded-md border text-[15px] transition-colors',
                        mini ? 'justify-center' : 'px-3',
                        on ? 'border-border bg-card shadow-soft' : 'border-transparent text-foreground/90 hover:bg-foreground/[0.05]',
                      )}
                    >
                      <Icon name={it.icon} size={19} className={on ? 'text-brand' : 'text-foreground/70'} />
                      {!mini && <span className="flex-1 truncate">{it.label}</span>}
                      {!!it.badge && mini && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />}
                      {!!it.badge && !mini && <span className="tabular min-w-[22px] rounded-full bg-primary px-1.5 text-center text-xs font-semibold leading-5 text-primary-foreground">{it.badge}</span>}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <ProfileMenu onNavigate={() => setOpen(false)} mini={mini} />
    </nav>
  );

  const showMonth = user.role !== 'FINANCEIRO';

  return (
    <div className={cx('min-h-screen transition-[padding]', collapsed ? 'lg:pl-[76px]' : 'lg:pl-64')}>
      <aside className={cx('no-print fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-sidebar transition-[width] lg:block', collapsed ? 'w-[76px]' : 'w-64')}>{sidebar(collapsed)}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside className="absolute inset-y-0 left-0 w-72 border-r bg-sidebar" onClick={(e) => e.stopPropagation()}>{sidebar(false)}</aside>
        </div>
      )}
      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-topbar/95 px-4 backdrop-blur sm:px-8">
        <button className="rounded p-2 hover:bg-foreground/[0.05] lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Icon name="menu" />
        </button>
        <ol className="hidden min-w-0 items-center gap-2 text-sm sm:flex" aria-label="Você está em">
          {crumb.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              {i > 0 && <Icon name="chevronRight" size={14} className="text-muted-foreground" />}
              <span className={cx('truncate', i === crumb.length - 1 ? 'text-foreground' : 'text-muted-foreground')}>{c}</span>
            </li>
          ))}
        </ol>
        <div className="ml-auto flex items-center gap-2">
          <CommandPalette screens={screens} />
          {showMonth && (
            <div className="flex h-9 items-center rounded-md bg-muted" aria-label="Competência">
              <button className="grid h-9 w-8 place-items-center rounded-l-md hover:bg-foreground/[0.05]" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
                <Icon name="chevronLeft" size={15} />
              </button>
              <MonthPopover />
              <button className="grid h-9 w-8 place-items-center rounded-r-md hover:bg-foreground/[0.05]" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
                <Icon name="chevronRight" size={15} />
              </button>
            </div>
          )}
          <Notifications />
        </div>
      </header>
      <main className="print-full mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}

/** O mês do topo: clicar abre um calendário comum, com os feriados nacionais. */
function MonthPopover() {
  const { month, setMonth } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Mês: ${monthLabel(month)}. Abrir calendário`}
        className="flex h-9 min-w-[124px] items-center justify-center gap-1.5 px-1 text-sm hover:text-primary"
      >
        <Icon name="calendar" size={15} className="text-muted-foreground" />
        {monthLabel(month)}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[320px] rounded-lg border bg-card p-4 shadow-pop sm:left-1/2 sm:right-auto sm:-translate-x-1/2" role="dialog" aria-label="Calendário">
          <MonthCalendar month={month} onMonth={setMonth} compact />
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: items = [] } = useQuery(() => api.listNotifications(user), [user.id]);
  const unread = items.filter((n) => !n.read);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative grid h-9 w-9 place-items-center rounded-md hover:bg-foreground/[0.05]" aria-label={`Notificações (${unread.length} não lidas)`}>
        <Icon name="bell" size={19} />
        {unread.length > 0 && (
          <span className="tabular absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#D32F2F] px-1 text-[11px] font-semibold text-white">{unread.length}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-md border bg-card shadow-pop">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Notificações</span>
            {unread.length > 0 && (
              <button className="text-[13px] text-primary hover:underline" onClick={() => api.markNotificationsRead(user, unread.map((n) => n.id))}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  className="flex w-full gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-background"
                  onClick={() => {
                    api.markNotificationsRead(user, [n.id]);
                    setOpen(false);
                    if (n.scId) navigate(`/sc/ver?id=${n.scId}`);
                  }}
                >
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand')} />
                  <span>
                    <span className={cx('block', !n.read && 'font-medium')}>{n.text}</span>
                    <span className="text-[13px] text-muted-foreground">{dateTime(n.at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Rodapé do menu: a pessoa. Ao clicar, abre o painel com perfil, avisos, segurança, tema e sair (como no Alto). */
function ProfileMenu({ onNavigate, mini }: { onNavigate: () => void; mini: boolean }) {
  const user = useUser();
  const { logout } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const go = (aba: string) => {
    setOpen(false);
    onNavigate();
    navigate(`/perfil?aba=${aba}`);
  };
  const item = 'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[15px] hover:bg-foreground/[0.05]';
  return (
    <div className="relative border-t p-3" ref={ref}>
      {open && (
        <div role="menu" className="absolute bottom-full left-3 z-40 mb-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border bg-card p-1.5 shadow-pop">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-info-soft text-[13px] font-semibold text-brand">{initials(user.name)}</span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">{user.name}</div>
              <div className="truncate text-[13px] text-muted-foreground">{user.email}</div>
            </div>
          </div>
          <div className="my-1 border-t" />
          <button role="menuitem" className={item} onClick={() => go('dados')}><Icon name="user" size={18} className="text-foreground/70" />Dados do perfil</button>
          <button role="menuitem" className={item} onClick={() => go('avisos')}><Icon name="mail" size={18} className="text-foreground/70" />Avisos por e-mail</button>
          <button role="menuitem" className={item} onClick={() => go('seguranca')}><Icon name="shield" size={18} className="text-foreground/70" />Segurança e verificação</button>
          <div className="my-1 border-t" />
          <div className="flex items-center justify-between px-3 py-1.5 text-[15px]">
            Tema
            <ThemeSwitch />
          </div>
          <div className="my-1 border-t" />
          <button role="menuitem" className={item} onClick={logout}><Icon name="logout" size={18} className="text-foreground/70" />Sair</button>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cx('flex w-full items-center gap-3 rounded-md py-1.5 text-left hover:bg-foreground/[0.05]', mini ? 'justify-center' : 'px-1.5')}
        title={mini ? user.name : undefined}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-info-soft text-[13px] font-semibold text-brand">{initials(user.name)}</span>
        {!mini && <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-[13px] text-muted-foreground">{user.role === 'DIRETORIA' ? user.cargo : ROLE_LABEL[user.role]}</span>
        </span>}
        {!mini && <Icon name="chevronsUpDown" size={16} className="text-muted-foreground" />}
      </button>
    </div>
  );
}

/** Menu recolhido ou não, lembrado neste navegador. */
function useCollapsed(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem('amc:sidebar') === 'mini';
    } catch {
      return false;
    }
  });
  const set = (next: boolean) => {
    setV(next);
    try {
      localStorage.setItem('amc:sidebar', next ? 'mini' : 'full');
    } catch {
      /* sem armazenamento */
    }
  };
  return [v, set];
}
