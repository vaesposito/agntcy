"use client";

import { useMemo, useState } from "react";
import { SquareArrowOutUpRight } from "lucide-react";

export type ArticleSource = "Technical Blog" | "Outshift Blog";

export type Article = {
  title: string;
  href: string;
  source: ArticleSource;
  date?: string;
  excerpt?: string;
};

type Filter = "All" | ArticleSource;

const FILTERS: Filter[] = ["All", "Technical Blog", "Outshift Blog"];

const SOURCE_BADGE: Record<ArticleSource, string> = {
  "Technical Blog":
    "border-[#187adc] bg-[#187adc]/10 text-[#5fb0f5]",
  "Outshift Blog": "border-[#fbaf45] bg-[#fbaf45]/10 text-[#fbaf45]",
};

const SOURCE_CTA: Record<ArticleSource, string> = {
  "Technical Blog": "Read on blogs.agntcy.org",
  "Outshift Blog": "Read on Outshift",
};

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const parts = iso.split("-");
  if (parts.length < 3) return null;
  const [y, m, d] = parts.map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return null;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

export function ArticleGrid({ articles }: { articles: Article[] }) {
  const [filter, setFilter] = useState<Filter>("All");

  const counts = useMemo(
    () => ({
      All: articles.length,
      "Technical Blog": articles.filter((a) => a.source === "Technical Blog")
        .length,
      "Outshift Blog": articles.filter((a) => a.source === "Outshift Blog")
        .length,
    }),
    [articles],
  );

  const visible = useMemo(() => {
    const filtered =
      filter === "All"
        ? articles
        : articles.filter((a) => a.source === filter);
    return [...filtered].sort((a, b) => {
      if (a.date && b.date) return a.date < b.date ? 1 : -1;
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });
  }, [articles, filter]);

  return (
    <div>
      <div
        role="group"
        aria-label="Filter articles by source"
        className="inline-flex flex-wrap gap-1.5 rounded-full border border-[#0d274d] bg-[#0d274d]/30 p-1.5 3xl:gap-2 3xl:p-2"
      >
        {FILTERS.map((f) => {
          const selected = filter === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(f)}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#187adc] focus-visible:ring-offset-2 focus-visible:ring-offset-[#00142b] 3xl:px-6 3xl:py-2.5 3xl:text-lg ${
                selected
                  ? "bg-[#187adc] text-white shadow-[0px_4px_16px_rgba(24,122,220,0.45)]"
                  : "text-[#e8e9ea]/70 hover:text-[#fbaf45]"
              }`}
            >
              {f}
              <span
                className={`ml-2 text-xs font-medium ${selected ? "text-white/80" : "text-[#e8e9ea]/40"} 3xl:text-sm`}
              >
                {counts[f]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 3xl:mt-10 3xl:gap-7">
        {visible.map((article) => {
          const date = formatDate(article.date);
          return (
            <a
              key={article.href}
              href={article.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex cursor-pointer flex-col rounded-[20px] border border-[#0d274d] bg-[#00142b] p-6 shadow-[0px_4px_30px_#0d274d] transition-all duration-300 hover:-translate-y-1 hover:border-[#187adc] hover:shadow-[0px_8px_50px_rgba(24,122,220,0.45)] 3xl:rounded-[28px] 3xl:p-8"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[20px] p-px opacity-0 transition-opacity duration-300 [background:linear-gradient(135deg,#187adc,#5fd3ff)] [-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [-webkit-mask-composite:xor] [mask-composite:exclude] group-hover:opacity-100 3xl:rounded-[28px]"
              />
              <SquareArrowOutUpRight
                aria-hidden
                className="absolute right-5 top-5 h-4 w-4 text-[#e8e9ea] opacity-0 transition-opacity duration-300 group-hover:opacity-100 3xl:right-6 3xl:top-6 3xl:h-5 3xl:w-5"
              />
              <div className="flex flex-wrap items-center gap-3 3xl:gap-4">
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold 3xl:text-sm ${SOURCE_BADGE[article.source]}`}
                >
                  {article.source}
                </span>
                {date ? (
                  <span className="text-xs text-[#e8e9ea]/60 3xl:text-sm">
                    {date}
                  </span>
                ) : (
                  <span className="text-xs text-[#e8e9ea]/40 3xl:text-sm">
                    {article.source === "Outshift Blog"
                      ? "Outshift"
                      : article.source}
                  </span>
                )}
              </div>
              <h3 className="mt-4 pr-6 text-base font-bold leading-snug text-[#e8e9ea] 3xl:mt-6 3xl:text-xl">
                {article.title}
              </h3>
              {article.excerpt && (
                <p className="mt-2.5 text-xs leading-relaxed text-[#e8e9ea]/85 3xl:mt-4 3xl:text-base">
                  {article.excerpt}
                </p>
              )}
              <span className="mt-auto pt-4 text-xs font-semibold text-[#187adc] transition-colors duration-200 group-hover:text-[#fbaf45] 3xl:pt-6 3xl:text-base">
                {SOURCE_CTA[article.source]}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
