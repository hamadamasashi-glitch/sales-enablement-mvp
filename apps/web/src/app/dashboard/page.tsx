import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeSession } from '@/lib/session';

type PeriodPreset = 'week' | 'month' | 'custom';

type StageKey = 'DISCOVERY' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST';

interface RepDashboardResponse {
  rep: {
    id: string;
    name: string;
    email: string;
  };
  period: {
    from: string;
    to: string;
  };
  activityCount: {
    CALL: number;
    MEETING: number;
    EMAIL: number;
    FOLLOW: number;
  };
  pipeline: {
    byStage: Record<StageKey, number>;
    averageStageAgingDays: number;
    stageAging: Array<{
      dealId: string;
      title: string;
      stage: StageKey;
      daysInStage: number;
    }>;
  };
  bottlenecks: {
    nextActionUnsetCount: number;
    noContactCount: number;
  };
  drilldown: Array<{
    dealId: string;
    title: string;
    stage: StageKey;
    nextActionDue: string | null;
    lastContactAt: string | null;
    daysInStage: number;
    latestActivity: {
      id: string;
      type: string;
      occurredAt: string;
      outcome: string | null;
    } | null;
    latestRecording: {
      id: string;
      mediaUrl: string | null;
      transcriptPreview: string;
      ingestedAt: string;
    } | null;
  }>;
}

