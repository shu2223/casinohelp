"use client"

import { useState } from "react"
import type { VigResult } from "@/lib/types"
import { formatNumber, formatPercent, postApi } from "@/lib/api"
import { ErrorText, NumberInput, Stat, SubmitButton, TextInput } from "@/components/ui/primitives"

type Outcome = { label: string; odds: string }

const INITIAL_ROWS: Outcome[] = [
  { label: "主胜", odds: "2.10" },
  { label: "平局", odds: "3.40" },
  { label: "客胜", odds: "3.60" },
]

export function VigCalculator() {
  const [rows, setRows] = useState<Outcome[]>(INITIAL_ROWS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<VigResult | null>(null)

  function updateRow(index: number, key: keyof Outcome, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  function addRow() {
    setRows((prev) => [...prev, { label: `结果${prev.length + 1}`, odds: "" }])
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const data = await postApi<VigResult>("/api/vig", {
        odds: rows.map((row) => Number(row.odds)),
        labels: rows.map((row) => row.label),
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
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">结果数量：{rows.length}</span>
          <button
            type="button"
            onClick={addRow}
            className="h-9 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:border-ring"
          >
            + 新增结果
          </button>
        </div>

        {rows.map((row, index) => (
          <div key={index} className="flex items-end gap-2 rounded-lg border border-border bg-background/40 p-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">结果名称</label>
              <TextInput value={row.label} onChange={(e) => updateRow(index, "label", e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">小数赔率</label>
              <NumberInput
                step="0.01"
                value={row.odds}
                onChange={(e) => updateRow(index, "odds", e.target.value)}
              />
            </div>
            <button
              type="button"
              aria-label={`删除第 ${index + 1} 个结果`}
              title="删除结果"
              onClick={() => removeRow(index)}
              disabled={rows.length <= 2}
              className="h-11 w-11 shrink-0 rounded-md border border-border text-lg text-muted-foreground transition-colors hover:border-negative hover:text-negative disabled:cursor-not-allowed disabled:opacity-40"
            >
              ×
            </button>
          </div>
        ))}

        <SubmitButton loading={loading}>剥离抽水</SubmitButton>
        {error ? <ErrorText message={error} /> : null}
      </form>

      <div className="flex flex-col gap-4">
        {result ? (
          <>
            <Stat label="抽水率（overround）" value={result.overround_percent} tone="negative" />
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">结果</th>
                    <th className="px-3 py-2 text-right font-medium">隐含概率</th>
                    <th className="px-3 py-2 text-right font-medium">真实概率</th>
                    <th className="px-3 py-2 text-right font-medium">公平赔率</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {result.outcomes.map((o, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 font-sans">{o.label}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatPercent(o.implied)}</td>
                      <td className="px-3 py-2 text-right text-positive">{formatPercent(o.true_probability)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(o.fair_odds, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.note ? (
              <p className="rounded-md border border-accent/40 bg-muted px-3 py-2 text-sm text-accent">
                {result.note}
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            输入一场比赛全部结果的赔率，剥离庄家抽水
          </div>
        )}
      </div>
    </div>
  )
}
