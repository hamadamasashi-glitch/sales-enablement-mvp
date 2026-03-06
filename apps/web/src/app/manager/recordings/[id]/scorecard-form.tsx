'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface TemplateItem {
  id: string;
  criterionKey: string;
  label: string;
  description?: string | null;
  category: string;
}

interface Props {
  recordingId: string;
  templateId: string;
  items: TemplateItem[];
  canSubmit: boolean;
}

export function ScorecardForm({ recordingId, templateId, items, canSubmit }: Props) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(items.map((item) => [item.criterionKey, 0]))
  );
  const [comments, setComments] = useState<Record<string, string>>(
    Object.fromEntries(items.map((item) => [item.criterionKey, '']))
  );
  const [overallComment, setOverallComment] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<null | {
    id: string;
    totalScore: number;
    categoryScores: Array<{ category: string; score: number }>;
  }>(null);
  const [loading, setLoading] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, TemplateItem[]>();
    for (const item of items) {
      const rows = map.get(item.category) ?? [];
      rows.push(item);
      map.set(item.category, rows);
    }
    return Array.from(map.entries());
  }, [items]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setError('このロールでは評価を作成できません。');
      return;
    }

    setLoading(true);
    setError('');

    const payload = {
      recordingId,
      templateId,
      overallComment,
      items: items.map((item) => ({
        criterionKey: item.criterionKey,
        score: Number(scores[item.criterionKey] ?? 0),
        comment: comments[item.criterionKey] || undefined
      }))
    };

    const response = await fetch('/api/scorecards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body.message ?? '採点に失敗しました');
      setLoading(false);
      return;
    }

    setResult({
      id: body.id,
      totalScore: Number(body.totalScore ?? 0),
      categoryScores: body.categoryScores ?? []
    });

    setLoading(false);
    router.refresh();
  }

  return (
    <form className="row" onSubmit={onSubmit}>
      {grouped.map(([category, categoryItems]) => (
        <section className="card metric-card row" key={category}>
          <h3>{category}</h3>
          {categoryItems.map((item) => (
            <div className="row" key={item.id}>
              <label>
                <b>{item.label}</b>
              </label>
              {item.description ? <p className="muted">{item.description}</p> : null}
              <div className="filter-grid">
                <select
                  className="select"
                  value={scores[item.criterionKey]}
                  onChange={(event) =>
                    setScores((prev) => ({
                      ...prev,
                      [item.criterionKey]: Number(event.target.value)
                    }))
                  }
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="コメント"
                  value={comments[item.criterionKey]}
                  onChange={(event) =>
                    setComments((prev) => ({
                      ...prev,
                      [item.criterionKey]: event.target.value
                    }))
                  }
                />
              </div>
            </div>
          ))}
        </section>
      ))}

      <section className="row">
        <label>
          <b>総評コメント</b>
        </label>
        <textarea
          className="input"
          rows={4}
          value={overallComment}
          onChange={(event) => setOverallComment(event.target.value)}
          placeholder="商談全体のコメント"
        />
      </section>

      <button className="button" type="submit" disabled={loading || !canSubmit}>
        {loading ? '保存中...' : 'スコアを保存'}
      </button>

      {error ? <p style={{ color: '#c62828' }}>{error}</p> : null}
      {result ? (
        <div className="card metric-card row">
          <p>
            保存完了: <b>{result.id}</b> / 合計点: <b>{result.totalScore}</b>
          </p>
          <p className="muted">
            カテゴリ点:{' '}
            {result.categoryScores.map((row) => `${row.category}: ${row.score}`).join(' / ')}
          </p>
        </div>
      ) : null}
    </form>
  );
}
