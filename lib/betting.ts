// TypeScript 移植自 Rust `crates/core`，与后端计算逻辑保持一致。
// 所有公式在此实现，API 路由仅做 JSON 编解码、参数校验和错误包装。

const MULTI_MAX_TOTAL_FRACTION = 0.999

export type BetInput = { odds: number; p: number }

export type KellyResult = {
  edge: number
  kelly_fraction: number
  stake: number
  ev: number
  should_bet: boolean
  verdict: string
}

export type MultiKellyAllocation = {
  index: number
  kelly_fraction: number
  stake: number
  naive_kelly: number
}

export type MultiKellyResult = {
  allocations: MultiKellyAllocation[]
  total_fraction: number
  total_stake: number
  note: string
}

export type OddsFormat =
  | "decimal"
  | "american"
  | "hongkong"
  | "malay"
  | "indonesian"
  | "fractional"

export type OddsConversionResult = {
  decimal: number
  american: number
  hongkong: number
  malay: number
  indonesian: number
  fractional: string
  implied_probability: number
}

export type VigOutcome = {
  label: string
  implied: number
  true_probability: number
  fair_odds: number
}

export type VigResult = {
  overround: number
  overround_percent: string
  outcomes: VigOutcome[]
  note?: string
}

export type EvResult = {
  ev: number
  roi: number
  std_dev: number
  long_run: { n: number; expected_profit: number; std_dev: number }
  positive_ev: boolean
}

export class CalculationError extends Error {}

// ---------- 3.1 凯利 ----------
export function calculateKelly(
  odds: number,
  p: number,
  bankroll: number,
  fraction: number,
): KellyResult {
  const b = odds - 1
  const edge = b * p - (1 - p)
  const kelly_fraction = edge / b
  const should_bet = kelly_fraction > 0
  const stake = should_bet ? bankroll * kelly_fraction * fraction : 0
  const ev = edge * stake
  const verdict = should_bet
    ? `有优势，建议下注 ${stake.toFixed(2)}（${fractionLabel(fraction)}）`
    : "无优势，不该下"

  return { edge, kelly_fraction, stake, ev, should_bet, verdict }
}

// ---------- 3.2 组合凯利 ----------
export function calculateMultiKelly(
  bets: BetInput[],
  bankroll: number,
  fraction: number,
): MultiKellyResult {
  const naive = bets.map((bet) =>
    Math.max(calculateKelly(bet.odds, bet.p, bankroll, 1).kelly_fraction, 0),
  )
  const fractions = optimizeMultiKelly(bets, naive)

  const allocations: MultiKellyAllocation[] = fractions.map((kelly_fraction, index) => ({
    index,
    kelly_fraction,
    stake: bankroll * kelly_fraction * fraction,
    naive_kelly: naive[index],
  }))
  const total_fraction = fractions.reduce((sum, f) => sum + f, 0)
  const total_stake = allocations.reduce((sum, a) => sum + a.stake, 0)

  return {
    allocations,
    total_fraction,
    total_stake,
    note: "已做联合优化，总仓位低于逐场单注凯利之和",
  }
}

// ---------- 3.3 赔率格式互转 ----------
export function parseOddsFormat(format: string): OddsFormat {
  switch (format) {
    case "decimal":
    case "american":
    case "hongkong":
    case "malay":
    case "indonesian":
    case "fractional":
      return format
    default:
      throw new CalculationError("赔率格式不支持")
  }
}

export function convertOdds(
  format: OddsFormat,
  value: number | string,
): OddsConversionResult {
  let decimal: number

  switch (format) {
    case "decimal": {
      const v = numericValue(value)
      if (v <= 1) throw new CalculationError("小数赔率必须大于 1")
      decimal = v
      break
    }
    case "american": {
      const v = numericValue(value)
      if (Math.abs(v) < 100) throw new CalculationError("美式赔率绝对值必须不小于 100")
      decimal = v > 0 ? 1 + v / 100 : 1 + 100 / -v
      break
    }
    case "hongkong": {
      const v = numericValue(value)
      if (v <= 0) throw new CalculationError("香港盘赔率必须大于 0")
      decimal = v + 1
      break
    }
    case "malay": {
      const v = numericValue(value)
      if (v > 0) {
        if (v > 1) throw new CalculationError("马来盘正赔率必须不大于 1")
        decimal = v + 1
      } else if (v < 0) {
        decimal = 1 - 1 / v
      } else {
        throw new CalculationError("马来盘赔率不能为 0")
      }
      break
    }
    case "indonesian": {
      const v = numericValue(value)
      if (v > 0) {
        if (v < 1) throw new CalculationError("印尼盘正赔率必须不小于 1")
        decimal = v + 1
      } else if (v < 0) {
        decimal = 1 - 1 / v
      } else {
        throw new CalculationError("印尼盘赔率不能为 0")
      }
      break
    }
    case "fractional": {
      const text = String(value)
      const [numerator, denominator] = parseFraction(text)
      decimal = 1 + numerator / denominator
      break
    }
  }

  return convertDecimal(decimal)
}

