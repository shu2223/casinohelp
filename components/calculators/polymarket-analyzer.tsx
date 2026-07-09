"use client"

import { useState } from "react"
import type {
  PolymarketAnalyzeResponse,
  PolymarketEstimateResponse,
  PolymarketMarket,
  PolymarketMarketsResponse,
} from "@/lib/types"
import { formatNumber, formatPercent, getApi, postApi } from "@/lib/api"
import {
  ErrorText,
  Field,
  NumberInput,
  Select,
  Stat,
  VerdictBanner,
} from "@/components/ui/primitives"

type ProbabilitySource = "manual" | "ai"
type ProbabilityMap = Record<string, string>
type EstimateMap = Record<string, PolymarketEstimateResponse>

const CATEGORIES = [
  { value: "all", label: "全部热门" },
  { value: "sports", label: "体育" },
  { value: "politics", label: "政治" },
  { value: "crypto", label: "加密" },
  { value: "business", label: "商业/金融" },
  { value: "culture", label: "文化娱乐" },
  { value: "weather", label: "天气" },
  { value: "science", label: "科学/太空" },
]

function probabilityKey(marketId: string, outcomeIndex: number) {
  return `${marketId}:${outcomeIndex}`
}

export function PolymarketAnalyzer() {
  const [category, setCategory] = useState("all")
  const [limit, setLimit] = useState("10")
  const [bankroll, setBankroll] = useState("1000")
  const [fraction, setFraction] = useState("0.5")
  const [source, setSource] = useState<ProbabilitySource>("manual")
  const [markets, setMarkets] = useState<PolymarketMarket[]>([])
  const [probabilities, setProbabilities] = useState<ProbabilityMap>({})
  const [estimates, setEstimates] = useState<EstimateMap>({})
  const [loadingMarkets, setLoadingMarkets] = useState(false)
  const [estimatingId, setEstimatingId] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<PolymarketAnalyzeResponse | null>(null)

  function updateProbability(marketId: string, outcomeIndex: number, value: string) {
    setProbabilities((prev) => ({
      ...prev,
      [probabilityKey(marketId, outcomeIndex)]: value,
    }))
  }

  async function loadMarkets() {
    setLoadingMarkets(true)
    setError("")
    setResult(null)
    try {
      const params = new URLSearchParams({ category, limit })
      const data = await getApi<PolymarketMarketsResponse>(
        `/api/polymarket/markets?${params.toString()}`,
      )
      setMarkets(data.markets)
      setProbabilities((prev) => {
        const next: ProbabilityMap = {}
        for (const market of data.markets) {
          market.outcomes.forEach((_, index) => {
            const key = probabilityKey(market.id, index)
            next[key] = prev[key] ?? ""
          })
        }
        return next
      })
    } catch (err) {
      setMarkets([])
      setError(err instanceof Error ? err.message : "盘口抓取失败")
    } finally {
      setLoadingMarkets(false)
    }
  }

  async function estimateMarket(market: PolymarketMarket) {
    setEstimatingId(market.id)
    setError("")
    try {
      const data = await postApi<PolymarketEstimateResponse>("/api/polymarket/estimate", {
        question: market.question,
        outcomes: market.outcomes,
        context: market.description,
      })
      setEstimates((prev) => ({ ...prev, [market.id]: data }))
      setProbabilities((prev) => {
        const next = { ...prev }
        data.outcomes.forEach((outcome, index) => {
          next[probabilityKey(market.id, index)] = String(Number(outcome.p.toFixed(4)))
        })
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 估算失败")
    } finally {
      setEstimatingId(null)
    }
  }

  async function estimateAll() {
    for (const market of markets) {
      await estimateMarket(market)
    }
  }

  async function analyze() {
    setAnalyzing(true)
    setError("")
    try {
      const items = markets.flatMap((market) =>
        market.outcomes.map((outcome, index) => {
          const p = Number(probabilities[probabilityKey(market.id, index)])
          return {
            label: `${market.question} - ${outcome}`,
            odds: market.decimal_odds[index],
            p,
          }
        }),
      )
      const validItems = items.filter(
        (item) =>
          Number.isFinite(item.odds) &&
          item.odds > 1 &&
          Number.isFinite(item.p) &&
          item.p > 0 &&
          item.p < 1,
      )
      if (validItems.length === 0) {
        throw new Error("请先为至少一个结果填写 0 到 1 之间的独立胜率")
      }
      const data = await postApi<PolymarketAnalyzeResponse>("/api/polymarket/analyze", {
        items: validItems,
        bankroll: Number(bankroll),
        fraction: Number(fraction),
      })
      setResult(data)
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : "分析失败")
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-[1fr_0.6fr_0.8fr_0.8fr]">
          <Field label="类别" htmlFor="polymarket-category">
            <Select
              id="polymarket-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="数量" htmlFor="polymarket-limit">
            <NumberInput
              id="polymarket-limit"
              min="1"
              max="50"
              step="1"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </Field>
          <Field label="本金" htmlFor="polymarket-bankroll">
            <NumberInput
              id="polymarket-bankroll"
              step="1"
              value={bankroll}
              onChange={(event) => setBankroll(event.target.value)}
            />
          </Field>
          <Field label="凯利分数" htmlFor="polymarket-fraction">
            <Select
              id="polymarket-fraction"
              value={fraction}
              onChange={(event) => setFraction(event.target.value)}
            >
              <option value="1">全凯利（1）</option>
              <option value="0.5">半凯利（0.5）</option>
              <option value="0.25">四分之一凯利（0.25）</option>
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadMarkets}
            disabled={loadingMarkets}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loadingMarkets ? "抓取中…" : "刷新盘口"}
          </button>
          <div className="flex rounded-md border border-border p-1">
            {(["manual", "ai"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSource(value)}
                className={`h-8 rounded px-3 text-sm transition-colors ${
                  source === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {value === "manual" ? "手动" : "AI 估算"}
              </button>
            ))}
          </div>
          {source === "ai" ? (
            <button
              type="button"
              onClick={estimateAll}
              disabled={markets.length === 0 || estimatingId !== null}
              className="h-10 rounded-md border border-border px-4 text-sm text-foreground transition-colors hover:border-ring disabled:opacity-50"
            >
              {estimatingId ? "估算中…" : "AI 估算当前列表"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={analyze}
            disabled={analyzing || markets.length === 0}
            className="h-10 rounded-md border border-positive/60 px-4 text-sm font-medium text-positive transition-colors hover:bg-positive-muted/30 disabled:opacity-50"
          >
            {analyzing ? "分析中…" : "一键分析"}
          </button>
        </div>

        <p className="rounded-md border border-border bg-background/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Polymarket 价格代表市场共识，不应直接当作真实胜率；AI 估算仅用于初筛，提示词不会包含市场价。
        </p>

        {error ? <ErrorText message={error} /> : null}

        <div className="flex flex-col gap-3">
          {markets.length === 0 ? (
            <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              先刷新盘口，再填写独立胜率或使用 AI 估算
            </div>
          ) : (
            markets.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                source={source}
                probabilities={probabilities}
                estimate={estimates[market.id]}
                estimating={estimatingId === market.id}
                onProbabilityChange={updateProbability}
                onEstimate={() => estimateMarket(market)}
              />
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {result ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="候选项" value={result.ranked.length} />
              <Stat label="总建议注额" value={formatNumber(result.total_stake)} tone={result.total_stake > 0 ? "positive" : "negative"} />
            </div>
            <div className="flex flex-col gap-3">
              {result.ranked.map((item) => (
                <div key={`${item.rank}-${item.index}`} className="rounded-lg border border-border bg-background/40 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold leading-relaxed text-foreground">
                      #{item.rank} {item.label}
                    </h3>
                    <span
                      className={`shrink-0 rounded-md px-2 py-1 text-xs ${
                        item.should_bet
                          ? "bg-positive-muted/50 text-positive"
                          : "bg-negative-muted/50 text-negative"
                      }`}
                    >
                      {item.should_bet ? "可考虑" : "不该下"}
                    </span>
                  </div>
                  <VerdictBanner
                    positive={item.should_bet}
                    title={item.verdict}
                    detail={`edge：${formatNumber(item.edge, 4)}，EV：${formatNumber(item.ev)}`}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Stat label="建议注额" value={formatNumber(item.stake)} tone={item.should_bet ? "positive" : "negative"} />
                    <Stat label="凯利仓位" value={formatPercent(item.kelly_fraction)} />
                    <Stat label="自估胜率" value={formatPercent(item.p)} />
                    <Stat label="小数赔率" value={formatNumber(item.odds, 3)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-full min-h-52 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            分析后会按 edge 降序显示下注建议
          </div>
        )}
      </div>
    </div>
  )
}

function MarketCard({
  market,
  source,
  probabilities,
  estimate,
  estimating,
  onProbabilityChange,
  onEstimate,
}: {
  market: PolymarketMarket
  source: ProbabilitySource
  probabilities: ProbabilityMap
  estimate?: PolymarketEstimateResponse
  estimating: boolean
  onProbabilityChange: (marketId: string, outcomeIndex: number, value: string) => void
  onEstimate: () => void
}) {
  return (
    <article className="rounded-lg border border-border bg-background/40 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold leading-relaxed text-foreground">{market.question}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              到期 {market.end_date ? new Date(market.end_date).toLocaleString("zh-CN") : "-"} · 成交量{" "}
              {formatNumber(market.volume, 0)} · 流动性 {formatNumber(market.liquidity, 0)}
            </p>
          </div>
          {source === "ai" ? (
            <button
              type="button"
              onClick={onEstimate}
              disabled={estimating}
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-ring disabled:opacity-50"
            >
              {estimating ? "估算中…" : "AI 估算"}
            </button>
          ) : null}
        </div>

        <div className="grid gap-2">
          {market.outcomes.map((outcome, index) => {
            const key = probabilityKey(market.id, index)
            const reason = estimate?.outcomes[index]?.reason
            return (
              <div
                key={key}
                className="grid gap-2 rounded-md border border-border bg-card/50 p-3 md:grid-cols-[1fr_0.7fr_0.7fr_0.9fr] md:items-start"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">{outcome}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    价格 {formatPercent(market.prices[index], 1)} · 去水 {formatPercent(market.fair_probabilities[index], 1)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="block">小数赔率</span>
                  <span className="font-mono text-sm text-foreground">
                    {formatNumber(market.decimal_odds[index], 3)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="block">价差</span>
                  <span className="font-mono text-sm text-foreground">
                    {market.spread === undefined ? "-" : formatPercent(market.spread, 2)}
                  </span>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    {source === "manual" ? "手动胜率" : "AI/可编辑胜率"}
                  </label>
                  <NumberInput
                    step="0.01"
                    min="0.0001"
                    max="0.9999"
                    value={probabilities[key] ?? ""}
                    onChange={(event) => onProbabilityChange(market.id, index, event.target.value)}
                    placeholder="0~1"
                    className="h-9 text-sm"
                  />
                </div>
                {reason ? (
                  <p className="md:col-span-4 text-xs leading-relaxed text-muted-foreground">
                    {reason}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>

        {estimate ? (
          <p className="text-xs text-muted-foreground">
            {estimate.model} · 置信度 {formatPercent(estimate.confidence, 0)}
          </p>
        ) : null}
      </div>
    </article>
  )
}
