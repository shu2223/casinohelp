import { NextResponse } from "next/server"

// 与 Rust server 层保持一致的校验规则与错误信息。
export class ApiError extends Error {}

export function errorResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 422 })
}

export function validateProbability(value: number) {
  if (!(Number.isFinite(value) && value >= 0 && value < 1)) {
    throw new ApiError("胜率必须在 0 和 1 之间")
  }
}

export function validateProbabilityForIndex(value: number, index: number) {
  if (!(Number.isFinite(value) && value >= 0 && value < 1)) {
    throw new ApiError(`第 ${index + 1} 场胜率必须在 0 和 1 之间`)
  }
}

export function validateOdds(value: number) {
  if (!(Number.isFinite(value) && value > 1)) {
    throw new ApiError("小数赔率必须大于 1")
  }
}

export function validateOddsForIndex(value: number, index: number) {
  if (!(Number.isFinite(value) && value > 1)) {
    throw new ApiError(`第 ${index + 1} 场小数赔率必须大于 1`)
  }
}

export function validatePositiveAmount(value: number, name: string) {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new ApiError(`${name}必须大于 0`)
  }
}

export function validateFraction(value: number) {
  if (!(Number.isFinite(value) && value > 0 && value <= 1)) {
    throw new ApiError("凯利分数必须大于 0 且不超过 1")
  }
}
