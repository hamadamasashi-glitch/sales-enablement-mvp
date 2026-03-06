import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeSession } from '@/lib/session';

interface ScorecardDetail {
  id: string;
  totalScore: number;
  overallComment: string | null;
  evaluatedAt: string;
  evaluatorUser: {
    id: string;
    name: string;
    email: string;
  };
  categoryScores: Array<{
    category: string;
    score: number;
  }>;
  itemScores: Array<{
    id: string;
    criterionKey: string;
    category: string;
    score: number;
    comment: string | null;
  }>;
}

async function fetchScorecard(id: string, token: string): Promise<ScorecardDetail | null> {
  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';
  const response = await fetch(`${apiBase}/v1/scorecards/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as ScorecardDetail;
}

export default async function RepScorecardDetailPage({ params }: { params: { id: string } }) {
  const session = decodeSession(cookies().get('session')?.value);
  if (!session) {
    redirect('/login');
  }

  const scorecard = await fetchScorecard(params.id, session.token);

  if (!scorecard) {
    return (
      <main>
        <section className="card row">
          <h1>Scorecard Detail</h1>
          <p className="muted">スコアカードを取得できませんでした。</p>
          <Link href="/rep">戻る</Link>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="card row wide">
        <h1>Scorecard Detail</h1>
        <p>
          合計点: <b>{scorecard.totalScore}</b> / 評価者: <b>{scorecard.evaluatorUser.name}</b>
        </p>
        <p className="muted">評価日時: {scorecard.evaluatedAt.slice(0, 16).replace('T', ' ')}</p>
        <p>{scorecard.overallComment}</p>

        <div className="card metric-card row">
          <h3>カテゴリ点</h3>
          <p className="muted">{scorecard.categoryScores.map((row) => `${row.category}: ${row.score}`).join(' / ')}</p>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>カテゴリ</th>
              <th>項目</th>
              <th>点数</th>
              <th>コメント</th>
            </tr>
          </thead>
          <tbody>
            {scorecard.itemScores.map((item) => (
              <tr key={item.id}>
                <td>{item.category}</td>
                <td>{item.criterionKey}</td>
                <td>{item.score}</td>
                <td>{item.comment ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Link href="/rep">戻る</Link>
      </section>
    </main>
  );
}
