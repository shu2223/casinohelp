"use client"

import { useState } from "react"
import type { OddsConversionResult, OddsFormat } from "@/lib/betting"
import { formatNumber, formatPercent, postApi } from "@/lib/api"
import {
  ErrorText,
  Field,
  NumberInput,
  Select,
  Stat,
  SubmitButton,
  TextInput,
} from "@/components/ui/primitives"

const FORMATS: { value: OddsFormat; label: string; placeholder: string }[] = [
  { value: "decimal", label: "小数盘", placeholder: "例如 2.5" },
  { value: "american", label: "美式盘", placeholder: "例如 150 或 -120" },
  { value: "hongkong", label: "香港盘", placeholder: "例如 1.5" },
  { value: "malay", label: "马来盘", placeholder: "例如 0.8 或 -0.6" },
  { value: "indonesian", label: "印尼盘", placeholder: "例如 1.5 或 -1.5" },
  { value: "fractional", label: "分数盘", placeholder: "例如 3/2" },
]

export function OddsConvertCalculator() {
  const [format, setFormat] = useState<OddsFormat>("decimal")
  const [value, setValue] = useState("2.5")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<OddsConversionResult | null>(null)

  const isFractional = format === "fractional"
  const placeholder = FORMATS.find((f) => f.value === format)?.placeholder ?? ""

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const payload = isFractional ? value : Number(value)
      const data = await postApi<OddsConversionResult>("/api/odds/convert", {
        value: payload,
        format,
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
        <Field label="输入格式" htmlFor="convert-format">
          <Select
            id="convert-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as OddsFormat)}
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="赔率数值"
          htmlFor="convert-value"
          hint={isFractional ? "分数盘请输入如 3/2 的格式" : placeholder}
        >
          {isFractional ? (
            <TextInput
              id="convert-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
            />
          ) : (
            <NumberInput
              id="convert-value"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
            />
          )}
        </Field>
        <SubmitButton loading={loading}>转换</SubmitButton>
        {error ? <ErrorText message={error} /> : null}
      </form>

      <div className="flex flex-col gap-4">
        {result ? (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="小数盘" value={formatNumber(result.decimal, 4)} />
            <Stat label="美式盘" value={formatNumber(result.american, 2)} />
            <Stat label="香港盘" value={formatNumber(result.hongkong, 4)} />
            <Stat label="马来盘" value={formatNumber(result.malay, 4)} />
            <Stat label="印尼盘" value={formatNumber(result.indonesian, 4)} />
            <Stat label="分数盘" value={result.fractional} />
            <div className="col-span-2">
              <Stat
                label="隐含概率"
                value={formatPercent(result.implied_probability)}
                tone="positive"
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            选择格式并输入赔率，一键换算全部盘口
          </div>
        )}
      </div>
    </div>
  )
}
