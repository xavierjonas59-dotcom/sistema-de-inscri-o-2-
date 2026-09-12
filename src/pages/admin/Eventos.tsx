import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

interface Evento {
  id: string;
  nome: string;
  data_evento: string | null;
  descricao: string | null;
  created_at: string;
}

export default function AdminEventos() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [nome, setNome] = useState('');
  const [dataEvento, setDataEvento] = useState('');
  const [descricao, setDescricao] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchEventos();
  }, []);

  const fetchEventos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('eventos')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEventos(data || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao buscar eventos');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEvento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.from('eventos').insert([{
        nome: nome.trim(),
        data_evento: dataEvento || null,
        descricao: descricao.trim() || null
      }]);
      if (error) throw error;
      setNome('');
      setDataEvento('');
      setDescricao('');
      fetchEventos();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao adicionar evento');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este evento?')) return;
    try {
      const { error } = await supabase.from('eventos').delete().eq('id', id);
      if (error) throw error;
      setEventos((prev) => prev.filter((ev) => ev.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir evento');
    }
  };

  return (
    <AdminLayout>
      <h2 className="text-2xl font-bold mb-6">Gerenciar Eventos</h2>
      
      {errorMsg && (
        <div className="mb-4 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      <div className="mb-8 rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Novo Evento</h3>
        <form onSubmit={handleAddEvento} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="nome" className="text-sm font-medium">Nome do Evento *</label>
              <input id="nome" value={nome} onChange={e => setNome(e.target.value)} required className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
            </div>
            <div className="space-y-2">
              <label htmlFor="dataEvento" className="text-sm font-medium">Data</label>
              <input id="dataEvento" type="date" value={dataEvento} onChange={e => setDataEvento(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="descricao" className="text-sm font-medium">Descrição</label>
            <textarea id="descricao" value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={submitting} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? 'Salvando...' : 'Salvar Evento'}
          </button>
        </form>
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-4 text-muted-foreground">Carregando...</p>
        ) : eventos.length === 0 ? (
          <p className="p-4 text-muted-foreground">Nenhum evento cadastrado.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((ev) => (
                <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{ev.nome}</td>
                  <td className="px-4 py-3">{ev.data_evento ? new Date(ev.data_evento).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{ev.descricao || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(ev.id)} className="inline-flex items-center justify-center rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-200">
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
