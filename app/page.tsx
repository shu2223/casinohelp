import { BettingTool } from "@/components/betting-tool"

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-6 md:py-12">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 font-mono text-lg font-bold text-primary">
            λ
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">博彩决策助手</h1>
            <p className="text-sm text-muted-foreground">凯利公式 · 期望值 · 赔率数学</p>
          </div>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
          手动输入赔率与你自己估计的胜率，用凯利公式等方法回答两个问题：
          <span className="text-foreground">这注该不该下？该下多少？</span>
          所有计算在本地完成，不联网、不抓取数据、不存储任何记录。
        </p>
      </header>

      <BettingTool />

      <footer className="mt-auto rounded-lg border border-border bg-card px-4 py-4">
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
          凯利公式的一切结论都建立在你对胜率的估计准确之上。本工具仅为数学计算，不构成任何投注建议。请设定止损、量力而行。
        </p>
      </footer>
    </main>
  )
}
