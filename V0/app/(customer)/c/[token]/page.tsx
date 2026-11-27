import { redirect } from 'next/navigation';

/** Short link sent by SMS / WhatsApp → customer sign-in with the application pre-selected. */
export default async function ShortLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/customer/login?t=${encodeURIComponent(token)}`);
}
