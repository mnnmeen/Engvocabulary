type TrainingWordVerticalCardProps = {
  word: string;
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
    return "bg-[#FA8978] text-black";
  }
  if (key.startsWith("adj")) {
    return "bg-[#CCABDB] text-black";
  }
  if (key.startsWith("n")) {
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

export function TrainingWordVerticalCard({
  word,
  source,
  createdDate,
  proficiency,
  importance,
  memorize,
  senses,
  lastReviewDate,
}: TrainingWordVerticalCardProps) {
  const safeSenses = Array.isArray(senses) ? senses : [];
  const importanceText = getImportanceLabel(importance);
  const memorizeText =
    memorize === undefined || memorize === null ? undefined : String(memorize);

  return (
    <div className="w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <section className="space-y-2">
        <h3 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {word}
        </h3>
      </section>

      {safeSenses.length > 0 && (
        <section className="space-y-3 rounded-xl border border-zinc-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="text-xs font-medium uppercase text-zinc-400">詞性與中文</div>
          <div className="space-y-2 text-sm text-zinc-900 dark:text-zinc-100">
            {safeSenses.map((sense, idx) => {
              const pos = sense.pos ?? "other";
              const meaning = sense.chinese ?? "";
              return (
                <div key={`${pos}-${idx}`} className="flex items-start gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getPosColorClasses(pos)}`}
                  >
                    {pos}
                  </span>
                  <span className="leading-relaxed">{meaning}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {safeSenses.map((sense, senseIdx) => {
          const sensePos = sense.pos ?? "other";
          const senseExamples = sense.examples ?? [];
          const senseCollocations = sense.collocations ?? [];

          return (
            <div
              key={`sense-${sensePos}-${senseIdx}`}
              className="space-y-2 rounded-xl border border-zinc-100 p-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getPosColorClasses(sensePos)}`}
                >
                  {sensePos}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {senseCollocations.length} 個片語，{senseExamples.length} 句例句
                </span>
              </div>

              {senseCollocations.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-zinc-400">搭配詞 Collocations</div>
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
                  <div className="text-xs font-medium text-zinc-400">例句 Examples</div>
                  <ul className="list-disc space-y-1 pl-5">
                    {senseExamples.map((example, idx) => (
                      <li key={`ex-${senseIdx}-${idx}`}>{example}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col items-start gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        {source && <span>來源：{source}</span>}
        {createdDate && <span>建立日期：{createdDate}</span>}
        {typeof proficiency === "number" && <span>學習等級：Lv.{proficiency}</span>}
        {importanceText && <span>重要程度：{importanceText}</span>}
        {lastReviewDate !== undefined && (
          <span>上次複習：{lastReviewDate || "尚未複習"}</span>
        )}
        {memorizeText && <span>記憶狀態：{memorizeText}</span>}
      </section>
    </div>
  );
}