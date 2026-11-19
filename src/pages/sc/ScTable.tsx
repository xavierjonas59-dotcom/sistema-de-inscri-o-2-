import { navigate } from '@/app/session';
import { date, money } from '@/domain/format';
import { SC_STATUS, scTotal } from '@/domain/sc';
import type { PurchaseRequest } from '@/domain/types';
import { Badge, EmptyState, Table, Td, Th } from '@/components/ui/primitives';
import { useLookups } from '../shared/lookups';

export function ScStatusTag({ sc }: { sc: Pick<PurchaseRequest, 'status'> }) {
  const s = SC_STATUS[sc.status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ScTable({
  items,
  showSector,
  showDue,
  empty = 'Nenhuma solicitação encontrada.',
}: {
  items: PurchaseRequest[];
  showSector?: boolean;
  showDue?: boolean;
  empty?: string;
}) {
  const lk = useLookups();
  if (!items.length) return <EmptyState title={empty} />;
  return (
    <Table min={showSector ? 820 : 700}>
      <thead>
        <tr>
          <Th>SC</Th>
          <Th>Data</Th>
          <Th>Fornecedor</Th>
          <Th>Solicitante</Th>
          {showSector && <Th>Setor</Th>}
          {showDue && <Th>Vencimento</Th>}
          <Th right>Total</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((sc) => (
          <tr key={sc.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/sc/ver?id=${sc.id}`)}>
            <Td className="whitespace-nowrap font-medium text-primary">
              <a href={`#/sc/ver?id=${sc.id}`} onClick={(e) => e.stopPropagation()}>{sc.number}</a>
            </Td>
            <Td className="whitespace-nowrap tabular">{date(sc.date + 'T12:00')}</Td>
            <Td>{sc.supplierName || <span className="text-muted-foreground">—</span>}</Td>
            <Td>{sc.requesterName}</Td>
            {showSector && <Td>{lk.sector(sc.sectorId)}</Td>}
            {showDue && <Td className="whitespace-nowrap tabular">{nextDue(sc) ?? '—'}</Td>}
            <Td right className="font-medium">{money(scTotal(sc))}</Td>
            <Td><ScStatusTag sc={sc} /></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** Primeiro vencimento informado (ou a data da SC, quando não há parcelas). */
export function dueDate(sc: PurchaseRequest): string {
  return [...sc.installments.map((i) => i.dueDate)].sort()[0] ?? sc.date;
}
const nextDue = (sc: PurchaseRequest) => {
  const d = dueDate(sc);
  return d ? d.split('-').reverse().join('/') : null;
};
