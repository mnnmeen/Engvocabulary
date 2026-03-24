export default function TrainingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-slate-50 to-emerald-50 px-6 py-12 text-zinc-900 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
            Training
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">訓練</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            這裡將放置你的單字訓練流程與練習模式。
          </p>
        </div>

        <section className="rounded-2xl border border-zinc-200/70 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70">
          <h2 className="text-xl font-semibold">訓練內頁</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            第一版頁面已建立，接下來可以加入題型、計時、答題紀錄與結果分析。
          </p>
        </section>
      </div>
    </div>
  );
}
