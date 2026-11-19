import { useState } from 'react';
import { useQuery, useSession, useUser } from '@/app/session';
import { money, monthLabel } from '@/domain/format';
import { SC_STATUS, scTotal } from '@/domain/sc';
import type { ScStatus } from '@/domain/types';
import { api } from '@/services/api';
import { Button, Card, PageHeader, Select, Tabs } from '@/components/ui/primitives';
import { navigate } from '@/app/session';
import { useLookups } from '../shared/lookups';
import { ScTable } from './ScTable';

type Scope = 'acao' | 'mes' | 'todas';

/** Lista de SCs. O que cada perfil enxerga é decidido no serviço. */
export default function ScList({ approvals = false }: { approvals?: boolean }) {
  const user = useUser();
  const { month } = useSession();
  const lk = useLookups();
  const isDir = user.role === 'DIRETORIA';
  const actionStatus: ScStatus | null = user.role === 'GESTOR' ? 'AGUARDANDO_GESTOR' : isDir ? 'AGUARDANDO_DIRETORIA' : null;
  const [scope, setScope] = useState<Scope>(approvals || actionStatus ? 'acao' : 'mes');
  const [status, setStatus] = useState<ScStatus | ''>('');
  const [sectorId, setSectorId] = useState('');

  const { data: all = [] } = useQuery(() => api.listRequests(user), [user.id]);
  const actionItems = actionStatus ? all.filter((r) => r.status === actionStatus) : [];
  const items = (scope === 'acao' ? actionItems : scope === 'mes' ? all.filter((r) => r.month === month) : all)
    .filter((r) => (!status || r.status === status) && (!sectorId || r.sectorId === sectorId))
    .sort((a, b) => (scope === 'acao' ? a.createdAt.localeCompare(b.createdAt) : 0));
  const total = items.reduce((s, r) => s + scTotal(r), 0);

  const title = approvals ? 'Aprovações' : user.role === 'FUNCIONARIO' ? 'Minhas solicitações' : user.role === 'GESTOR' ? 'Solicitações do setor' : 'Solicitações de Compras';
  const tabs: { value: Scope; label: string; count?: number }[] = [
    ...(actionStatus ? [{ value: 'acao' as Scope, label: isDir ? 'Aguardando diretoria' : 'Aguardando minha aprovação', count: actionItems.length }] : []),
    { value: 'mes', label: monthLabel(month) },
    { value: 'todas', label: 'Todas' },
  ];

  return (
    <>
      <PageHeader
        title={title}
        description={`${items.length} SC · ${money(total)}`}
        actions={user.role === 'FUNCIONARIO' || user.role === 'GESTOR' ? <Button icon="plus" onClick={() => navigate('/sc/nova')}>Nova SC</Button> : undefined}
      />
      <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
        <Tabs<Scope> value={scope} onChange={setScope} items={tabs} />
        <div className="flex gap-2">
          {isDir && (
            <Select className="h-8 w-auto text-xs" value={sectorId} onChange={(e) => setSectorId(e.target.value)} aria-label="Filtrar setor">
              <option value="">Todos os setores</option>
              {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          {scope !== 'acao' && (
            <Select className="h-8 w-auto text-xs" value={status} onChange={(e) => setStatus(e.target.value as ScStatus | '')} aria-label="Filtrar status">
              <option value="">Todos os status</option>
              {Object.entries(SC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          )}
        </div>
      </div>
      <Card>
        <ScTable items={items} showSector={isDir} empty={scope === 'acao' ? 'Nenhuma SC aguardando a sua decisão.' : 'Nenhuma solicitação encontrada.'} />
      </Card>
    </>
  );
}
