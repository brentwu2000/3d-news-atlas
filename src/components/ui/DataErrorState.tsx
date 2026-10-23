/** Shown when bundled data fails schema validation, instead of a blank or broken page. */
export function DataErrorState({ issues }: { issues: readonly string[] }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--scene-bg)] p-6">
      <div className="card max-w-2xl p-6">
        <p className="kicker">Data error</p>
        <h1 className="display mt-2 text-[26px]">資料載入失敗</h1>
        <p className="mt-2 text-sm text-ink-2">新聞資料未通過格式驗證。為避免顯示錯誤或未經標示的內容，地圖暫不顯示。請修正下列問題後重新建置：</p>
        <ul className="mt-3 list-disc pl-5 font-mono text-xs break-words">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
