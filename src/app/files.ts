import type { NewFile } from '@/services/DataService';

/** Entrega um arquivo ao usuário (download). Usa o recurso de downloads do visualizador quando existir. */
export async function saveBlob(blob: Blob, filename: string) {
  const w = window as unknown as { claude?: { downloads?: { save: (o: { data: Blob; filename: string; mimeType: string }) => Promise<unknown> } } };
  if (w.claude?.downloads?.save) {
    await w.claude.downloads.save({ data: blob, filename, mimeType: blob.type || 'application/octet-stream' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function saveDataUrl(dataUrl: string, filename: string) {
  await saveBlob(await (await fetch(dataUrl)).blob(), filename);
}

export function readFile(file: File): Promise<NewFile> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mimeType: file.type, size: file.size, url: String(r.result) });
    r.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    r.readAsDataURL(file);
  });
}
