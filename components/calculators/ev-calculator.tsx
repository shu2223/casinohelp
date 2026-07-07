"use client"

import { useState } from "react"
import type { EvResult } from "@/lib/types"
import { formatNumber, formatPercent, postApi } from "@/lib/api"
import {
  ErrorText,
  Field,
  NumberInput,
  Stat,
  SubmitButton,
  VerdictBanner,
} from "@/components/ui/primitives"

export function EvCalculator() {
  const [odds, setOdds] = useState("2.5")
  const [p, setP] = useState("0.45")
  const [stake, setStake] = useState("100")
  const [n, setN] = useState("100")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<EvResult | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const data = await postApi<EvResult>("/api/ev", {
        odds: Number(odds),
        p: Number(p),
        stake: Number(stake),
        n: n === "" ? undefined : Number(n),
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="小数赔率" htmlFor="ev-odds">
            <NumberInput id="ev-odds" step="0.01" value={odds} onChange={(e) => setOdds(e.target.value)} />
          </Field>
          <Field label="自估胜率" htmlFor="ev-p">
            <NumberInput id="ev-p" step="0.01" value={p} onChange={(e) => setP(e.target.value)} />
          </Field>
          <Field label="注额" htmlFor="ev-stake">
            <NumberInput id="ev-stake" step="1" value={stake} onChange={(e) => setStake(e.target.value)} />
          </Field>
          <Field label="长期注数 n" htmlFor="ev-n" hint="默认 100">
            <NumberInput id="ev-n" step="1" value={n} onChange={(e) => setN(e.target.value)} />
          </Field>
        </div>
        <SubmitButton loading={loading}>计算期望值</SubmitButton>
        {error ? <ErrorText message={error} /> : null}
      </form>

      <div className="flex flex-col gap-4">
        {result ? (
          <>
            <VerdictBanner
              positive={result.positive_ev}
              title={result.positive_ev ? "该注为正期望值" : "该注为负期望值"}
              detail={`单注期望回报率 ROI：${formatPercent(result.roi)}`}
            />
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="单注 EV"
                value={formatNumber(result.ev)}
                tone={result.positive_ev ? "positive" : "negative"}
              />
              <Stat label="ROI" value={formatPercent(result.roi)} />
              <Stat label="单注标准差" value={formatNumber(result.std_dev)} />
              <Stat label="长期注数" value={String(result.long_run.n)} />
              <Stat
                label={`${result.long_run.n} 注期望盈亏`}
                value={formatNumber(result.long_run.expected_profit)}
                tone={result.positive_ev ? "positive" : "negative"}
              />
              <Stat label="累计标准差" value={formatNumber(result.long_run.std_dev)} />
            </div>
          </>
        ) : (
          <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            评估一注的期望值、回报率与长期波动
          </div>
        )}
      </div>
    </div>
  )
}
