"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TrainingHistoryItem = {
  training_id: string;
  created_at: string;
  date: string;
  words: string[];
  words_count: number;
  article_preview: string;
  training_ai?: {
    model?: string;
  };
};

type TrainingHistoryResponse = {
  items: TrainingHistoryItem[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000";

export default function TrainingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<TrainingHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const PAGE_LIMIT = 10;

  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      setIsLoading(true);
      setErrorText(null);

      try {
        const res = await fetch(`${API_BASE}/training?page=${page}&limit=${PAGE_LIMIT}`);
        if (!res.ok) {
          const maybeJson = await res.json().catch(() => null);
          const detail =
            maybeJson && typeof maybeJson.detail === "string"
              ? maybeJson.detail
              : "讀取練習紀錄失敗，請稍後重試。";
          throw new Error(detail);
        }

        const data = (await res.json()) as TrainingHistoryResponse;
        if (isMounted) {
          setHistoryItems(data.items || []);
          setTotalPages(Math.max(1, data.total_pages || 1));
          setTotalCount(data.total || 0);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : "讀取練習紀錄失敗。";
        if (message.toLowerCase().includes("failed to fetch")) {
          setErrorText(
            `無法連線到後端 API（Failed to fetch）。目前 API_BASE: ${API_BASE}`
          );
        } else {
          setErrorText(message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [page]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-slate-50 to-emerald-50 px-4 py-8 text-zinc-900 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 dark:text-zinc-50 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="mb-6 sm:mb-8">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
            Training
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">訓練</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            這裡將放置你的單字訓練流程與練習模式。
          </p>
        </div>

        <section className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70 sm:p-8">
          <h2 className="text-lg font-semibold sm:text-xl">🌟來點今天的訓練？</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            透過AI生成的文章來看一下你還記不記得之前學過的單字吧！
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href="/training/new"
              className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:ring-offset-zinc-900 sm:w-auto"
            >
              💪開始新增訓練（自動生成）
            </Link>
            <span className="text-sm text-zinc-600 dark:text-zinc-300">點一下就會自動選字、生成文章，完成後直接跳結果頁</span>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200/70 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70 sm:p-6">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-3">
            <h2 className="text-lg font-semibold sm:text-xl">過去練習紀錄</h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">最新在前，可點擊重新打開</span>
          </div>

          {isLoading ? (
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">載入練習紀錄中...</p>
          ) : errorText ? (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              {errorText}
            </p>
          ) : historyItems.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">目前還沒有練習紀錄，先建立第一篇吧。</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="space-y-3">
                {historyItems.map((item) => (
                  <Link
                    key={item.training_id}
                    href={`/training/${item.training_id}`}
                    className="block rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
                  >
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.date || "未標註日期"}</div>
                    <div className="mt-2 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-200">{item.article_preview || "（無文章內容）"}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(item.words || []).slice(0, 6).map((word) => (
                        <span
                          key={`${item.training_id}-${word}`}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
                        >
                          {word}
                        </span>
                      ))}
                      {(item.words_count || 0) > 6 && (
                        <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          +{item.words_count - 6} words
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>

              <div className="flex flex-col items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/40 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="text-zinc-600 dark:text-zinc-300">
                  第 {page} / {totalPages} 頁，共 {totalCount} 筆
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page <= 1 || isLoading}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    上一頁
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page >= totalPages || isLoading}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    下一頁
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
