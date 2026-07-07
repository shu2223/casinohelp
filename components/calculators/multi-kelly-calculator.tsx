"use client"

import { useState } from "react"
import type { MultiKellyResult } from "@/lib/betting"
import { formatNumber, formatPercent, postApi } from "@/lib/api"
import {
  ErrorText,
  Field,
  NumberInput,
  Select,
  Stat,
  SubmitButton,
} from "@/components/ui/primitives"

type Row = { odds: string; p: string }

const DEFAULT_ROWS: Row[] = [
  { odds: "2.5", p: "0.5" },
  { odds: "2.1", p: "0.55" },
]

export function MultiKellyCalculator() {
  const [rows, setRows] = useState<Row[]>(DEFAULT_ROWS)
  const [bankroll, setBankroll] = useState("1000")
  const [fraction, setFraction] = useState("1")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<MultiKellyResult | null>(null)

  function updateRow(index: number, key: keyof Row, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  function addRow() {
    if (rows.length >= 10) return
    setRows((prev) => [...prev, { odds: "", p: "" }])
  }

  function removeRow(index: number) {
    if (rows.length <= 2) return
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const data = await postApi<MultiKellyResult>("/api/kelly/multi", {
        bets: rows.map((row) => ({ odds: Number(row.odds), p: Number(row.p) })),
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
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">比赛列表（2~10 场，相互独立）</span>
            <button
              type="button"
              onClick={addRow}
              disabled={rows.length >= 10}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:border-ring disabled:opacity-50"
            >
              + 添加一场
            </button>
          </div>
          {rows.map((row, index) => (
            <div key={index} className="flex items-end gap-2 rounded-lg border border-border bg-background/40 p-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-muted-foreground">第 {index + 1} 场赔率</label>
                <NumberInput
                  step="0.01"
                  value={row.odds}
                  onChange={(e) => updateRow(index, "odds", e.target.value)}
                  placeholder="赔率"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-muted-foreground">胜率</label>
                <NumberInput
                  step="0.01"
                  value={row.p}
                  onChange={(e) => updateRow(index, "p", e.target.value)}
                  placeholder="0~1"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(index)}
                disabled={rows.length <= 2}
                aria-label={`删除第 ${index + 1} 场`}
                className="h-11 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-negative hover:text-negative disabled:opacity-40"
              >
                删除
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="本金" htmlFor="multi-bankroll">
            <NumberInput
              id="multi-bankroll"
              step="1"
              value={bankroll}
              onChange={(e) => setBankroll(e.target.value)}
            />
          </Field>
          <Field label="凯利分数" htmlFor="multi-fraction">
            <Select id="multi-fraction" value={fraction} onChange={(e) => setFraction(e.target.value)}>
              <option value="1">全凯利（1）</option>
              <option value="0.5">半凯利（0.5）</option>
              <option value="0.25">四分之一凯利（0.25）</option>
            </Select>
          </Field>
        </div>

        <SubmitButton loading={loading}>联合优化仓位</SubmitButton>
        {error ? <ErrorText message={error} /> : null}
      </form>

      <div className="flex flex-col gap-4">
        {result ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="总仓位" value={formatPercent(result.total_fraction)} tone="positive" />
              <Stat label="总注额" value={formatNumber(result.total_stake)} tone="positive" />
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">场次</th>
                    <th className="px-3 py-2 text-right font-medium">联合仓位</th>
                    <th className="px-3 py-2 text-right font-medium">单注凯利</th>
                    <th className="px-3 py-2 text-right font-medium">建议注额</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {result.allocations.map((a) => (
                    <tr key={a.index} className="border-t border-border">
                      <td className="px-3 py-2 font-sans">第 {a.index + 1} 场</td>
                      <td className="px-3 py-2 text-right text-positive">{formatPercent(a.kelly_fraction)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatPercent(a.naive_kelly)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(a.stake)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{result.note}</p>
          </>
        ) : (
          <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            填入多场独立比赛，做联合凯利优化
          </div>
        )}
      </div>
    </div>
  )
}
