import { NextResponse } from "next/server"
import { calculateMultiKelly, type BetInput } from "@/lib/betting"
import {
  ApiError,
  errorResponse,
  validateFraction,
  validateOddsForIndex,
  validatePositiveAmount,
  validateProbabilityForIndex,
} from "@/lib/validate"

export async function POST(request: Request) {
  try {
    const { bets, bankroll, fraction } = await request.json()
    if (!Array.isArray(bets) || bets.length < 1 || bets.length > 10) {
      throw new ApiError("组合凯利注数必须在 1 到 10 之间")
    }
    validatePositiveAmount(bankroll, "本金")
    validateFraction(fraction)
    bets.forEach((bet: BetInput, index: number) => {
      validateOddsForIndex(bet.odds, index)
      validateProbabilityForIndex(bet.p, index)
    })

    return NextResponse.json(calculateMultiKelly(bets, bankroll, fraction))
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error.message)
    return errorResponse("请求格式不正确")
  }
}
