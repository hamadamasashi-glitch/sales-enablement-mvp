'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function ContentForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    const response = await fetch('/api/learning/contents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        url,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      })
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(body.message ?? '教材登録に失敗しました');
      setLoading(false);
      return;
    }

    setLoading(false);
    setMessage('教材を登録しました');
    setTitle('');
    setUrl('');
    setTags('');
    router.refresh();
  }

  return (
    <form className="row" onSubmit={onSubmit}>
      <input
        className="input"
        placeholder="教材タイトル"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <input className="input" placeholder="URL" value={url} onChange={(event) => setUrl(event.target.value)} />
      <input
        className="input"
        placeholder="タグ（カンマ区切り） 例: ヒアリング,課題深掘り"
        value={tags}
        onChange={(event) => setTags(event.target.value)}
      />
      <button className="button" type="submit" disabled={loading}>
        {loading ? '登録中...' : '教材を登録'}
      </button>

      {error ? <p style={{ color: '#c62828' }}>{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
