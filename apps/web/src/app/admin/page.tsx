import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeSession } from '@/lib/session';
import { ContentForm } from './content-form';

interface LearningContentRow {
  id: string;
  title: string;
  url: string;
  estimatedMinutes: number;
  tags: Array<{ tag: string }>;
}

async function getLearningContents(token: string): Promise<LearningContentRow[]> {
  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';
  const response = await fetch(`${apiBase}/v1/learning/contents`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as LearningContentRow[];
}

export default async function AdminPage() {
  const session = decodeSession(cookies().get('session')?.value);
  if (!session) {
    redirect('/login');
  }

  const contents = await getLearningContents(session.token);

  return (
    <main>
      <section className="card row wide">
        <h1>Admin Console</h1>
        <p className="muted">教材（KnowledgeContent）を登録し、タグベース推薦に反映できます。</p>

        <h2>教材登録</h2>
        {session.role === 'ADMIN' ? <ContentForm /> : <p className="muted">Adminのみ登録可能です。</p>}

        <h2>教材一覧</h2>
        <table className="table">
          <thead>
            <tr>
              <th>タイトル</th>
              <th>タグ</th>
              <th>想定時間</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            {contents.map((content) => (
              <tr key={content.id}>
                <td>{content.title}</td>
                <td>{content.tags.map((row) => row.tag).join(', ')}</td>
                <td>{content.estimatedMinutes}分</td>
                <td>
                  <a href={content.url} target="_blank" rel="noreferrer">
                    開く
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Link href="/dashboard">ダッシュボードへ戻る</Link>
      </section>
    </main>
  );
}