// ---------- 3.4 去水计算 ----------
export function calculateVig(odds: number[], labels?: string[]): VigResult {
  const implied = odds.map((o) => 1 / o)
  const impliedSum = implied.reduce((sum, q) => sum + q, 0)
  const overround = impliedSum - 1
  const outcomes: VigOutcome[] = odds.map((_, index) => {
    const true_probability = implied[index] / impliedSum
    return {
      label: labels?.[index] ?? `结果${index + 1}`,
      implied: implied[index],
      true_probability,
      fair_odds: 1 / true_probability,
    }
  })

  const result: VigResult = {
    overround,
    overround_percent: `${(overround * 100).toFixed(2)}%`,
    outcomes,
  }
  if (impliedSum <= 1) result.note = "赔率组合存在套利空间"
  return result
}

// ---------- 3.5 期望值 ----------
export function calculateEv(
  odds: number,
  p: number,
  stake: number,
  n: number,
): EvResult {
  const ev = p * (odds - 1) * stake - (1 - p) * stake
  const roi = ev / stake
  const std_dev = stake * odds * Math.sqrt(p * (1 - p))

  return {
    ev,
    roi,
    std_dev,
    long_run: {
      n,
      expected_profit: n * ev,
      std_dev: std_dev * Math.sqrt(n),
    },
    positive_ev: ev > 0,
  }
}

// ---------- 内部工具 ----------
function optimizeMultiKelly(bets: BetInput[], naive: number[]): number[] {
  let fractions = projectSimplex([...naive], MULTI_MAX_TOTAL_FRACTION)
  let step = 1

  for (let iter = 0; iter < 10000; iter++) {
    const gradient = multiGradient(bets, fractions)
    const projected = projectSimplex(
      fractions.map((f, i) => f + gradient[i]),
      MULTI_MAX_TOTAL_FRACTION,
    )
    if (l2Distance(projected, fractions) < 1e-9) break

    const currentObjective = multiObjective(bets, fractions)
    let accepted = false
    let localStep = step

    for (let ls = 0; ls < 80; ls++) {
      const candidate = projectSimplex(
        fractions.map((f, i) => f + localStep * gradient[i]),
        MULTI_MAX_TOTAL_FRACTION,
      )
      const candidateObjective = multiObjective(bets, candidate)
      if (candidateObjective >= currentObjective - 1e-14) {
        const delta = l2Distance(candidate, fractions)
        fractions = candidate
        step = Math.min(localStep * 1.2, 64)
        accepted = true
        if (delta < 1e-12) return cleanFractions(fractions, naive)
        break
      }
      localStep *= 0.5
    }

    if (!accepted) break
  }

  return cleanFractions(fractions, naive)
}

function cleanFractions(fractions: number[], naive: number[]): number[] {
  return fractions.map((fraction, i) => {
    let f = fraction
    if (f < 1e-10 || naive[i] <= 0) f = 0
    if (f > naive[i] && f - naive[i] < 1e-8) f = naive[i]
    return f
  })
}

function multiObjective(bets: BetInput[], fractions: number[]): number {
  let objective = 0
  for (let mask = 0; mask < 1 << bets.length; mask++) {
    let probability = 1
    let wealth = 1
    bets.forEach((bet, index) => {
      const won = (mask & (1 << index)) !== 0
      probability *= won ? bet.p : 1 - bet.p
      const returnPerUnit = won ? bet.odds - 1 : -1
      wealth += fractions[index] * returnPerUnit
    })
    if (wealth <= 0) return Number.NEGATIVE_INFINITY
    objective += probability * Math.log(wealth)
  }
  return objective
}

