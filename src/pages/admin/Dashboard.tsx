import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

interface Inscricao {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  cpf: string;
  status: string | null;
  comprovante_url: string | null;
  created_at: string;
}

export default function AdminDashboard() {
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase
          .from('inscricoes')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setInscricoes((data as Inscricao[]) ?? []);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('inscricoes').update({ status }).eq('id', id);
      if (error) throw error;
      setInscricoes((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status } : item))
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar status');
    }
  };

  const handleViewReceipt = (fileName: string | null) => {
    if (!fileName) return;
    const { data } = supabase.storage.from('comprovantes').getPublicUrl(fileName);
    if (data?.publicUrl) {
      window.open(data.publicUrl, '_blank');
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Nome', 'E-mail', 'Telefone', 'CPF', 'Status', 'Data da Inscrição'];
    const rows = inscricoes.map((i) => [
      i.id,
      i.nome,
      i.email,
      i.telefone || '',
      i.cpf,
      i.status || 'pendente',
      new Date(i.created_at).toLocaleString('pt-BR')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'inscricoes.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const total = inscricoes.length;
  const pendentes = inscricoes.filter((i) => i.status === 'pendente' || !i.status).length;
  const aprovadas = inscricoes.filter((i) => i.status === 'aprovada').length;

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Inscrições</h2>
        <button
          onClick={handleExportCSV}
          disabled={inscricoes.length === 0}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Exportar CSV
        </button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Total de Inscrições</p>
          <p className="text-2xl font-bold">{total}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Aprovadas</p>
          <p className="text-2xl font-bold text-green-600">{aprovadas}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Pendentes</p>
          <p className="text-2xl font-bold text-yellow-600">{pendentes}</p>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : inscricoes.length === 0 && !errorMsg ? (
        <p className="text-muted-foreground">Nenhuma inscrição encontrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">CPF</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {inscricoes.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">{item.nome}</td>
                  <td className="px-4 py-3">{item.email}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {item.cpf ? item.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        item.status === 'aprovada'
                          ? 'bg-green-100 text-green-800'
                          : item.status === 'rejeitada'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {item.status
                        ? item.status.charAt(0).toUpperCase() + item.status.slice(1)
                        : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {item.comprovante_url && (
                        <button
                          onClick={() => handleViewReceipt(item.comprovante_url)}
                          className="inline-flex items-center justify-center rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
                        >
                          Ver Comprovante
                        </button>
                      )}
                      <button
                        onClick={() => handleUpdateStatus(item.id, 'aprovada')}
                        disabled={item.status === 'aprovada'}
                        className="inline-flex items-center justify-center rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(item.id, 'rejeitada')}
                        disabled={item.status === 'rejeitada'}
                        className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Rejeitar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
