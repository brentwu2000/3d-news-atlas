"use client";

import { useAtlasStore } from "@/store/atlas-store";

/*
 * Search box + category chips. Both feed the same filter state, which
 * applies to the list, the 3D markers and the timeline alike.
 */

export function SearchField({ className = "" }: { className?: string }) {
  const query = useAtlasStore((s) => s.filters.query);
  const setQuery = useAtlasStore((s) => s.setQuery);
  return (
    <div className={className}>
      <label htmlFor="atlas-search" className="sr-only">
        搜尋事件（標題、摘要、標籤）
      </label>
      <input
        id="atlas-search"
        type="search"
        value={query}
        maxLength={100}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋標題、摘要或標籤…"
        autoComplete="off"
        className="ui-input w-full"
      />
    </div>
  );
}

export function CategoryChips({ categories, className = "" }: { categories: readonly string[]; className?: string }) {
  const selected = useAtlasStore((s) => s.filters.categories);
  const toggleCategory = useAtlasStore((s) => s.toggleCategory);
  return (
    <div role="group" aria-label="依分類篩選" className={`-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 ${className}`}>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={selected.includes(category)}
          onClick={() => toggleCategory(category)}
          className="ui-chip"
        >
          {category}
        </button>
      ))}
    </div>
  );
}
