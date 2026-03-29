"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type GenerateResponse = {
  training_id: string;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000";

export default function NewTrainingPage() {
  const router = useRouter();
  const didAutoGenerate = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

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
      router.replace(`/training/new/result/${data.training_id}`);
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

  useEffect(() => {
    if (didAutoGenerate.current) {
      return;
    }
    didAutoGenerate.current = true;
    void generateTraining();
  }, []);

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
          <h2 className="text-xl font-semibold">1. 自動生成訓練</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            系統正在自動挑選 priority_group=high 的單字並生成 AI 複習文章，完成後會自動帶你進入結果頁。
          </p>

          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
            {isGenerating ? "正在選字與生成文章，請稍候..." : "準備中..."}
          </div>

          {errorText && (
            <div className="mt-4 space-y-3">
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                {errorText}
              </p>
              <button
                type="button"
                onClick={() => void generateTraining()}
                disabled={isGenerating}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                再試一次
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