interface TeamDashboardResponse {
  team: {
    id: string;
    name: string;
  };
  period: {
    from: string;
    to: string;
  };
  totals: {
    activityCount: {
      CALL: number;
      MEETING: number;
      EMAIL: number;
      FOLLOW: number;
    };
    pipeline: {
      byStage: Record<StageKey, number>;
      averageStageAgingDays: number;
    };
    bottlenecks: {
      nextActionUnsetCount: number;
      noContactCount: number;
    };
  };
  members: Array<{
    repId: string;
    name: string;
    email: string;
    activityCount: {
      CALL: number;
      MEETING: number;
      EMAIL: number;
      FOLLOW: number;
    };
    pipeline: {
      byStage: Record<StageKey, number>;
      averageStageAgingDays: number;
    };
    bottlenecks: {
      nextActionUnsetCount: number;
      noContactCount: number;
    };
  }>;
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonday(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function resolvePeriod(searchParams: Record<string, string | string[] | undefined>) {
  const rawPeriod = searchParams.period;
  const period = typeof rawPeriod === 'string' && ['week', 'month', 'custom'].includes(rawPeriod)
    ? (rawPeriod as PeriodPreset)
    : 'month';

  const today = new Date();
  const defaultFrom = period === 'week' ? getMonday(today) : new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultTo = today;

  const fromValue = typeof searchParams.from === 'string' ? searchParams.from : formatDateForInput(defaultFrom);
  const toValue = typeof searchParams.to === 'string' ? searchParams.to : formatDateForInput(defaultTo);

  if (period === 'custom') {
    return {
      period,
      from: fromValue,
      to: toValue
    };
  }

  return {
    period,
    from: formatDateForInput(defaultFrom),
    to: formatDateForInput(defaultTo)
  };
}

function numberToPercent(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.round((value / max) * 100);
}

function buildDashboardHref(base: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const raw = query.toString();
  return raw ? `${base}?${raw}` : base;
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

function ActivityBars({ data }: { data: RepDashboardResponse['activityCount'] | TeamDashboardResponse['totals']['activityCount'] }) {
  const entries = [
    ['架電', data.CALL],
    ['商談', data.MEETING],
    ['メール', data.EMAIL],
    ['フォロー', data.FOLLOW]
  ] as const;

  const max = Math.max(...entries.map((entry) => entry[1]), 1);

  return (
    <div className="bar-chart">
      {entries.map(([label, value]) => (
        <div className="bar-item" key={label}>
          <div className="bar-row">
            <span>{label}</span>
            <b>{value}</b>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${numberToPercent(value, max)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PipelineBars({ data }: { data: Record<StageKey, number> }) {
  const labels: Array<[StageKey, string]> = [
    ['DISCOVERY', 'Discovery'],
    ['PROPOSAL', 'Proposal'],
    ['NEGOTIATION', 'Negotiation'],
    ['CLOSED_WON', 'Won'],
    ['CLOSED_LOST', 'Lost']
  ];

  const max = Math.max(...labels.map(([key]) => data[key]), 1);

  return (
    <div className="bar-chart">
      {labels.map(([key, label]) => (
        <div className="bar-item" key={key}>
          <div className="bar-row">
            <span>{label}</span>
            <b>{data[key]}</b>
          </div>
          <div className="bar-track">
            <div className="bar-fill secondary" style={{ width: `${numberToPercent(data[key], max)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = decodeSession(cookies().get('session')?.value);
  if (!session) {
    redirect('/login');
  }

  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';
  const period = resolvePeriod(searchParams);
  const selectedTeamId = typeof searchParams.teamId === 'string' ? searchParams.teamId : session.teamIds[0];

  let teamDashboard: TeamDashboardResponse | null = null;
  if ((session.role === 'MANAGER' || session.role === 'ADMIN') && selectedTeamId) {
    teamDashboard = await fetchJson<TeamDashboardResponse>(
      `${apiBase}/v1/dashboard/team/${selectedTeamId}?from=${period.from}&to=${period.to}`,
      session.token
    );
  }

  const selectedRepId =
    typeof searchParams.repId === 'string'
      ? searchParams.repId
      : session.role === 'REP'
        ? session.userId
        : teamDashboard?.members[0]?.repId;

  const repDashboard = selectedRepId
    ? await fetchJson<RepDashboardResponse>(
        `${apiBase}/v1/dashboard/rep/${selectedRepId}?from=${period.from}&to=${period.to}`,
        session.token
      )
    : null;

  const keepQueryBase = {
    period: period.period,
    from: period.from,
    to: period.to,
    teamId: selectedTeamId
  };

  return (
    <main>
      <section className="card row wide">
        <h1>営業ダッシュボード</h1>
        <p>
          ユーザー: <b>{session.name}</b> / ロール: <b>{session.role}</b>
        </p>

        <form method="get" className="filter-grid">
          <label className="row">
            <span className="muted">期間</span>
            <select className="select" name="period" defaultValue={period.period}>
              <option value="week">今週</option>
              <option value="month">今月</option>
              <option value="custom">任意</option>
            </select>
          </label>

          <label className="row">
            <span className="muted">From</span>
            <input className="input" type="date" name="from" defaultValue={period.from} />
          </label>

          <label className="row">
            <span className="muted">To</span>
            <input className="input" type="date" name="to" defaultValue={period.to} />
          </label>

          {session.role !== 'REP' && selectedTeamId ? <input type="hidden" name="teamId" value={selectedTeamId} /> : null}
          {selectedRepId ? <input type="hidden" name="repId" value={selectedRepId} /> : null}

          <button className="button" type="submit">
            期間を適用
          </button>
        </form>

        {session.role === 'MANAGER' || session.role === 'ADMIN' ? (
          <section className="row sub-section">
            <h2>チーム全体</h2>
            {teamDashboard ? (
              <>
                <p className="muted">
                  {teamDashboard.team.name} / 期間: {teamDashboard.period.from} 〜 {teamDashboard.period.to}
                </p>

                <div className="grid">
                  <div className="card metric-card">
                    <h3>活動量（チーム）</h3>
                    <ActivityBars data={teamDashboard.totals.activityCount} />
                  </div>
                  <div className="card metric-card">
                    <h3>パイプライン（チーム）</h3>
                    <PipelineBars data={teamDashboard.totals.pipeline.byStage} />
                    <p className="muted">平均滞留日数: {teamDashboard.totals.pipeline.averageStageAgingDays}日</p>
                  </div>
                  <div className="card metric-card">
                    <h3>詰まり検知（チーム）</h3>
                    <p>次回アクション未設定: {teamDashboard.totals.bottlenecks.nextActionUnsetCount}件</p>
                    <p>7日以上連絡なし: {teamDashboard.totals.bottlenecks.noContactCount}件</p>
                  </div>
                </div>

                <h3>担当者一覧</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>担当者</th>
                      <th>架電</th>
                      <th>商談</th>
                      <th>メール</th>
                      <th>フォロー</th>
                      <th>詰まり</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamDashboard.members.map((member) => (
                      <tr key={member.repId}>
                        <td>
                          <Link
                            href={buildDashboardHref('/dashboard', {
                              ...keepQueryBase,
                              repId: member.repId
                            })}
                          >
                            {member.name}
                          </Link>
                        </td>
                        <td>{member.activityCount.CALL}</td>
                        <td>{member.activityCount.MEETING}</td>
                        <td>{member.activityCount.EMAIL}</td>
                        <td>{member.activityCount.FOLLOW}</td>
                        <td>
                          未設定 {member.bottlenecks.nextActionUnsetCount} / 連絡なし {member.bottlenecks.noContactCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="muted">チーム集計の取得に失敗しました。</p>
            )}
          </section>
        ) : null}

        <section className="row sub-section">
          <h2>個人ダッシュボード</h2>
          {repDashboard ? (
            <>
              <p className="muted">
                {repDashboard.rep.name} ({repDashboard.rep.email}) / 期間: {repDashboard.period.from} 〜 {repDashboard.period.to}
              </p>

              <div className="grid">
                <div className="card metric-card">
                  <h3>活動量</h3>
                  <ActivityBars data={repDashboard.activityCount} />
                </div>
                <div className="card metric-card">
                  <h3>パイプライン</h3>
                  <PipelineBars data={repDashboard.pipeline.byStage} />
                  <p className="muted">平均滞留日数: {repDashboard.pipeline.averageStageAgingDays}日</p>
                </div>
                <div className="card metric-card">
                  <h3>詰まり検知</h3>
                  <p>次回アクション未設定: {repDashboard.bottlenecks.nextActionUnsetCount}件</p>
                  <p>7日以上連絡なし: {repDashboard.bottlenecks.noContactCount}件</p>
                </div>
              </div>

              <h3>案件ドリルダウン（最新録画/文字起こし）</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>案件</th>
                    <th>ステージ</th>
                    <th>滞留(日)</th>
                    <th>最終連絡</th>
                    <th>最新録画</th>
                    <th>文字起こし（抜粋）</th>
                  </tr>
                </thead>
                <tbody>
                  {repDashboard.drilldown.map((deal) => (
                    <tr key={deal.dealId}>
                      <td>{deal.title}</td>
                      <td>{deal.stage}</td>
                      <td>{deal.daysInStage}</td>
                      <td>{deal.lastContactAt ? deal.lastContactAt.slice(0, 10) : 'なし'}</td>
                      <td>
                        {deal.latestRecording?.mediaUrl ? (
                          <a href={deal.latestRecording.mediaUrl} target="_blank" rel="noreferrer">
                            録画を開く
                          </a>
                        ) : (
                          'なし'
                        )}
                      </td>
                      <td>{deal.latestRecording?.transcriptPreview || 'なし'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">個人ダッシュボードの取得に失敗しました。</p>
          )}
        </section>

        <div className="grid">
          {session.role === 'ADMIN' ? <a href="/admin">Admin画面へ</a> : null}
          {session.role === 'MANAGER' || session.role === 'ADMIN' ? <a href="/manager">Manager画面へ</a> : null}
          {session.role === 'REP' ? <a href="/rep">Rep画面へ</a> : null}
        </div>

        <form action="/api/auth/logout" method="post">
          <button className="button secondary" type="submit">
            ログアウト
          </button>
        </form>
      </section>
    </main>
  );
}
