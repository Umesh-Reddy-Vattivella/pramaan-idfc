import LoginForm from '@/components/LoginForm';
import { DEFAULT_CUSTOMER_PASSWORD, showDefaultPasswords } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export default async function CustomerLogin({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const { app } = await searchParams;
  const initial = app && /^PRM-\d{4}-\d{4}$/i.test(app) ? app.toUpperCase() : '';
  return <LoginForm portal="customer" idLabel="Application number" idPlaceholder="PRM-2611-4821" initialId={initial} defaultPassword={showDefaultPasswords() ? DEFAULT_CUSTOMER_PASSWORD : null} next="/customer" />;
}
