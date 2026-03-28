"use client";

import Link from "next/link";

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
          <h2 className="text-xl font-semibold">🌟來點今天的訓練？</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            透過AI生成的文章來看一下你還記不記得之前學過的單字吧！
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href="/training/new"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:ring-offset-zinc-900"
            >
              💪開始新增訓練
            </Link>
            <span className="text-sm text-zinc-600 dark:text-zinc-300">跳轉到選字與生成頁面</span>
          </div>
        </section>
      </div>
    </div>
  );
}
