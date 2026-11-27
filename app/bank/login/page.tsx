import LoginForm from '@/components/LoginForm';
import { DEFAULT_BANK_PASSWORD, showDefaultPasswords } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export default async function BankLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/bank') && !next.startsWith('//') ? next : '/bank';
  return <LoginForm portal="bank" idLabel="Employee ID" idPlaceholder="e.g. valuer01" defaultPassword={showDefaultPasswords() ? DEFAULT_BANK_PASSWORD : null} next={safeNext} />;
}