function multiGradient(bets: BetInput[], fractions: number[]): number[] {
  const gradient = new Array(bets.length).fill(0)
  for (let mask = 0; mask < 1 << bets.length; mask++) {
    let probability = 1
    let wealth = 1
    const returns = new Array(bets.length).fill(0)
    bets.forEach((bet, index) => {
      const won = (mask & (1 << index)) !== 0
      probability *= won ? bet.p : 1 - bet.p
      returns[index] = won ? bet.odds - 1 : -1
      wealth += fractions[index] * returns[index]
    })
    for (let i = 0; i < gradient.length; i++) {
      gradient[i] += (probability * returns[i]) / wealth
    }
  }
  return gradient
}

function projectSimplex(values: number[], maxSum: number): number[] {
  const cleaned = values.map((v) => (!Number.isFinite(v) || v < 0 ? 0 : v))
  const sum = cleaned.reduce((s, v) => s + v, 0)
  if (sum <= maxSum) return cleaned

  const sorted = [...cleaned].sort((a, b) => b - a)
  let runningSum = 0
  let theta = 0
  for (let index = 0; index < sorted.length; index++) {
    runningSum += sorted[index]
    const candidateTheta = (runningSum - maxSum) / (index + 1)
    const nextValue = index + 1 < sorted.length ? sorted[index + 1] : Number.NEGATIVE_INFINITY
    if (nextValue <= candidateTheta) {
      theta = candidateTheta
      break
    }
  }

  return cleaned.map((value) => Math.max(value - theta, 0))
}

function convertDecimal(decimal: number): OddsConversionResult {
  return {
    decimal,
    american: decimal >= 2 ? 100 * (decimal - 1) : -100 / (decimal - 1),
    hongkong: decimal - 1,
    malay: decimal <= 2 ? decimal - 1 : -1 / (decimal - 1),
    indonesian: decimal >= 2 ? decimal - 1 : -1 / (decimal - 1),
    fractional: bestFraction(decimal - 1),
    implied_probability: 1 / decimal,
  }
}

function numericValue(value: number | string): number {
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value
    throw new CalculationError("赔率数值必须是有限数字")
  }
  const parsed = Number(value)
  if (value.trim() === "" || Number.isNaN(parsed)) {
    throw new CalculationError("赔率数值格式不正确")
  }
  return parsed
}

function parseFraction(value: string): [number, number] {
  const parts = value.trim().split("/")
  if (parts.length !== 2) throw new CalculationError("分数盘格式必须类似 3/2")
  const numerator = Number(parts[0].trim())
  const denominator = Number(parts[1].trim())
  if (!Number.isInteger(numerator) || numerator < 0)
    throw new CalculationError("分数盘分子必须是正整数")
  if (!Number.isInteger(denominator) || denominator < 0)
    throw new CalculationError("分数盘分母必须是正整数")
  if (numerator === 0 || denominator === 0)
    throw new CalculationError("分数盘分子和分母必须大于 0")
  return [numerator, denominator]
}

function bestFraction(value: number): string {
  let bestNumerator = 1
  let bestDenominator = 1
  let bestError = Number.POSITIVE_INFINITY

  for (let denominator = 1; denominator <= 100; denominator++) {
    const numerator = Math.max(Math.round(value * denominator), 1)
    const approximation = numerator / denominator
    const error = Math.abs(approximation - value)
    if (error < bestError) {
      bestError = error
      bestNumerator = numerator
      bestDenominator = denominator
    }
  }

  const divisor = gcd(bestNumerator, bestDenominator)
  return `${bestNumerator / divisor}/${bestDenominator / divisor}`
}

function gcd(a: number, b: number): number {
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

function fractionLabel(fraction: number): string {
  if (Math.abs(fraction - 1) < 1e-12) return "全凯利"
  if (Math.abs(fraction - 0.5) < 1e-12) return "半凯利"
  if (Math.abs(fraction - 0.25) < 1e-12) return "四分之一凯利"
  return "分数凯利"
}

function l2Distance(left: number[], right: number[]): number {
  return Math.sqrt(left.reduce((sum, l, i) => sum + (l - right[i]) ** 2, 0))
}
