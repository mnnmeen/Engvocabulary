"use client";

import { useState } from "react";

type WordGroup = {
  pos: string;
  chinese: string;
  example: string;
  collocation: string;
  collocationExample: string;
};

const emptyGroup = (): WordGroup => ({
  pos: "",
  chinese: "",
  example: "",
  collocation: "",
  collocationExample: "",
});

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

const getPosPillClasses = (pos: string) => {
  const key = pos.trim().toLowerCase();

  if (key.startsWith("v")) {
    return "bg-[#FA8978] text-black";
  }
  if (key.startsWith("adj")) {
    return "bg-[#CCABDB] text-black";
  }
  if (key.startsWith("n")) {
    return "bg-[#80BEAF] text-black";
  }
  if (key.startsWith("adv")) {
    return "bg-[#F5C8E6] text-black";
  }
  if (key.startsWith("prep")) {
    return "bg-[#FFE29A] text-black";
  }
  if (key.startsWith("conj")) {
    return "bg-[#BFD7FF] text-black";
  }
  if (key.startsWith("pron")) {
    return "bg-[#B8E1FF] text-black";
  }
  if (key.startsWith("int")) {
    return "bg-[#FFD6A5] text-black";
  }

  return "bg-zinc-100 text-zinc-700";
};

export default function AddWordPage() {
  const [word, setWord] = useState("");
  const [groups, setGroups] = useState<WordGroup[]>([emptyGroup()]);

  const updateGroup = (
    index: number,
    field: keyof WordGroup,
    value: string,
  ) => {
    setGroups((prev) =>
      prev.map((group, i) =>
        i === index ? { ...group, [field]: value } : group,
      ),
    );
  };

  const addGroup = () => {
    setGroups((prev) => [...prev, emptyGroup()]);
  };

  const removeGroup = (index: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-amber-50 px-6 py-12 text-zinc-900 dark:from-zinc-950 dark:via-emerald-950 dark:to-zinc-900 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
            Add Word
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            新增單字
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            填寫單字、詞性與例句，建立新的單字卡。
          </p>
        </div>

        <form className="space-y-6 rounded-2xl border border-zinc-200/70 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/70">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              單字
            </span>
            <input
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="例如: focus"
              value={word}
              onChange={(event) => setWord(event.target.value)}
            />
          </label>

          <div className="space-y-6">
            {groups.map((group, index) => {
              const hasPos = group.pos.trim().length > 0;
              return (
                <div
                  key={`group-${index}`}
                  className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-6 dark:border-zinc-800 dark:bg-zinc-900/40"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      第 {index + 1} 組
                    </div>
                    {groups.length > 1 && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-zinc-400 transition hover:text-rose-500"
                        onClick={() => removeGroup(index)}
                      >
                        移除此組
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid gap-5 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        詞性
                      </span>
                      <div className="flex items-center gap-3">
                        <select
                          className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          value={group.pos}
                          onChange={(event) =>
                            updateGroup(index, "pos", event.target.value)
                          }
                        >
                          {posOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {hasPos && (
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getPosPillClasses(
                              group.pos,
                            )}`}
                          >
                            {group.pos}
                          </span>
                        )}
                      </div>
                    </label>
                  </div>

                  {!hasPos && (
                    <p className="mt-3 text-xs text-zinc-400">
                      請先選擇詞性，再填寫中文解釋、例句與搭配詞。
                    </p>
                  )}

                  {hasPos && (
                    <div className="mt-4 space-y-5">
                      <div className="grid gap-5 md:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm">
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            中文解釋
                          </span>
                          <input
                            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            placeholder="輸入中文意思"
                            value={group.chinese}
                            onChange={(event) =>
                              updateGroup(index, "chinese", event.target.value)
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm">
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            例句
                          </span>
                          <input
                            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            placeholder="輸入一個例句"
                            value={group.example}
                            onChange={(event) =>
                              updateGroup(index, "example", event.target.value)
                            }
                          />
                        </label>
                      </div>

                      <div className="grid gap-5 md:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm">
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            搭配詞
                          </span>
                          <input
                            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            placeholder="輸入搭配詞"
                            value={group.collocation}
                            onChange={(event) =>
                              updateGroup(
                                index,
                                "collocation",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm">
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            搭配詞例句
                          </span>
                          <input
                            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            placeholder="輸入搭配詞例句"
                            value={group.collocationExample}
                            onChange={(event) =>
                              updateGroup(
                                index,
                                "collocationExample",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-900/40 dark:text-emerald-200"
            onClick={addGroup}
          >
            + 增加一組
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-5 py-2 text-sm font-semibold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              取消
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-500"
            >
              儲存單字
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
