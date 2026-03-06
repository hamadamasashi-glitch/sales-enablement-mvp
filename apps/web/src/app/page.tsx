import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeSession } from '@/lib/session';

export default function HomePage() {
  const session = decodeSession(cookies().get('session')?.value);
  if (session) {
    redirect('/dashboard');
  }

  redirect('/login');
}
