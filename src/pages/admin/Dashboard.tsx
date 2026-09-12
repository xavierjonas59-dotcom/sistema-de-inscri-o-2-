import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

interface Inscricao {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
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

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Inscrições</h2>
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
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Telefone</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Data</th>
              </tr>
            </thead>
            <tbody>
              {inscricoes.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">{item.nome}</td>
                  <td className="px-4 py-3">{item.email}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">{item.telefone ?? '—'}</td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
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
