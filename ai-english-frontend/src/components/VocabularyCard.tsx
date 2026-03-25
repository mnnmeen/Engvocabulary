type VocabularyCardProps = {
  word: string;
  phonetic?: string;
  source?: string;
  createdDate?: string;
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
  lastReviewDate?: string;
};

function getPosColorClasses(pos: string) {
  const key = pos.trim().toLowerCase();

  if (key.startsWith("v")) {
    // 動詞：FA8978
    return "bg-[#FA8978] text-black";
  }
  if (key.startsWith("adj")) {
    // 形容詞：CCABDB
    return "bg-[#CCABDB] text-black";
  }
  if (key.startsWith("n")) {
    // 名詞：80BEAF
    return "bg-[#80BEAF] text-black";
  }

  return "bg-zinc-100 text-zinc-700";
}

function getImportanceLabel(importance?: number) {
  if (importance === 5) return "🔴 5級：超級常見";
  if (importance === 4) return "🟠 4級：常見但不重要";
  if (importance === 3) return "🟡 3級：普通";
  if (importance === 2) return "🟤 2級：不常見";
  if (importance === 1) return "⚫ 1級：較罕見";
  return undefined;
}

export function VocabularyCard({
  word,
  phonetic,
  source,
  createdDate,
  proficiency,
  importance,
  memorize,
  senses,
  lastReviewDate,
}: VocabularyCardProps) {
  const importanceText = getImportanceLabel(importance);
  const memorizeText =
    memorize === undefined || memorize === null ? undefined : String(memorize);
  const safeSenses = Array.isArray(senses) ? senses : [];
  const totalCollocations = safeSenses.reduce(
    (sum, sense) => sum + (sense.collocations?.length ?? 0),
    0,
  );

  return (
    <div className="w-full max-w-4xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex gap-6">
        {/* 左邊：單字 + 詞性與中文 + 等級資訊 */}
        <div className="flex-1">
          <div className="mb-4 flex items-start justify-between gap-6">
            <div>
              <div className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {word}
              </div>
            </div>
          </div>

          {safeSenses.length > 0 && (
            <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="mb-2 text-xs font-medium uppercase text-zinc-400">
                詞性與中文
              </div>
              <div className="space-y-2 text-sm text-zinc-900 dark:text-zinc-100">
                {safeSenses.map((sense, idx) => {
                  const pos = sense.pos ?? "other";
                  const meaning = sense.chinese ?? "";
                  const colorClasses = getPosColorClasses(pos);
                  return (
                    <div key={`${pos}-${idx}`} className="flex items-start gap-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClasses}`}
                      >
                        {pos}
                      </span>
                      <span className="leading-relaxed">{meaning}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-col items-start gap-1 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
            {source && <span>來源：{source}</span>}
            {createdDate && <span>建立日期：{createdDate}</span>}
            {typeof proficiency === "number" && (
              <span>學習等級：Lv.{proficiency}</span>
            )}
            {importanceText && <span>重要程度：{importanceText}</span>}
            {lastReviewDate !== undefined && (
              <span>上次複習：{lastReviewDate || "尚未複習"}</span>
            )}
            {memorizeText && <span>記憶狀態：{memorizeText}</span>}
          </div>
        </div>

        {/* 右邊：Examples + Collocations */}
        <div className="flex-1 space-y-3">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            片語數量：{totalCollocations}
          </div>
          {safeSenses.map((sense, senseIdx) => {
            const sensePos = sense.pos ?? "other";
            const colorClasses = getPosColorClasses(sensePos);
            const senseExamples = sense.examples ?? [];
            const senseCollocations = sense.collocations ?? [];

            return (
              <div
                key={`sense-${sensePos}-${senseIdx}`}
                className="space-y-2 rounded-xl border border-zinc-100 p-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClasses}`}
                  >
                    {sensePos}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {senseCollocations.length} 個片語，{senseExamples.length} 句例句
                  </span>
                </div>

                {senseCollocations.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-zinc-400">
                      搭配詞 Collocations
                    </div>
                    {senseCollocations.map((c, idx) => (
                      <div
                        key={`col-${senseIdx}-${idx}`}
                        className="rounded-md border-l-4 border-l-zinc-300 bg-white p-2 pl-3 text-[13px] dark:border-l-zinc-600 dark:bg-zinc-900/40"
                      >
                        {(c.phrase || c.phrase_chinese) && (
                          <div className="flex items-baseline gap-2">
                            {c.phrase && (
                              <span className="text-sm font-semibold text-black dark:text-zinc-50">
                                {c.phrase}
                              </span>
                            )}
                            {c.phrase_chinese && (
                              <span className="text-xs text-zinc-600 dark:text-zinc-300">
                                {c.phrase_chinese}
                              </span>
                            )}
                          </div>
                        )}
                        {c.phrase_example && (
                          <div className="mt-1 text-xs text-zinc-700 dark:text-zinc-200">
                            {c.phrase_example}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {senseExamples.length > 0 && (
                  <div className="space-y-1 rounded-xl p-2 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    <div className="text-xs font-medium text-zinc-400">
                      例句 Examples
                    </div>
                    <ul className="list-disc space-y-1 pl-5">
                      {senseExamples.map((e, idx) => (
                        <li key={`ex-${senseIdx}-${idx}`}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
