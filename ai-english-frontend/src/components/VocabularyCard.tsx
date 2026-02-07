type VocabularyCardProps = {
  word: string;
  phonetic?: string;
  source?: string;
  createdDate?: string;
  proficiency?: number;
  importance?: number;
  memorize?: string | number | boolean;
  posAndChinese?: { [pos: string]: string };
  examples?: string[];
  collocations?: {
    phrase?: string;
    meaning?: string;
    example?: string;
  }[];
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
  posAndChinese,
  examples,
  collocations,
}: VocabularyCardProps) {
  const importanceText = getImportanceLabel(importance);
  const memorizeText =
    memorize === undefined || memorize === null ? undefined : String(memorize);

  return (
    <div className="w-full max-w-5xl rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex gap-8">
        {/* 左邊：單字 + 詞性與中文 + 等級資訊 */}
        <div className="flex-1">
          <div className="mb-4 flex items-start justify-between gap-6">
            <div>
              <div className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {word}
              </div>
            </div>
          </div>

          {posAndChinese && (
            <div className="rounded-2xl border border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="mb-2 text-xs font-medium uppercase text-zinc-400">
                詞性與中文
              </div>
              <div className="space-y-2 text-sm text-zinc-900 dark:text-zinc-100">
                {Object.entries(posAndChinese).map(([pos, meaning]) => {
                  const colorClasses = getPosColorClasses(pos);
                  return (
                    <div key={pos} className="flex items-start gap-3">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${colorClasses}`}
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
          <div className="flex flex-col items-start mt-2 gap-1 text-right text-xs text-zinc-500 dark:text-zinc-400">
            {source && <span>來源：{source}</span>}
            {createdDate && <span>建立日期：{createdDate}</span>}
            {typeof proficiency === "number" && (
              <span>學習等級：Lv.{proficiency}</span>
            )}
            {importanceText && <span>重要程度：{importanceText}</span>}
          </div>
        </div>

        {/* 右邊：Examples + Collocations */}
        <div className="flex-1 space-y-4">
          {collocations && collocations.length > 0 && (
            <div className="space-y-2 rounded-xl p-4 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
              <div className="text-xs font-medium text-zinc-400">
                搭配詞 Collocations
              </div>
              <div className="space-y-2">
                {collocations.map((c, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border-l-4 border-l-zinc-300 bg-white p-2 pl-3 dark:border-l-zinc-600 dark:bg-zinc-900/40"
                  >
                    {(c.phrase || c.meaning) && (
                      <div className="flex items-baseline gap-2">
                        {c.phrase && (
                          <span className="text-sm font-semibold text-black dark:text-zinc-50">
                            {c.phrase}
                          </span>
                        )}
                        {c.meaning && (
                          <span className="text-xs text-zinc-600 dark:text-zinc-300">
                            {c.meaning}
                          </span>
                        )}
                      </div>
                    )}
                    {c.example && (
                      <div className="mt-1 text-xs text-zinc-700 dark:text-zinc-200">
                        {c.example}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {examples && examples.length > 0 && (
            <div className="space-y-1 rounded-xl p-4 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              <div className="text-xs font-medium text-zinc-400">
                其他例句 Examples
              </div>
              <ul className="list-disc space-y-1 pl-5">
                {examples.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
