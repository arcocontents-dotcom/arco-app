'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/access';
import { TIPOS_AVULSO, createAvulso, findAvulso, updateAvulso, type AvulsoInput, type TipoAvulso } from '@/lib/avulsos';
import { logActivity } from '@/lib/registro';

function read(form: FormData): AvulsoInput | null {
  const name = String(form.get('nome') ?? '').trim().slice(0, 120);
  if (!name) return null;
  const t = String(form.get('tipo') ?? 'Freelancer');
  return {
    name,
    tipo: (TIPOS_AVULSO as readonly string[]).includes(t) ? (t as TipoAvulso) : 'Freelancer',
    contato: String(form.get('contato') ?? '').trim().slice(0, 200),
    instagram: String(form.get('instagram') ?? '').trim().slice(0, 80),
    obs: String(form.get('obs') ?? '').trim().slice(0, 1500),
    ativo: form.get('ativo') !== null ? form.get('ativo') === 'on' : true
  };
}

export async function createAvulsoAction(form: FormData) {
  const who = await requireAdmin();
  const x = read(form);
  if (!x) redirect('/admin/avulsos?e=nome');
  // voltou a contratar: reaproveita o cadastro que já existe
  const have = await findAvulso(x.name);
  if (have) redirect(`/admin/avulsos/${have.id}?ok=existe`);
  const id = await createAvulso({ ...x, ativo: true }, who.name);
  await logActivity({ area: 'Clientes', who: who.name, action: `${who.name} cadastrou o cliente avulso`, item: x.name, itemId: id, detail: x.tipo });
  redirect(`/admin/avulsos/${id}?ok=criado`);
}

export async function updateAvulsoAction(form: FormData) {
  const who = await requireAdmin();
  const id = String(form.get('id') ?? '');
  const x = read(form);
  if (!id || !x) redirect(`/admin/avulsos/${id}?e=nome`);
  await updateAvulso(id, { ...x, ativo: form.get('ativo') === 'on' }, who.name);
  redirect(`/admin/avulsos/${id}?ok=salvo`);
}
