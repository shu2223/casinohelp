// Rust 后端（crates/server）各 /api/* 接口的响应类型。
// 这里只有类型声明，没有任何计算逻辑——所有计算由 Rust 后端完成，
// Next 通过 next.config.mjs 的 rewrites 把 /api/* 代理过去。

export type BetInput = { odds: number; p: number; label?: string }

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
  label: string
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
