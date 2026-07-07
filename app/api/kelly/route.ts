import { NextResponse } from "next/server"
import { calculateKelly } from "@/lib/betting"
import {
  ApiError,
  errorResponse,
  validateFraction,
  validateOdds,
  validatePositiveAmount,
  validateProbability,
} from "@/lib/validate"

export async function POST(request: Request) {
  try {
    const { odds, p, bankroll, fraction } = await request.json()
    validateOdds(odds)
    validateProbability(p)
    validatePositiveAmount(bankroll, "本金")
    validateFraction(fraction)

    return NextResponse.json(calculateKelly(odds, p, bankroll, fraction))
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error.message)
    return errorResponse("请求格式不正确")
  }
}
