"use client"

import { useState } from "react"
import type { KellyResult } from "@/lib/betting"
import { formatNumber, formatPercent, postApi } from "@/lib/api"
import {
  ErrorText,
  Field,
  NumberInput,
  Select,
  Stat,
  SubmitButton,
  VerdictBanner,
} from "@/components/ui/primitives"

export function KellyCalculator() {
  const [odds, setOdds] = useState("2.5")
  const [p, setP] = useState("0.5")
  const [bankroll, setBankroll] = useState("1000")
  const [fraction, setFraction] = useState("0.5")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<KellyResult | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const data = await postApi<KellyResult>("/api/kelly", {
        odds: Number(odds),
        p: Number(p),
        bankroll: Number(bankroll),
        fraction: Number(fraction),
      })
      setResult(data)
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : "计算失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="小数赔率" htmlFor="kelly-odds" hint="例如 2.5，必须大于 1">
          <NumberInput
            id="kelly-odds"
            step="0.01"
            value={odds}
            onChange={(e) => setOdds(e.target.value)}
          />
        </Field>
        <Field label="自估胜率" htmlFor="kelly-p" hint="0 到 1 之间，例如 0.5 表示 50%">
          <NumberInput
            id="kelly-p"
            step="0.01"
            value={p}
            onChange={(e) => setP(e.target.value)}
          />
        </Field>
        <Field label="本金" htmlFor="kelly-bankroll" hint="可用资金总额">
          <NumberInput
            id="kelly-bankroll"
            step="1"
            value={bankroll}
            onChange={(e) => setBankroll(e.target.value)}
          />
        </Field>
        <Field label="凯利分数" htmlFor="kelly-fraction" hint="分数凯利可大幅降低破产风险">
          <Select
            id="kelly-fraction"
            value={fraction}
            onChange={(e) => setFraction(e.target.value)}
          >
            <option value="1">全凯利（1）</option>
            <option value="0.5">半凯利（0.5）</option>
            <option value="0.25">四分之一凯利（0.25）</option>
          </Select>
        </Field>
        <SubmitButton loading={loading}>计算仓位</SubmitButton>
        {error ? <ErrorText message={error} /> : null}
      </form>

      <div className="flex flex-col gap-4">
        {result ? (
          <>
            <VerdictBanner
              positive={result.should_bet}
              title={result.verdict}
              detail={`每 1 元注的期望净收益（edge）：${formatNumber(result.edge, 4)}`}
            />
            <div className="grid grid-cols-2 gap-3">
              <Stat label="建议注额" value={formatNumber(result.stake)} tone={result.should_bet ? "positive" : "negative"} />
              <Stat label="凯利仓位 f*" value={formatPercent(result.kelly_fraction)} />
              <Stat label="期望值 EV" value={formatNumber(result.ev)} tone={result.ev > 0 ? "positive" : undefined} />
              <Stat label="优势 edge" value={formatNumber(result.edge, 4)} />
            </div>
          </>
        ) : (
          <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            输入赔率与胜率，计算最优下注仓位
          </div>
        )}
      </div>
    </div>
  )
}
