import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeSession } from '@/lib/session';
import { ScorecardForm } from './scorecard-form';

interface RecordingDetail {
  id: string;
  mediaUrl: string | null;
  transcriptText: string | null;
  ingestedAt: string;
  deal: {
    id: string;
    title: string;
    ownerUserId: string;
    teamId: string;
  };
}

interface Template {
  id: string;
  name: string;
  version: string;
  isActive: boolean;
  items: Array<{
    id: string;
    criterionKey: string;
    label: string;
    description?: string | null;
    category: string;
    sortOrder: number;
  }>;
}

interface ScorecardHistoryItem {
  id: string;
  evaluatedAt: string;
  totalScore: number;
  overallComment: string | null;
  evaluatorUser: {
    id: string;
    name: string;
    email: string;
  };
  categoryScores: Array<{
    category: string;
    score: number;
  }>;
}

async function fetchJson<T>(url: string, token: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

export default async function RecordingScorePage({ params }: { params: { id: string } }) {
  const session = decodeSession(cookies().get('session')?.value);
  if (!session) {
    redirect('/login');
  }

  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';

  const recording = await fetchJson<RecordingDetail>(`${apiBase}/v1/recordings/${params.id}`, session.token);
  const templates = await fetchJson<Template[]>(`${apiBase}/v1/scorecard-templates`, session.token);
  const history = await fetchJson<ScorecardHistoryItem[]>(
    `${apiBase}/v1/scorecards/recordings/${params.id}/history`,
    session.token
  );

  if (!recording || !templates || templates.length === 0) {
    return (
      <main>
        <section className="card row">
          <h1>Recording Scorecard</h1>
          <p className="muted">録画情報またはテンプレートの取得に失敗しました。</p>
          <Link href="/manager">一覧に戻る</Link>
        </section>
      </main>
    );
  }

  const activeTemplate = templates.find((template) => template.isActive) ?? templates[0];

  return (
    <main>
      <section className="card row wide">
        <h1>Recording Scorecard</h1>
        <p className="muted">
          案件: {recording.deal.title} / 取り込み: {recording.ingestedAt.slice(0, 16).replace('T', ' ')}
        </p>

        <div className="grid">
          <div className="card metric-card row">
            <h3>録画URL</h3>
            {recording.mediaUrl ? (
              <a href={recording.mediaUrl} target="_blank" rel="noreferrer">
                {recording.mediaUrl}
              </a>
            ) : (
              <p className="muted">なし</p>
            )}
          </div>
          <div className="card metric-card row">
            <h3>文字起こし</h3>
            <p className="muted">{recording.transcriptText ?? 'なし'}</p>
          </div>
        </div>

        <h2>採点（テンプレート: {activeTemplate.name}）</h2>
        <ScorecardForm
          recordingId={recording.id}
          templateId={activeTemplate.id}
          items={activeTemplate.items.sort((a, b) => a.sortOrder - b.sortOrder)}
          canSubmit={session.role === 'MANAGER'}
        />

        <h2>評価履歴</h2>
        <table className="table">
          <thead>
            <tr>
              <th>評価日時</th>
              <th>評価者</th>
              <th>合計点</th>
              <th>カテゴリ点</th>
              <th>総評</th>
            </tr>
          </thead>
          <tbody>
            {(history ?? []).map((row) => (
              <tr key={row.id}>
                <td>{row.evaluatedAt.slice(0, 16).replace('T', ' ')}</td>
                <td>{row.evaluatorUser.name}</td>
                <td>{row.totalScore}</td>
                <td>{row.categoryScores.map((score) => `${score.category}:${score.score}`).join(' / ')}</td>
                <td>{row.overallComment ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Link href="/manager">一覧に戻る</Link>
      </section>
    </main>
  );
}
