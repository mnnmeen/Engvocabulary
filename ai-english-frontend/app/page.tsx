import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

async function getDashboardStats() {
  try {
    const res = await fetch(`${API_BASE}/stats`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return { wordCount: undefined, collocationsCount: undefined };
    }

    const data = (await res.json()) as {
      total_words?: number;
      total_collocations?: number;
    };
    return {
      wordCount:
        typeof data.total_words === "number" ? data.total_words : undefined,
      collocationsCount:
        typeof data.total_collocations === "number"
          ? data.total_collocations
          : undefined,
    };
  } catch {
    return { wordCount: undefined, collocationsCount: undefined };
  }
}

async function getTodayTrainingStatus() {
  try {
    const res = await fetch(`${API_BASE}/training?page=1&limit=1`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return { hasTrainingToday: false };
    }

    const data = (await res.json()) as {
      items?: Array<{ date?: string }>;
    };

    // 取得今天的日期 (YYYY-MM-DD 格式)
    const today = new Date().toISOString().split("T")[0];

    // 檢查是否有今天的訓練記錄
    const hasTrainingToday =
      data.items && data.items.length > 0 && data.items[0].date === today;

    return { hasTrainingToday };
  } catch {
    return { hasTrainingToday: false };
  }
}

export default async function Home() {
  const { wordCount, collocationsCount } = await getDashboardStats();
  const { hasTrainingToday } = await getTodayTrainingStatus();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-slate-50 to-emerald-50 px-6 py-12 text-zinc-900 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
            Engvocabulary
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            學習控制台
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            以方格卡片整理單字進度與新增入口。
          </p>
        </div>

        {/* 訓練狀態提示 */}
        <div
          className={`mb-8 rounded-2xl p-6 ${
            hasTrainingToday
              ? "border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/80 dark:bg-emerald-950/60 dark:text-emerald-100"
              : "border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/80 dark:bg-amber-950/60 dark:text-amber-100"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{hasTrainingToday ? "✅" : "📚"}</span>
            <div>
              <p className="font-semibold">
                {hasTrainingToday
                  ? "今天已經有複習過了！"
                  : "今天還沒進行單字複習哦！"}
              </p>
              <p className="mt-1 text-sm opacity-80">
                {hasTrainingToday
                  ? "繼續保持習慣，明天再來挑戰吧！"
                  : "現在就開始訓練，讓你的英文更進步。"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="group rounded-2xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-lg dark:border-zinc-800/80 dark:bg-zinc-900/70">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              現在有幾個單字
            </div>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-4xl font-semibold">
                {typeof wordCount === "number" ? wordCount : "--"}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Words
              </span>
            </div>
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
              即時顯示目前資料庫的單字總數。
            </p>
          </div>

          <div className="group rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-lg dark:border-slate-800/80 dark:bg-zinc-900/70">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              片語數量
            </div>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-4xl font-semibold">
                {typeof collocationsCount === "number" ? collocationsCount : "--"}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Collocations
              </span>
            </div>
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
              彙整所有單字卡的片語數量。
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-emerald-900/80 dark:bg-emerald-950/60">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-200/40 blur-2xl dark:bg-emerald-400/20" />
            <div className="relative">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">
                新增單字
              </div>
              <h2 className="mt-4 text-2xl font-semibold">建立新的單字卡</h2>
              <p className="mt-2 text-sm text-emerald-700/80 dark:text-emerald-200/80">
                立即加入新的學習內容。
              </p>
              <Link
                href="/add-word"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-500"
              >
                新增單字
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
