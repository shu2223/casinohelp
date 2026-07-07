"use client"

import { useState } from "react"
import { KellyCalculator } from "@/components/calculators/kelly-calculator"
import { MultiKellyCalculator } from "@/components/calculators/multi-kelly-calculator"
import { OddsConvertCalculator } from "@/components/calculators/odds-convert-calculator"
import { VigCalculator } from "@/components/calculators/vig-calculator"
import { EvCalculator } from "@/components/calculators/ev-calculator"

const TABS = [
  { id: "kelly", label: "凯利计算", desc: "该不该下？下多少？" },
  { id: "multi", label: "组合凯利", desc: "多场独立比赛联合优化" },
  { id: "convert", label: "赔率转换", desc: "六种盘口互转与隐含概率" },
  { id: "vig", label: "去水计算", desc: "剥离庄家抽水看真实概率" },
  { id: "ev", label: "期望值", desc: "EV、回报率与长期波动" },
] as const

type TabId = (typeof TABS)[number]["id"]

export function BettingTool() {
  const [active, setActive] = useState<TabId>("kelly")
  const activeTab = TABS.find((tab) => tab.id === active)!

  return (
    <div className="flex flex-col gap-6">
      <nav
        className="flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="计算器"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              className={`shrink-0 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-ring hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      <section className="rounded-xl border border-border bg-card p-5 md:p-6">
        <header className="mb-5 border-b border-border pb-4">
          <h2 className="text-lg font-semibold text-foreground">{activeTab.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeTab.desc}</p>
        </header>

        {active === "kelly" && <KellyCalculator />}
        {active === "multi" && <MultiKellyCalculator />}
        {active === "convert" && <OddsConvertCalculator />}
        {active === "vig" && <VigCalculator />}
        {active === "ev" && <EvCalculator />}
      </section>
    </div>
  )
}
