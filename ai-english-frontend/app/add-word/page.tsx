"use client";

import { FormEvent, useMemo, useState } from "react";

type CollocationForm = {
  phrase: string;
  phrase_example: string;
};

type SenseForm = {
  pos: string;
  examples: string[];
  collocations: CollocationForm[];
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000";

const posOptions = [
  { value: "", label: "請選擇詞性" },
  { value: "n.", label: "n. 名詞" },
  { value: "v.", label: "v. 動詞" },
  { value: "adj.", label: "adj. 形容詞" },
  { value: "adv.", label: "adv. 副詞" },
  { value: "prep.", label: "prep. 介系詞" },
  { value: "conj.", label: "conj. 連接詞" },
  { value: "pron.", label: "pron. 代名詞" },
  { value: "int.", label: "int. 感嘆詞" },
];

const importanceOptions = [
  { value: 5, label: "5 - 非常重要" },
  { value: 4, label: "4 - 重要" },
  { value: 3, label: "3 - 普通" },
  { value: 2, label: "2 - 較低" },
  { value: 1, label: "1 - 低" },
];

const commonnessOptions = [
  { value: 5, label: "5 - 非常常見" },
  { value: 4, label: "4 - 常見" },
  { value: 3, label: "3 - 普通" },
  { value: 2, label: "2 - 不常見" },
  { value: 1, label: "1 - 稀有" },
];

const emptySense = (): SenseForm => ({
  pos: "",
  examples: [""],
  collocations: [{ phrase: "", phrase_example: "" }],
});

export default function AddWordPage() {
  const [word, setWord] = useState("");
  const [importance, setImportance] = useState(3);
  const [commonness, setCommonness] = useState(3);
  const [senses, setSenses] = useState<SenseForm[]>([emptySense()]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const validSenseCount = useMemo(() => {
    return senses.filter((sense) => sense.pos.trim()).length;
  }, [senses]);

  const updateSense = (index: number, patch: Partial<SenseForm>) => {
    setSenses((prev) =>
      prev.map((sense, i) => (i === index ? { ...sense, ...patch } : sense)),
    );
  };

  const addSense = () => {
    setSenses((prev) => [...prev, emptySense()]);
  };

  const removeSense = (index: number) => {
    setSenses((prev) => prev.filter((_, i) => i !== index));
  };

  const updateExample = (senseIndex: number, exampleIndex: number, value: string) => {
    setSenses((prev) =>
      prev.map((sense, i) => {
        if (i !== senseIndex) return sense;
        const examples = sense.examples.map((example, exIndex) =>
          exIndex === exampleIndex ? value : example,
        );
        return { ...sense, examples };
      }),
    );
  };

  const addExample = (senseIndex: number) => {
    setSenses((prev) =>
      prev.map((sense, i) => {
        if (i !== senseIndex) return sense;
        return { ...sense, examples: [...sense.examples, ""] };
      }),
    );
  };

  const removeExample = (senseIndex: number, exampleIndex: number) => {
    setSenses((prev) =>
      prev.map((sense, i) => {
        if (i !== senseIndex) return sense;
        const examples = sense.examples.filter((_, exIndex) => exIndex !== exampleIndex);
        return { ...sense, examples: examples.length > 0 ? examples : [""] };
      }),
    );
  };

  const updateCollocation = (
    senseIndex: number,
    collocationIndex: number,
    field: keyof CollocationForm,
    value: string,
  ) => {
    setSenses((prev) =>
      prev.map((sense, i) => {
        if (i !== senseIndex) return sense;
        const collocations = sense.collocations.map((collocation, cIndex) =>
          cIndex === collocationIndex ? { ...collocation, [field]: value } : collocation,
        );
        return { ...sense, collocations };
      }),
    );
  };

  const addCollocation = (senseIndex: number) => {
    setSenses((prev) =>
      prev.map((sense, i) => {
        if (i !== senseIndex) return sense;
        return {
          ...sense,
          collocations: [...sense.collocations, { phrase: "", phrase_example: "" }],
        };
      }),
    );
  };

  const removeCollocation = (senseIndex: number, collocationIndex: number) => {
    setSenses((prev) =>
      prev.map((sense, i) => {
        if (i !== senseIndex) return sense;
        const collocations = sense.collocations.filter((_, cIndex) => cIndex !== collocationIndex);
        return {
          ...sense,
          collocations: collocations.length > 0 ? collocations : [{ phrase: "", phrase_example: "" }],
        };
      }),
    );
  };

  const resetForm = () => {
    setWord("");
    setImportance(3);
    setCommonness(3);
    setSenses([emptySense()]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorText(null);
    setSuccessText(null);

    const normalizedWord = word.trim();
    if (!normalizedWord) {
      setErrorText("請先輸入英文單字。");
      return;
    }

    const normalizedSenses = senses
      .map((sense) => ({
        pos: sense.pos.trim(),
        examples: sense.examples.map((ex) => ex.trim()).filter(Boolean),
        collocations: sense.collocations
          .map((collocation) => ({
            phrase: collocation.phrase.trim(),
            phrase_example: collocation.phrase_example.trim(),
          }))
          .filter((collocation) => collocation.phrase),
      }))
      .filter((sense) => sense.pos);

    if (normalizedSenses.length === 0) {
      setErrorText("至少要新增一個詞性。\n每個詞性都必須先選擇詞性欄位。");
      return;
    }

    const payload = {
      word: normalizedWord,
      importance,
      proficiency: commonness,
      senses: normalizedSenses,
    };

    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE}/words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const maybeJson = await response.json().catch(() => null);
        const detail =
          maybeJson && typeof maybeJson.detail === "string"
            ? maybeJson.detail
            : "儲存失敗，請稍後再試。";
        throw new Error(detail);
      }

      const data = await response.json();
      setSuccessText(`已成功新增單字：${data.word}`);
      resetForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "儲存失敗。";
      if (message.toLowerCase().includes("failed to fetch")) {
        setErrorText("無法連線到後端 API，請確認 http://localhost:8000 已啟動。");
      } else {
        setErrorText(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-amber-50 px-6 py-12 text-zinc-900 dark:from-zinc-950 dark:via-emerald-950 dark:to-zinc-900 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
            Add Word
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">新增單字</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            新增英文單字，並依需求配置詞性、例句、搭配詞與搭配詞例句。
          </p>
        </div>

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-6 rounded-2xl border border-zinc-200/70 bg-white/85 p-8 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70"
        >
          <div className="grid gap-5 md:grid-cols-3">
            <label className="md:col-span-3 flex flex-col gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">英文單字</span>
              <input
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="例如: bargain"
                value={word}
                onChange={(event) => setWord(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">重要程度</span>
              <select
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                value={importance}
                onChange={(event) => setImportance(Number(event.target.value))}
              >
                {importanceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">常見程度</span>
              <select
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                value={commonness}
                onChange={(event) => setCommonness(Number(event.target.value))}
              >
                {commonnessOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end text-xs text-zinc-500 dark:text-zinc-400">
              已設定 {validSenseCount} 個詞性
            </div>
          </div>

          <div className="space-y-6">
            {senses.map((sense, senseIndex) => (
              <section
                key={`sense-${senseIndex}`}
                className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-6 dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    詞性區塊 {senseIndex + 1}
                  </div>
                  {senses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSense(senseIndex)}
                      className="text-xs font-semibold text-zinc-400 transition hover:text-rose-500"
                    >
                      刪除此詞性
                    </button>
                  )}
                </div>

                <label className="mb-4 flex flex-col gap-2 text-sm md:w-64">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">詞性</span>
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    value={sense.pos}
                    onChange={(event) => updateSense(senseIndex, { pos: event.target.value })}
                  >
                    {posOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">例句</h3>
                    <button
                      type="button"
                      onClick={() => addExample(senseIndex)}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                    >
                      + 新增例句
                    </button>
                  </div>

                  {sense.examples.map((example, exampleIndex) => (
                    <div key={`example-${senseIndex}-${exampleIndex}`} className="flex items-center gap-2">
                      <input
                        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        placeholder="輸入此詞性的例句"
                        value={example}
                        onChange={(event) =>
                          updateExample(senseIndex, exampleIndex, event.target.value)
                        }
                      />
                      {sense.examples.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeExample(senseIndex, exampleIndex)}
                          className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-500 transition hover:border-rose-300 hover:text-rose-600 dark:border-zinc-700 dark:text-zinc-400"
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">搭配詞與搭配詞例句</h3>
                    <button
                      type="button"
                      onClick={() => addCollocation(senseIndex)}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                    >
                      + 新增搭配詞
                    </button>
                  </div>

                  {sense.collocations.map((collocation, collocationIndex) => (
                    <div
                      key={`collocation-${senseIndex}-${collocationIndex}`}
                      className="grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40 md:grid-cols-[1fr_1.2fr_auto]"
                    >
                      <input
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        placeholder="搭配詞（例如 bargain on sth）"
                        value={collocation.phrase}
                        onChange={(event) =>
                          updateCollocation(senseIndex, collocationIndex, "phrase", event.target.value)
                        }
                      />
                      <input
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        placeholder="搭配詞例句"
                        value={collocation.phrase_example}
                        onChange={(event) =>
                          updateCollocation(
                            senseIndex,
                            collocationIndex,
                            "phrase_example",
                            event.target.value,
                          )
                        }
                      />
                      {sense.collocations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCollocation(senseIndex, collocationIndex)}
                          className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-500 transition hover:border-rose-300 hover:text-rose-600 dark:border-zinc-700 dark:text-zinc-400"
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <button
            type="button"
            onClick={addSense}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-900/40 dark:text-emerald-200"
          >
            + 增加詞性區塊
          </button>

          {errorText && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
              {errorText}
            </div>
          )}

          {successText && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              {successText}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-5 py-2 text-sm font-semibold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              清空
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`inline-flex items-center justify-center rounded-full px-6 py-2 text-sm font-semibold text-white shadow-md transition ${
                isSaving
                  ? "cursor-not-allowed bg-emerald-300"
                  : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {isSaving ? "儲存中..." : "儲存單字"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
