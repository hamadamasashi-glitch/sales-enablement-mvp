import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeSession } from '@/lib/session';
import { LearningRecommendations } from './learning-recommendations';

interface RepScorecardSummary {
  id: string;
  totalScore: number;
  overallComment: string | null;
  evaluatedAt: string;
  evaluatorUser: {
    id: string;
    name: string;
    email: string;
  };
  deal: {
    id: string;
    title: string;
  };
  categoryScores: Array<{
    category: string;
    score: number;
  }>;
}

interface LearningRecommendationResponse {
  repId: string;
  threshold: number;
  recommendations: Array<{
    recommendationId: string;
    reason: string;
    learningStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
    completedAt: string | null;
    content: {
      id: string;
      title: string;
      contentType: string;
      difficulty: string;
      estimatedMinutes: number;
      url: string;
      tags: string[];
    };
  }>;
}

async function getScorecards(token: string): Promise<RepScorecardSummary[]> {
  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';
  const response = await fetch(`${apiBase}/v1/scorecards`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as RepScorecardSummary[];
}

async function getRecommendations(token: string): Promise<LearningRecommendationResponse | null> {
  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';
  const response = await fetch(`${apiBase}/v1/learning/recommendations`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as LearningRecommendationResponse;
}

export default async function RepPage() {
  const session = decodeSession(cookies().get('session')?.value);
  if (!session) {
    redirect('/login');
  }

  const [scorecards, recommendationPayload] = await Promise.all([
    getScorecards(session.token),
    getRecommendations(session.token)
  ]);

  return (
    <main>
      <section className="card row wide">
        <h1>Rep Workspace</h1>
        <p className="muted">自分の商談スコアと、スコアに基づくおすすめ教材を確認できます。</p>

        <h2>おすすめ教材</h2>
        {recommendationPayload && recommendationPayload.recommendations.length > 0 ? (
          <LearningRecommendations rows={recommendationPayload.recommendations} />
        ) : (
          <p className="muted">現在のおすすめ教材はありません。</p>
        )}

        <h2>スコアカード履歴</h2>
        <table className="table">
          <thead>
            <tr>
              <th>評価日時</th>
              <th>案件</th>
              <th>合計点</th>
              <th>カテゴリ点</th>
              <th>評価者</th>
              <th>総評</th>
              <th>詳細</th>
            </tr>
          </thead>
          <tbody>
            {scorecards.map((scorecard) => (
              <tr key={scorecard.id}>
                <td>{scorecard.evaluatedAt.slice(0, 16).replace('T', ' ')}</td>
                <td>{scorecard.deal.title}</td>
                <td>{scorecard.totalScore}</td>
                <td>{scorecard.categoryScores.map((row) => `${row.category}:${row.score}`).join(' / ')}</td>
                <td>{scorecard.evaluatorUser.name}</td>
                <td>{(scorecard.overallComment ?? '').slice(0, 80)}</td>
                <td>
                  <Link href={`/rep/scorecards/${scorecard.id}`}>開く</Link>
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
