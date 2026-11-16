import { redirect } from 'next/navigation';

// A Captação virou uma aba própria no menu.
export default async function Old({ searchParams }: { searchParams: Promise<{ v?: string; d?: string }> }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === 'string') as [string, string][]).toString();
  redirect(`/admin/captacao${q ? `?${q}` : ''}`);
}
