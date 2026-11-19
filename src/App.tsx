import { useMemo, type ComponentType } from 'react';
import { SessionProvider, useHashPath, useSession } from '@/app/session';
import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/overlay';
import { EmptyState } from '@/components/ui/primitives';
import type { Role } from '@/domain/types';
import { CodesAdmin, SectorsAdmin, SuppliersAdmin } from '@/pages/admin/AdminPages';
import { DirectorDashboard, SectorDashboard } from '@/pages/Dashboards';
import Login from '@/pages/Login';
import Payables from '@/pages/Payables';
import Profile from '@/pages/Profile';
import ScDetail from '@/pages/sc/ScDetail';
import ScForm from '@/pages/sc/ScForm';
import ScList from '@/pages/sc/ScList';
import Transfers from '@/pages/Transfers';
import Users from '@/pages/Users';
import Validate from '@/pages/Validate';

type Page = ComponentType<{ query: URLSearchParams }>;

const sc = { '/sc': () => <ScList />, '/sc/ver': ScDetail };

/** Rotas por perfil: o que não está na tabela do perfil não existe para ele (e o serviço também recusa). */
const routes: Record<Role, Record<string, Page>> = {
  FUNCIONARIO: { '/': SectorDashboard, ...sc, '/sc/nova': ScForm, '/sc/editar': ScForm },
  GESTOR: { '/': SectorDashboard, ...sc, '/sc/nova': ScForm, '/sc/editar': ScForm, '/transferencias': Transfers, '/usuarios': Users, '/perfil': Profile },
  DIRETORIA: { '/': DirectorDashboard, '/aprovacoes': () => <ScList approvals />, ...sc, '/sc/nova': ScForm, '/sc/editar': ScForm, '/transferencias': Transfers, '/perfil': Profile },
  FINANCEIRO: { '/': Payables, '/sc/ver': ScDetail },
  ADMIN: { '/': SectorsAdmin, '/usuarios': Users, '/cadastros': CodesAdmin, '/fornecedores': SuppliersAdmin },
};

function Router() {
  const { user, loading } = useSession();
  const full = useHashPath();
  const [path, search] = full.split('?');
  const query = useMemo(() => new URLSearchParams(search), [search]);

  if (path === '/validar') return <Validate query={query} />;
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando…</div>;
  if (!user) return <Login />;

  const Page = routes[user.role][path];
  return (
    <AppShell path={path}>
      {Page ? (
        <Page key={`${user.id}${full}`} query={query} />
      ) : (
        <EmptyState title="Página não encontrada ou sem permissão para o seu perfil.">
          <a href="#/" className="text-primary underline">Voltar ao início</a>
        </EmptyState>
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <Router />
      </SessionProvider>
    </ToastProvider>
  );
}
