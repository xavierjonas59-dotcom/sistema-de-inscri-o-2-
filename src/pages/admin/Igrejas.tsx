import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

interface Igreja {
  id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  created_at: string;
}

export default function AdminIgrejas() {
  const [igrejas, setIgrejas] = useState<Igreja[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchIgrejas();
  }, []);

  const fetchIgrejas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('igrejas')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setIgrejas(data || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao buscar igrejas');
    } finally {
      setLoading(false);
    }
  };

  const handleAddIgreja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.from('igrejas').insert([{
        nome: nome.trim(),
        cidade: cidade.trim() || null,
        estado: estado.trim() || null
      }]);
      if (error) throw error;
      setNome('');
      setCidade('');
      setEstado('');
      fetchIgrejas();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao adicionar igreja');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta igreja?')) return;
    try {
      const { error } = await supabase.from('igrejas').delete().eq('id', id);
      if (error) throw error;
      setIgrejas((prev) => prev.filter((ig) => ig.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir igreja');
    }
  };

  return (
    <AdminLayout>
      <h2 className="text-2xl font-bold mb-6">Gerenciar Igrejas</h2>
      
      {errorMsg && (
        <div className="mb-4 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      <div className="mb-8 rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Nova Igreja / Oficina</h3>
        <form onSubmit={handleAddIgreja} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="nome" className="text-sm font-medium">Nome da Igreja *</label>
              <input id="nome" value={nome} onChange={e => setNome(e.target.value)} required className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
            </div>
            <div className="space-y-2">
              <label htmlFor="cidade" className="text-sm font-medium">Cidade</label>
              <input id="cidade" value={cidade} onChange={e => setCidade(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
            </div>
            <div className="space-y-2">
              <label htmlFor="estado" className="text-sm font-medium">Estado (UF)</label>
              <input id="estado" value={estado} onChange={e => setEstado(e.target.value)} maxLength={2} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm uppercase" />
            </div>
          </div>
          <button type="submit" disabled={submitting} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? 'Salvando...' : 'Salvar Igreja'}
          </button>
        </form>
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-4 text-muted-foreground">Carregando...</p>
        ) : igrejas.length === 0 ? (
          <p className="p-4 text-muted-foreground">Nenhuma igreja cadastrada.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Cidade</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {igrejas.map((ig) => (
                <tr key={ig.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{ig.nome}</td>
                  <td className="px-4 py-3">{ig.cidade || '—'}</td>
                  <td className="px-4 py-3 uppercase">{ig.estado || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(ig.id)} className="inline-flex items-center justify-center rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-200">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}
