"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type TrainingDetail = {
  training_id: string;
  created_at: string;
  date: string;
  words: string[];
  article: string;
  article_bolded: string;
  training_ai?: {
    provider?: string;
    model?: string;
    temperature?: number;
    max_output_tokens?: number;
  };
  selection?: {
    pool_limit?: number;
    selected_limit?: number;
    pool_count?: number;
    vector_count?: number;
    selected_count?: number;
    rule?: string;
  };
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000";

function renderBoldMarkdownLine(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const text = part.slice(2, -2);
      return (
        <strong key={`${part}-${index}`} className="font-bold text-emerald-700 dark:text-emerald-300">
          {text}
        </strong>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

export default function TrainingDetailPage() {
  const params = useParams<{ trainingId: string }>();
  const trainingId = params?.trainingId;

  const [detail, setDetail] = useState<TrainingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!trainingId) {
      setErrorText("trainingId 缺失");
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadDetail = async () => {
      setIsLoading(true);
      setErrorText(null);

      try {
        const res = await fetch(`${API_BASE}/training/${trainingId}`);
        if (!res.ok) {
          const maybeJson = await res.json().catch(() => null);
          const detailMessage =
            maybeJson && typeof maybeJson.detail === "string"
              ? maybeJson.detail
              : "讀取文章失敗，請稍後重試。";
          throw new Error(detailMessage);
        }

        const data = (await res.json()) as TrainingDetail;
        if (isMounted) {
          setDetail(data);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : "讀取文章失敗。";
        if (message.toLowerCase().includes("failed to fetch")) {
          setErrorText(
            "無法連線到後端 API（Failed to fetch）。請確認 http://localhost:8000 已啟動。"
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

    loadDetail();

    return () => {
      isMounted = false;
    };
  }, [trainingId]);

  const articleLines = useMemo(() => {
    if (!detail?.article_bolded) {
      return [];
    }
    return detail.article_bolded.split("\n");
  }, [detail]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-slate-50 to-teal-50 px-6 py-12 text-zinc-900 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">Training Article</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{detail?.date || "練習文章"}</h1>
          </div>
          <Link
            href="/training"
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            返回訓練首頁
          </Link>
        </div>

        {isLoading ? (
          <section className="rounded-2xl border border-zinc-200/70 bg-white/85 p-6 text-sm text-zinc-500 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70 dark:text-zinc-400">
            文章載入中...
          </section>
        ) : errorText ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
            {errorText}
          </section>
        ) : !detail ? (
          <section className="rounded-2xl border border-zinc-200/70 bg-white/85 p-6 text-sm text-zinc-500 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70 dark:text-zinc-400">
            找不到這篇文章。
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-zinc-200/70 bg-white/85 p-5 text-sm shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70">
              <div className="grid grid-cols-1 gap-2 text-zinc-700 dark:text-zinc-200 sm:grid-cols-2">
                <div>Training ID: {detail.training_id}</div>
                <div>日期: {detail.date || "-"}</div>
                <div>模型: {detail.training_ai?.model || "-"}</div>
                <div>
                  入選單字: {detail.selection?.selected_count ?? detail.words?.length ?? 0}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200/70 bg-white/90 p-5 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70">
              <div className="mb-3 text-sm font-semibold">練習單字</div>
              <div className="flex flex-wrap gap-2">
                {(detail.words || []).map((word) => (
                  <span
                    key={word}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                  >
                    {word}
                  </span>
                ))}
              </div>
            </section>

            <article className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 leading-8 text-zinc-800 shadow-sm dark:border-emerald-900/80 dark:bg-emerald-950/30 dark:text-zinc-100">
              {articleLines.map((line, index) => (
                <p key={`line-${index}`} className="mb-3 last:mb-0">
                  {line.trim().length > 0 ? renderBoldMarkdownLine(line) : <>&nbsp;</>}
                </p>
              ))}
            </article>
          </>
        )}
      </div>
    </div>
  );
}
