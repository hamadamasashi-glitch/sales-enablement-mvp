import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeSession } from '@/lib/session';

interface RecordingListItem {
  id: string;
  mediaUrl: string | null;
  transcriptText: string | null;
  ingestedAt: string;
  deal: {
    id: string;
    title: string;
  };
}

interface TeamLearningProgress {
  teamId: string;
  totals: {
    recommendedCount: number;
    completedCount: number;
    inProgressCount: number;
    completionRate: number;
  };
  members: Array<{
    repId: string;
    name: string;
    email: string;
    recommendedCount: number;
    completedCount: number;
    inProgressCount: number;
    completionRate: number;
  }>;
}

async function getRecordings(token: string): Promise<RecordingListItem[]> {
  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';
  const response = await fetch(`${apiBase}/v1/recordings`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as RecordingListItem[];
}

async function getTeamLearningProgress(token: string, teamId?: string): Promise<TeamLearningProgress | null> {
  if (!teamId) {
    return null;
  }

  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';
  const query = teamId ? `?teamId=${teamId}` : '';

  const response = await fetch(`${apiBase}/v1/learning/team-progress${query}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as TeamLearningProgress;
}

export default async function ManagerPage() {
  const session = decodeSession(cookies().get('session')?.value);
  if (!session) {
    redirect('/login');
  }

  const [recordings, teamLearningProgress] = await Promise.all([
    getRecordings(session.token),
    getTeamLearningProgress(session.token, session.teamIds[0])
  ]);

  return (
    <main>
      <section className="card row wide">
        <h1>Manager Console</h1>
        <p className="muted">録画一覧から採点し、チームの学習進捗を確認できます。</p>

        <h2>チーム学習進捗</h2>
        {teamLearningProgress ? (
          <>
            <div className="grid">
              <div className="card metric-card">
                <h3>推奨教材数</h3>
                <p>{teamLearningProgress.totals.recommendedCount}</p>
              </div>
              <div className="card metric-card">
                <h3>完了数</h3>
                <p>{teamLearningProgress.totals.completedCount}</p>
              </div>
              <div className="card metric-card">
                <h3>完了率</h3>
                <p>{Math.round(teamLearningProgress.totals.completionRate * 100)}%</p>
              </div>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>担当者</th>
                  <th>推奨</th>
                  <th>完了</th>
                  <th>進行中</th>
                  <th>完了率</th>
                </tr>
              </thead>
              <tbody>
                {teamLearningProgress.members.map((member) => (
                  <tr key={member.repId}>
                    <td>{member.name}</td>
                    <td>{member.recommendedCount}</td>
                    <td>{member.completedCount}</td>
                    <td>{member.inProgressCount}</td>
                    <td>{Math.round(member.completionRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="muted">学習進捗を取得できませんでした。</p>
        )}

        <h2>録画一覧（採点対象）</h2>
        {session.role !== 'MANAGER' ? (
          <p className="muted">現在のロールでは採点作成できません（閲覧のみ）。</p>
        ) : null}

        <table className="table">
          <thead>
            <tr>
              <th>案件</th>
              <th>録画</th>
              <th>取り込み日時</th>
              <th>文字起こし</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {recordings.map((recording) => (
              <tr key={recording.id}>
                <td>{recording.deal.title}</td>
                <td>
                  {recording.mediaUrl ? (
                    <a href={recording.mediaUrl} target="_blank" rel="noreferrer">
                      URL
                    </a>
                  ) : (
                    'なし'
                  )}
                </td>
                <td>{recording.ingestedAt.slice(0, 16).replace('T', ' ')}</td>
                <td>{(recording.transcriptText ?? '').slice(0, 80) || 'なし'}</td>
                <td>
                  <Link href={`/manager/recordings/${recording.id}`}>開く</Link>
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
