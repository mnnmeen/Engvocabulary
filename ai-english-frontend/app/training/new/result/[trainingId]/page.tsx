"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TrainingWordVerticalCard } from "@/src/components/TrainingWordVerticalCard";

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
    algorithm?: string;
    pool_limit?: number;
    selected_limit?: number;
    pool_count?: number;
    vector_count?: number;
    selected_count?: number;
    rule?: string;
    due?: { selected?: number; total?: number };
    at_risk?: { selected?: number; total?: number };
    new?: { selected?: number; total?: number };
    maintenance?: { selected?: number; total?: number };
  };
};

type WordDetail = {
  _id?: string;
  id?: string;
  word?: string;
  source?: string;
  created_date?: string;
  proficiency?: number;
  importance?: number;
  memorize?: string | number | boolean;
  senses?: {
    pos?: string;
    chinese?: string;
    examples?: string[];
    collocations?: {
      phrase?: string;
      phrase_chinese?: string;
      phrase_example?: string;
    }[];
  }[];
  last_review_date?: string;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
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

export default function TrainingNewResultPage() {
  const params = useParams<{ trainingId: string }>();
  const trainingId = params?.trainingId;

  const [detail, setDetail] = useState<TrainingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordDetail, setWordDetail] = useState<WordDetail | null>(null);
  const [isWordLoading, setIsWordLoading] = useState(false);
  const [wordErrorText, setWordErrorText] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [wordFeedback, setWordFeedback] = useState<Record<string, "familiar" | "unsure" | "new">>({});

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
              : "讀取生成結果失敗，請稍後重試。";
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
        const message = error instanceof Error ? error.message : "讀取生成結果失敗。";
        if (message.toLowerCase().includes("failed to fetch")) {
          setErrorText("無法連線到後端 API（Failed to fetch）。請確認 http://localhost:8000 已啟動。");
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

  const loadWordDetail = async (word: string) => {
    const normalized = word.trim();
    if (!normalized) {
      return;
    }

    if (selectedWord?.toLowerCase() === normalized.toLowerCase()) {
      setSelectedWord(null);
      setWordDetail(null);
      setWordErrorText(null);
      return;
    }

    setSelectedWord(normalized);
    setIsWordLoading(true);
    setWordErrorText(null);

    try {
      const encodedWord = encodeURIComponent(normalized);
      const res = await fetch(`${API_BASE}/words/by-word/${encodedWord}`);

      if (!res.ok) {
        const maybeJson = await res.json().catch(() => null);
        const detailMessage =
          maybeJson && typeof maybeJson.detail === "string"
            ? maybeJson.detail
            : "讀取單字卡失敗，請稍後再試。";
        throw new Error(detailMessage);
      }

      const data = (await res.json()) as WordDetail;
      setWordDetail(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "讀取單字卡失敗。";
      setWordDetail(null);
      if (message.toLowerCase().includes("failed to fetch")) {
        setWordErrorText("無法連線到後端 API，請確認 http://localhost:8000 已啟動。");
      } else {
        setWordErrorText(message);
      }
    } finally {
      setIsWordLoading(false);
    }
  };

  const recordFeedback = async (
    feedback: "familiar" | "unsure" | "new"
  ) => {
    if (!selectedWordKey) {
      console.error("No selected word");
      return;
    }

    // 只更新本地狀態，不立即保存
    setWordFeedback((prev) => ({ ...prev, [selectedWordKey]: feedback }));
  };

  const saveAllFeedback = async () => {
    if (!trainingId || Object.keys(wordFeedback).length === 0) {
      alert("沒有任何反饋需要保存");
      return;
    }

    setIsSaving(true);
    try {
      const feedbackEntries = Object.entries(wordFeedback).map(([word, feedback]) => ({
        word,
        feedback,
      }));

      console.log("準備保存反饋:", feedbackEntries);

      let successCount = 0;
      const errors: string[] = [];

      for (const { word, feedback } of feedbackEntries) {
        try {
          // 取得單字的 _id
          const encodedWord = encodeURIComponent(word);
          const res = await fetch(`${API_BASE}/words/by-word/${encodedWord}`);
          if (!res.ok) {
            errors.push(`${word}: 無法找到該單字`);
            continue;
          }

          const wordDetail = await res.json();

          const response = await fetch(
            `${API_BASE}/training/${trainingId}/record-feedback`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                word_id: wordDetail._id,
                feedback: feedback,
                training_id: trainingId,
                review_mode: "article_context",
              }),
            }
          );

          if (response.ok) {
            successCount++;
            console.log(`✓ 已保存 ${word}: ${feedback}`);
          } else {
            const errData = await response.json().catch(() => ({}));
            errors.push(`${word}: ${errData.detail || "保存失敗"}`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : "未知錯誤";
          errors.push(`${word}: ${msg}`);
        }
      }

      // 重置反饋狀態
      if (successCount > 0) {
        setWordFeedback({});
      }

      // 顯示結果
      let message = `成功保存 ${successCount}/${feedbackEntries.length} 個反饋`;
      if (errors.length > 0) {
        message += `\n\n失敗: ${errors.slice(0, 3).join("\n")}${errors.length > 3 ? `\n...等${errors.length - 3}個` : ""}`;
      }
      alert(message);
    } catch (error) {
      console.error("Error saving feedback:", error);
      alert("保存反饋時出錯");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedWordKey = selectedWord?.toLowerCase() ?? "";
  const selectedFeedback = selectedWordKey ? wordFeedback[selectedWordKey] : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-slate-50 to-emerald-50 px-4 py-8 text-zinc-900 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 dark:text-zinc-50 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">Training Builder</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">2. 生成結果</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">AI 文章已生成完成，以下是本次練習內容。</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Link
              href="/training/new"
              className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 sm:w-auto"
            >
              再生成一篇
            </Link>
            <Link
              href="/training"
              className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 sm:w-auto"
            >
              返回訓練首頁
            </Link>
          </div>
        </div>

        {isLoading ? (
          <section className="rounded-2xl border border-zinc-200/70 bg-white/85 p-6 text-sm text-zinc-500 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70 dark:text-zinc-400">
            生成結果載入中...
          </section>
        ) : errorText ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
            {errorText}
          </section>
        ) : !detail ? (
          <section className="rounded-2xl border border-zinc-200/70 bg-white/85 p-6 text-sm text-zinc-500 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70 dark:text-zinc-400">
            找不到本次生成結果。
          </section>
        ) : (
          <div className="space-y-4">
            <article className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 leading-7 text-zinc-800 dark:border-emerald-900/80 dark:bg-emerald-950/30 dark:text-zinc-100 sm:p-5 sm:leading-8">
              <h2 className="mb-3 text-lg font-semibold">AI 文章</h2>
              {articleLines.map((line, index) => (
                <p key={`line-${index}`} className="mb-3 last:mb-0">
                  {line.trim().length > 0 ? renderBoldMarkdownLine(line) : <>&nbsp;</>}
                </p>
              ))}
            </article>

            <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
              <div className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                <h2 className="text-lg font-semibold">本次練習單字</h2>
                <button
                  type="button"
                  onClick={() => void saveAllFeedback()}
                  disabled={Object.keys(wordFeedback).length === 0 || isSaving}
                  className={`w-full rounded-lg px-4 py-2 text-sm font-semibold transition sm:w-auto ${
                    Object.keys(wordFeedback).length === 0 || isSaving
                      ? "border border-zinc-300 bg-zinc-100 text-zinc-400 cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
                      : "border-0 bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  }`}
                >
                  {isSaving ? "⏳ 保存中..." : `💾 保存反饋（${Object.keys(wordFeedback).length}個）`}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-2">
                  {detail.words.map((word, index) => {
                    const isSelected = selectedWord?.toLowerCase() === word.toLowerCase();
                    const wordFeedbackStatus = wordFeedback[word.toLowerCase()];
                    
                    let baseClass = "flex w-full flex-col items-start justify-between gap-1 rounded-lg border px-3 py-3 text-left transition sm:flex-row sm:items-center sm:gap-3 sm:px-4 ";
                    
                    if (isSelected) {
                      baseClass += "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-100";
                    } else if (wordFeedbackStatus === "familiar") {
                      baseClass += "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-100";
                    } else if (wordFeedbackStatus === "unsure") {
                      baseClass += "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100";
                    } else if (wordFeedbackStatus === "new") {
                      baseClass += "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-100";
                    } else {
                      baseClass += "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-100 dark:hover:border-emerald-800";
                    }
                    
                    const feedbackEmoji: Record<string, string> = {
                      familiar: "😎",
                      unsure: "🤔",
                      new: "🫠",
                    };
                    
                    return (
                      <button
                        key={word}
                        type="button"
                        onClick={() => void loadWordDetail(word)}
                        className={baseClass}
                      >
                        <span className="text-sm font-semibold">
                          {index + 1}. {word}
                          {wordFeedbackStatus && <span className="ml-2">{feedbackEmoji[wordFeedbackStatus]}</span>}
                        </span>
                        <span className="text-xs font-medium">{isSelected ? "收合單字卡" : "打開單字卡"}</span>
                      </button>
                    );
                  })}
                </div>

                <div>
                  {isWordLoading ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
                      單字卡載入中...
                    </div>
                  ) : wordErrorText ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                      {wordErrorText}
                    </div>
                  ) : wordDetail ? (
                    <div className="space-y-3">
                      <TrainingWordVerticalCard
                        word={wordDetail.word ?? selectedWord ?? "(no word)"}
                        source={wordDetail.source}
                        createdDate={wordDetail.created_date}
                        proficiency={wordDetail.proficiency}
                        importance={wordDetail.importance}
                        memorize={wordDetail.memorize}
                        senses={wordDetail.senses}
                        lastReviewDate={wordDetail.last_review_date}
                      />

                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                          這個單字現在感覺
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <button
                            type="button"
                            onClick={() => {
                              recordFeedback("familiar");
                            }}
                            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                              selectedFeedback === "familiar"
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                            }`}
                          >
                            😎 很熟了
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              recordFeedback("unsure");
                            }}
                            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                              selectedFeedback === "unsure"
                                ? "border-amber-500 bg-amber-500 text-white"
                                : "border-zinc-300 bg-white text-zinc-700 hover:border-amber-400 hover:text-amber-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                            }`}
                          >
                            🤔 有點不確定
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              recordFeedback("new");
                            }}
                            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                              selectedFeedback === "new"
                                ? "border-rose-600 bg-rose-600 text-white"
                                : "border-zinc-300 bg-white text-zinc-700 hover:border-rose-400 hover:text-rose-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                            }`}
                          >
                            🫠 很陌生
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                      點擊左側任一單字橫條，可展開直式單字卡。
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
