'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface RecommendationItem {
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
}

export function LearningRecommendations({ rows }: { rows: RecommendationItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function markComplete(contentId: string) {
    setBusyId(contentId);
    setMessage('');

    const response = await fetch('/api/learning/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contentId,
        completed: true
      })
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(body.message ?? '完了更新に失敗しました');
      setBusyId(null);
      return;
    }

    setBusyId(null);
    setMessage('完了を記録しました');
    router.refresh();
  }

  return (
    <section className="row">
      <table className="table">
        <thead>
          <tr>
            <th>教材</th>
            <th>タグ</th>
            <th>理由</th>
            <th>進捗</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.recommendationId}>
              <td>
                <a href={row.content.url} target="_blank" rel="noreferrer">
                  {row.content.title}
                </a>
                <div className="muted">
                  {row.content.contentType} / {row.content.difficulty} / {row.content.estimatedMinutes}分
                </div>
              </td>
              <td>{row.content.tags.join(', ')}</td>
              <td>{row.reason}</td>
              <td>{row.learningStatus}</td>
              <td>
                <button
                  className="button"
                  type="button"
                  onClick={() => markComplete(row.content.id)}
                  disabled={busyId === row.content.id || row.learningStatus === 'COMPLETED'}
                >
                  {row.learningStatus === 'COMPLETED'
                    ? '完了済み'
                    : busyId === row.content.id
                      ? '更新中...'
                      : '完了チェック'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {message ? <p className="muted">{message}</p> : null}
    </section>
  );
}
