"use client";

import { useEffect, useMemo, useState } from "react";
import { VocabularyCard } from "@/src/components/VocabularyCard";

type WordResponse = {
	_id: string;
	id: string;
	word: string;
	lemma?: string;
	source?: string;
	created_date?: string;
	proficiency?: number;
	importance?: number;
	memorize?: string | boolean;
	last_review_date?: string;
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
};

type WordListResponse = {
	items: WordResponse[];
	page: number;
	limit: number;
	total: number;
	total_pages: number;
};

const importanceOptions = [5, 4, 3, 2, 1] as const;
const proficiencyOptions = [1, 2, 3, 4, 5] as const;
const posOptions = ["n.", "v.", "adj.", "adv.", "prep.", "conj.", "pron.", "int."] as const;
const API_BASE =
	process.env.NEXT_PUBLIC_API_BASE ||
	process.env.NEXT_PUBLIC_API_BASE_URL ||
	"http://localhost:8000";

export default function AllWordsPage() {
	const [error, setError] = useState<string | null>(null);
	const [words, setWords] = useState<WordResponse[]>([]);
	const [allWords, setAllWords] = useState<WordResponse[]>([]);
	const [page, setPage] = useState(1);
	const [serverTotalPages, setServerTotalPages] = useState(1);
	const [isLoading, setIsLoading] = useState(false);
	const [englishQuery, setEnglishQuery] = useState("");
	const [chineseQuery, setChineseQuery] = useState("");
	const [selectedImportance, setSelectedImportance] = useState<number[]>([]);
	const [selectedProficiency, setSelectedProficiency] = useState<number[]>([]);
	const [selectedPos, setSelectedPos] = useState<string[]>([]);
	const pageSize = 20;

	const normalizedEnglishQuery = englishQuery.trim().toLowerCase();
	const normalizedChineseQuery = chineseQuery.trim();
	const isFiltering =
		normalizedEnglishQuery.length > 0 ||
		normalizedChineseQuery.length > 0 ||
		selectedImportance.length > 0 ||
		selectedProficiency.length > 0 ||
		selectedPos.length > 0;

	useEffect(() => {
		if (isFiltering) {
			return;
		}

		const fetchWords = async () => {
			try {
				setIsLoading(true);
				setError(null);
				const res = await fetch(`${API_BASE}/words?page=${page}&limit=${pageSize}`);
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}
				const data: WordListResponse = await res.json();
				setWords(data.items ?? []);
				setServerTotalPages(data.total_pages ?? 1);
			} catch (err: any) {
				setError(err.message ?? "Unknown error");
				setWords([]);
				setServerTotalPages(1);
			} finally {
				setIsLoading(false);
			}
		};

		fetchWords();
	}, [isFiltering, page]);

	useEffect(() => {
		if (!isFiltering) {
			setAllWords([]);
			return;
		}

		const fetchAllWords = async () => {
			try {
				setIsLoading(true);
				setError(null);
				const initialRes = await fetch(`${API_BASE}/words?page=1&limit=100`);
				if (!initialRes.ok) {
					throw new Error(`HTTP ${initialRes.status}`);
				}

				const initialData: WordListResponse = await initialRes.json();
				let mergedItems = [...(initialData.items ?? [])];
				const totalPageCount = initialData.total_pages ?? 1;

				for (let pageIndex = 2; pageIndex <= totalPageCount; pageIndex += 1) {
					const res = await fetch(`${API_BASE}/words?page=${pageIndex}&limit=100`);
					if (!res.ok) {
						throw new Error(`HTTP ${res.status}`);
					}
					const data: WordListResponse = await res.json();
					mergedItems = mergedItems.concat(data.items ?? []);
				}

				setAllWords(mergedItems);
			} catch (err: any) {
				setError(err.message ?? "Unknown error");
				setAllWords([]);
			} finally {
				setIsLoading(false);
			}
		};

		fetchAllWords();
	}, [isFiltering]);

	useEffect(() => {
		setPage(1);
	}, [englishQuery, chineseQuery, selectedImportance, selectedProficiency, selectedPos]);

	const matchesEnglish = (value?: string) => {
		if (!normalizedEnglishQuery) return true;
		return (value ?? "").toLowerCase().includes(normalizedEnglishQuery);
	};

	const matchesChinese = (value?: string) => {
		if (!normalizedChineseQuery) return true;
		return (value ?? "").includes(normalizedChineseQuery);
	};

	const matchesImportance = (value?: number) => {
		if (selectedImportance.length === 0) return true;
		if (typeof value !== "number") return false;
		return selectedImportance.includes(value);
	};

	const matchesProficiency = (value?: number) => {
		if (selectedProficiency.length === 0) return true;
		if (typeof value !== "number") return false;
		return selectedProficiency.includes(value);
	};

	const matchesPos = (
		senses?: {
			pos?: string;
		}[],
	) => {
		if (selectedPos.length === 0) return true;
		if (!senses || senses.length === 0) return false;

		const entryPos = senses
			.map((sense) => (sense.pos ?? "").trim().toLowerCase())
			.filter(Boolean);
		const pickedPos = selectedPos.map((pos) => pos.trim().toLowerCase());
		return pickedPos.some((pos) => entryPos.includes(pos));
	};

	const toggleNumberSelection = (
		setter: React.Dispatch<React.SetStateAction<number[]>>,
		value: number,
	) => {
		setter((prev) =>
			prev.includes(value)
				? prev.filter((item) => item !== value)
				: [...prev, value],
		);
	};

	const toggleStringSelection = (
		setter: React.Dispatch<React.SetStateAction<string[]>>,
		value: string,
	) => {
		setter((prev) =>
			prev.includes(value)
				? prev.filter((item) => item !== value)
				: [...prev, value],
		);
	};

	const getChipClasses = (checked: boolean, tone: "amber" | "emerald" | "sky") => {
		const activeTone =
			tone === "amber"
				? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100"
				: tone === "emerald"
					? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100"
					: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-100";

		const inactiveTone =
			"border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500";

		return `group inline-flex cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium shadow-sm transition ${
			checked ? activeTone : inactiveTone
		}`;
	};

	const sourceWords = isFiltering ? allWords : words;

	const filteredWords = sourceWords.filter((entry) => {
		const passesEnglish = matchesEnglish(entry.word);
		const chineseValues = (entry.senses ?? [])
			.flatMap((sense) => {
				const meanings = sense.chinese ? [sense.chinese] : [];
				const phraseMeanings = (sense.collocations ?? [])
					.map((item) => item.phrase_chinese ?? "")
					.filter(Boolean);
				return meanings.concat(phraseMeanings);
			})
			.join(" ");
		const passesChinese = matchesChinese(chineseValues);
		const passesImportance = matchesImportance(entry.importance);
		const passesProficiency = matchesProficiency(entry.proficiency);
		const passesPos = matchesPos(entry.senses);
		return (
			passesEnglish &&
			passesChinese &&
			passesImportance &&
			passesProficiency &&
			passesPos
		);
	});

	const totalPages = isFiltering
		? Math.max(1, Math.ceil(filteredWords.length / pageSize))
		: serverTotalPages;

	const visibleWords = useMemo(() => {
		if (!isFiltering) {
			return filteredWords;
		}

		const startIndex = (page - 1) * pageSize;
		return filteredWords.slice(startIndex, startIndex + pageSize);
	}, [filteredWords, isFiltering, page]);

	const handlePrevPage = () => {
		setPage((current) => Math.max(1, current - 1));
	};

	const handleNextPage = () => {
		setPage((current) => Math.min(totalPages, current + 1));
	};

	const getPageItems = (current: number, total: number) => {
		if (total <= 7) {
			return Array.from({ length: total }, (_, idx) => idx + 1);
		}

		const items: Array<number | string> = [1];
		const left = Math.max(2, current - 1);
		const right = Math.min(total - 1, current + 1);

		if (left > 2) {
			items.push("...");
		}

		for (let pageIndex = left; pageIndex <= right; pageIndex += 1) {
			items.push(pageIndex);
		}

		if (right < total - 1) {
			items.push("...");
		}

		items.push(total);
		return items;
	};

	const pageItems = getPageItems(page, totalPages);

	return (
		<div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
			<div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
				<div className="flex flex-col gap-5">
					<div className="rounded-2xl bg-white px-5 py-4 shadow-md dark:bg-zinc-900 sm:px-6">
						<h1 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50 sm:text-xl">
							所有單字
						</h1>
					<div className="rounded-2xl border border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
						<div className="mb-3 text-xs font-medium uppercase text-zinc-400">
							搜尋
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 shadow-sm transition focus-within:border-zinc-200 focus-within:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
								<span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
									以英文搜尋
								</span>
								<input
									className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
									placeholder="輸入英文單字"
									value={englishQuery}
									onChange={(event) => setEnglishQuery(event.target.value)}
								/>
							</label>
							<label className="flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 shadow-sm transition focus-within:border-zinc-200 focus-within:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
								<span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
									以中文搜尋
								</span>
								<input
									className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
									placeholder="輸入中文意思"
									value={chineseQuery}
									onChange={(event) => setChineseQuery(event.target.value)}
								/>
							</label>
						</div>
						<div className="mt-4 grid gap-3 sm:grid-cols-3">
							<div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
								<div className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
									重要程度
								</div>
								<div className="flex flex-wrap gap-2">
									{importanceOptions.map((value) => {
										const checked = selectedImportance.includes(value);
										return (
											<label
												key={`importance-${value}`}
												className={getChipClasses(checked, "amber")}
											>
												<input
													type="checkbox"
													className="sr-only"
													checked={checked}
													onChange={() =>
														toggleNumberSelection(setSelectedImportance, value)
													}
												/>
												<span
													className={`inline-block h-2.5 w-2.5 rounded-full transition ${
														checked
															? "bg-current"
															: "bg-zinc-300 group-hover:bg-zinc-400 dark:bg-zinc-600"
													}`}
												/>
												<span>{value} 級</span>
											</label>
										);
									})}
								</div>
							</div>

							<div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
								<div className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
									學習等級
								</div>
								<div className="flex flex-wrap gap-2">
									{proficiencyOptions.map((value) => {
										const checked = selectedProficiency.includes(value);
										return (
											<label
												key={`proficiency-${value}`}
												className={getChipClasses(checked, "emerald")}
											>
												<input
													type="checkbox"
													className="sr-only"
													checked={checked}
													onChange={() =>
														toggleNumberSelection(setSelectedProficiency, value)
													}
												/>
												<span
													className={`inline-block h-2.5 w-2.5 rounded-full transition ${
														checked
															? "bg-current"
															: "bg-zinc-300 group-hover:bg-zinc-400 dark:bg-zinc-600"
													}`}
												/>
												<span>Lv.{value}</span>
											</label>
										);
									})}
								</div>
							</div>

							<div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
								<div className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
									詞性
								</div>
								<div className="flex flex-wrap gap-2">
									{posOptions.map((value) => {
										const checked = selectedPos.includes(value);
										return (
											<label
												key={`pos-${value}`}
												className={getChipClasses(checked, "sky")}
											>
												<input
													type="checkbox"
													className="sr-only"
													checked={checked}
													onChange={() =>
														toggleStringSelection(setSelectedPos, value)
													}
												/>
												<span
													className={`inline-block h-2.5 w-2.5 rounded-full transition ${
														checked
															? "bg-current"
															: "bg-zinc-300 group-hover:bg-zinc-400 dark:bg-zinc-600"
													}`}
												/>
												<span>{value}</span>
											</label>
										);
									})}
								</div>
							</div>
						</div>
						{isFiltering && (
							<div className="mt-3">
								<button
									className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300"
									onClick={() => {
										setEnglishQuery("");
										setChineseQuery("");
										setSelectedImportance([]);
										setSelectedProficiency([]);
										setSelectedPos([]);
									}}
									type="button"
								>
									清除所有篩選
								</button>
							</div>
						)}
					</div>
					{error && (
						<p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
					)}
					<div className="mt-3 flex flex-col items-start gap-1 text-xs text-zinc-500 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
						<span>{isFiltering ? `搜尋結果 ${filteredWords.length} 筆` : "每頁 20 筆"}</span>
						<span>
							第 {page} / {totalPages} 頁
						</span>
					</div>
				</div>

				{isLoading && (
					<div className="mx-auto w-full max-w-4xl rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
						載入中...
					</div>
				)}
				{!isLoading && visibleWords.length > 0 && (
					<div className="flex flex-col items-center gap-6">
						{visibleWords.map((entry) => (
							<VocabularyCard
								key={entry.id || entry._id}
								word={entry.word ?? "(no word)"}
								phonetic={undefined}
								source={entry.source}
								createdDate={entry.created_date}
								proficiency={entry.proficiency}
								importance={entry.importance}
								memorize={entry.memorize}
								senses={entry.senses}
								lastReviewDate={entry.last_review_date}
							/>
						))}
					</div>
				)}
				{!isLoading && sourceWords.length > 0 && filteredWords.length === 0 && (
					<div className="mx-auto w-full max-w-4xl rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
						沒有符合的結果，請調整搜尋條件。
					</div>
				)}
				{!isLoading && sourceWords.length === 0 && !error && (
					<div className="mx-auto w-full max-w-4xl rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
						目前沒有單字資料。
					</div>
				)}

				<div className="overflow-x-auto pb-1">
					<div className="flex min-w-max items-center justify-center gap-2 pt-2">
					<button
						className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
						onClick={handlePrevPage}
						disabled={page <= 1 || isLoading}
					>
						上一頁
					</button>
					{pageItems.map((item, index) => {
						if (item === "...") {
							return (
								<span
									key={`ellipsis-${index}`}
									className="px-2 text-sm text-zinc-400 dark:text-zinc-500"
								>
									...
								</span>
							);
						}

						const isActive = item === page;
						return (
							<button
								key={`page-${item}`}
								className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
									isActive
										? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
										: "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
								}`}
								onClick={() => setPage(item as number)}
								disabled={isLoading}
								aria-current={isActive ? "page" : undefined}
							>
								{item}
							</button>
						);
					})}
					<button
						className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
						onClick={handleNextPage}
						disabled={page >= totalPages || isLoading}
					>
						下一頁
					</button>
					</div>
				</div>
			</div>
		</div>
		</div>
	);
}
