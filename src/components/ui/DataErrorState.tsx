/** Shown when bundled data fails schema validation, instead of a blank or broken page. */
export function DataErrorState({ issues }: { issues: readonly string[] }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-3 bg-atlas-backdrop p-6 text-[var(--ui-text)]">
      <h1 className="text-lg font-semibold">資料載入失敗</h1>
      <p className="text-sm text-[var(--ui-muted)]">
        新聞資料未通過格式驗證，為避免顯示錯誤或未經標示的內容，地圖暫不顯示。請修正下列問題後重新建置：
      </p>
      <ul className="list-disc pl-5 font-mono text-xs break-words">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </main>
  );
}
