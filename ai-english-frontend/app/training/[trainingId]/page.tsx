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
    pool_limit?: number;
    selected_limit?: number;
    pool_count?: number;
    vector_count?: number;
    selected_count?: number;
    rule?: string;
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
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000";

function renderBoldMarkdownLine(
  line: string,
  onWordClick: (word: string) => void,
  selectedWord: string | null,
) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const text = part.slice(2, -2);
      return (
        <button
          key={`${part}-${index}`}
          type="button"
          onClick={() => onWordClick(text)}
          className={`font-bold underline decoration-dotted underline-offset-4 transition hover:text-emerald-600 dark:hover:text-emerald-200 ${
            selectedWord?.toLowerCase() === text.toLowerCase()
              ? "text-emerald-700 dark:text-emerald-200"
              : "text-emerald-700 dark:text-emerald-300"
          }`}
          title={`查看 ${text} 單字卡`}
        >
          {text}
        </button>
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
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordDetail, setWordDetail] = useState<WordDetail | null>(null);
  const [isWordLoading, setIsWordLoading] = useState(false);
  const [wordErrorText, setWordErrorText] = useState<string | null>(null);

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

  const loadWordDetail = async (word: string) => {
    const normalized = word.trim();
    if (!normalized) {
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

  useEffect(() => {
    if (!detail || !detail.words || detail.words.length === 0) {
      return;
    }
    if (selectedWord) {
      return;
    }
    void loadWordDetail(detail.words[0]);
  }, [detail, selectedWord]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-slate-50 to-teal-50 px-6 py-12 text-zinc-900 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-7xl space-y-6">
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
              <div className="mb-3 text-sm font-semibold">練習單字（可點擊查看單字卡）</div>
              <div className="flex flex-wrap gap-2">
                {(detail.words || []).map((word) => (
                  <button
                    type="button"
                    onClick={() => void loadWordDetail(word)}
                    key={word}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      selectedWord?.toLowerCase() === word.toLowerCase()
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                    }`}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
              <article className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 leading-8 text-zinc-800 shadow-sm dark:border-emerald-900/80 dark:bg-emerald-950/30 dark:text-zinc-100">
                <div className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700/80 dark:text-emerald-300/80">
                  點擊粗體練習單字可在右側看單字卡
                </div>
                {articleLines.map((line, index) => (
                  <p key={`line-${index}`} className="mb-3 last:mb-0">
                    {line.trim().length > 0
                      ? renderBoldMarkdownLine(line, (word) => void loadWordDetail(word), selectedWord)
                      : <>&nbsp;</>}
                  </p>
                ))}
              </article>

              <aside className="lg:sticky lg:top-6 lg:self-start">
                <div className="rounded-2xl border border-zinc-200/80 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
                  <div className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">單字卡側邊欄</div>
                  {isWordLoading ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
                      單字卡載入中...
                    </div>
                  ) : wordErrorText ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                      {wordErrorText}
                    </div>
                  ) : wordDetail ? (
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
                  ) : (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
                      點擊文章中的粗體單字，即可在這裡查看單字卡。
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
