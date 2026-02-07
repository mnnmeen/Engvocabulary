"use client";

import { useEffect, useState } from "react";
import { VocabularyCard } from "@/src/components/VocabularyCard";

type WordResponse = {
	_id: string;
	id: string;
	word: string;
	source?: string;
	created_date?: string;
	proficiency?: number;
	importance?: number;
	memorize?: string | boolean;
	examples?: string[];
	collocations?: {
		phrase?: string;
		meaning?: string;
		example?: string;
	}[];
	posandchinese?: { [pos: string]: string };
};

type WordListResponse = {
	items: WordResponse[];
	page: number;
	limit: number;
	total: number;
	total_pages: number;
};

export default function AllWordsPage() {
	const [error, setError] = useState<string | null>(null);
	const [words, setWords] = useState<WordResponse[]>([]);
	const [page, setPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [isLoading, setIsLoading] = useState(false);
	const [englishQuery, setEnglishQuery] = useState("");
	const [chineseQuery, setChineseQuery] = useState("");

	useEffect(() => {
		const fetchWords = async () => {
			try {
				setIsLoading(true);
				setError(null);
				const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
				const res = await fetch(`${baseUrl}/words?page=${page}&limit=20`);
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}
				const data: WordListResponse = await res.json();
				setWords(data.items ?? []);
				setTotalPages(data.total_pages ?? 1);
			} catch (err: any) {
				setError(err.message ?? "Unknown error");
				setWords([]);
				setTotalPages(1);
			} finally {
				setIsLoading(false);
			}
		};

		fetchWords();
	}, [page]);

	const normalizedEnglishQuery = englishQuery.trim().toLowerCase();
	const normalizedChineseQuery = chineseQuery.trim();

	const matchesEnglish = (value?: string) => {
		if (!normalizedEnglishQuery) return true;
		return (value ?? "").toLowerCase().includes(normalizedEnglishQuery);
	};

	const matchesChinese = (value?: string) => {
		if (!normalizedChineseQuery) return true;
		return (value ?? "").includes(normalizedChineseQuery);
	};

	const filteredWords = words.filter((entry) => {
		const passesEnglish = matchesEnglish(entry.word);
		const chineseValues = entry.posandchinese
			? Object.values(entry.posandchinese).join(" ")
			: "";
		const passesChinese = matchesChinese(chineseValues);
		return passesEnglish && passesChinese;
	});

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
		<div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
			<div className="flex flex-col gap-6">
				<div className="bg-white px-6 py-4 shadow-md dark:bg-zinc-900">
					<h1 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
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
					</div>
					{error && (
						<p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
					)}
					<div className="mt-3 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
						<span>每頁 20 筆</span>
						<span>
							第 {page} / {totalPages} 頁
						</span>
					</div>
				</div>

				{isLoading && (
					<div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
						載入中...
					</div>
				)}
				{!isLoading && filteredWords.length > 0 && (
					<div className="flex flex-col gap-6">
						{filteredWords.map((entry) => (
							<VocabularyCard
								key={entry.id || entry._id}
								word={entry.word ?? "(no word)"}
								phonetic={undefined}
								source={entry.source}
								createdDate={entry.created_date}
								proficiency={entry.proficiency}
								importance={entry.importance}
								memorize={entry.memorize}
								examples={entry.examples}
								collocations={entry.collocations}
								posAndChinese={entry.posandchinese}
							/>
						))}
					</div>
				)}
				{!isLoading && words.length > 0 && filteredWords.length === 0 && (
					<div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
						沒有符合的結果，請調整搜尋條件。
					</div>
				)}
				{!isLoading && words.length === 0 && !error && (
					<div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
						目前沒有單字資料。
					</div>
				)}

				<div className="flex flex-wrap items-center justify-center gap-2 pt-2">
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
	);
}
