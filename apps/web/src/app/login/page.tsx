'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('rep@local.test');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const body = await response.json();
    if (!response.ok) {
      setError(body.message ?? 'ログインに失敗しました');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main>
      <section className="card row" style={{ maxWidth: 420 }}>
        <h1>営業可視化MVP ログイン</h1>
        <p className="muted">seed済みのサンプルユーザーでログインできます。</p>
        <form className="row" onSubmit={onSubmit}>
          <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="button" type="submit" disabled={loading}>
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
        {error ? <p style={{ color: '#c62828' }}>{error}</p> : null}
      </section>
    </main>
  );
}
