export default function ForbiddenPage() {
  return (
    <main>
      <section className="card row">
        <h1>403 Forbidden</h1>
        <p className="muted">この画面へアクセスする権限がありません。</p>
        <a href="/dashboard">ダッシュボードへ戻る</a>
      </section>
    </main>
  );
}
