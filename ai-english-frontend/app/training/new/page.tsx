"use client";

import { useState } from "react";
import Link from "next/link";

type GenerateResponse = {
  training_id: string;
  created_at: string;
  date: string;
  words: string[];
  article: string;
  article_bolded: string;
  training_ai: {
    provider: string;
    model: string;
    temperature: number;
    max_output_tokens: number;
  };
  selection: {
    pool_limit: number;
    selected_limit: number;
    pool_count: number;
    vector_count: number;
    selected_count: number;
    rule: string;
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

export default function NewTrainingPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  const generateTraining = async () => {
    setIsGenerating(true);
    setErrorText(null);

    try {
      const res = await fetch(`${API_BASE}/training/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openrouter/auto",
          temperature: 0.7,
          max_output_tokens: 900,
        }),
      });

      if (!res.ok) {
        const fallbackMessage = "生成文章失敗，請稍後重試。";
        const maybeJson = await res.json().catch(() => null);
        const detail =
          maybeJson && typeof maybeJson.detail === "string"
            ? maybeJson.detail
            : fallbackMessage;
        throw new Error(detail);
      }

      const data = (await res.json()) as GenerateResponse;
      setResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成文章失敗。";
      if (message.toLowerCase().includes("failed to fetch")) {
        setErrorText(
          "無法連線到後端 API（Failed to fetch）。請確認 http://localhost:8000 已啟動、CORS 已允許目前前端網址，且沒有被防火牆阻擋。"
        );
      } else {
        setErrorText(message);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-slate-50 to-emerald-50 px-6 py-12 text-zinc-900 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
              Training Builder
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">新增訓練</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              一鍵由後端自動挑選單字並生成複習文章，完成後直接寫入 training collection。
            </p>
          </div>
          <Link
            href="/training"
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            返回訓練首頁
          </Link>
        </div>

        <section className="rounded-2xl border border-zinc-200/70 bg-white/85 p-6 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70">
          <h2 className="text-xl font-semibold">1. 生成訓練</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            生成時，後端會自動執行：先挑選 priority_group=high 的前 50 個，再從中取向量最接近的前 25 個。
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={generateTraining}
              disabled={isGenerating}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "生成中..." : "開始生成訓練"}
            </button>
          </div>

          {errorText && (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              {errorText}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200/70 bg-white/85 p-6 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70">
          <h2 className="text-xl font-semibold">2. 生成結果</h2>

          {!result ? (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              文章生成後會顯示在這裡，系統挑選的練習單字會以粗體呈現。
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200">
                <div>Training ID: {result.training_id}</div>
                <div>日期: {result.date}</div>
                <div>模型: {result.training_ai.model}</div>
                <div>
                  規則: high 前 {result.selection.pool_limit} 個，接著取向量最接近前 {result.selection.selected_limit} 個
                </div>
                <div>
                  實際候選/有向量/入選: {result.selection.pool_count}/{result.selection.vector_count}/
                  {result.selection.selected_count}
                </div>
                <div>已儲存到資料庫 collection: training</div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
                <div className="mb-2 text-sm font-semibold">本次練習單字</div>
                <div className="flex flex-wrap gap-2">
                  {result.words.map((word) => (
                    <span
                      key={word}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>

              <article className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 leading-8 text-zinc-800 dark:border-emerald-900/80 dark:bg-emerald-950/30 dark:text-zinc-100">
                {result.article_bolded.split("\n").map((line, index) => (
                  <p key={`line-${index}`} className="mb-3 last:mb-0">
                    {line.trim().length > 0 ? renderBoldMarkdownLine(line) : <>&nbsp;</>}
                  </p>
                ))}
              </article>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
