import { NextResponse } from "next/server"
import { calculateEv } from "@/lib/betting"
import {
  ApiError,
  errorResponse,
  validateOdds,
  validatePositiveAmount,
  validateProbability,
} from "@/lib/validate"

export async function POST(request: Request) {
  try {
    const { odds, p, stake, n } = await request.json()
    validateOdds(odds)
    validateProbability(p)
    validatePositiveAmount(stake, "注额")
    const runs = n === undefined || n === null ? 100 : n
    if (!Number.isInteger(runs) || runs <= 0) {
      throw new ApiError("长期注数必须大于 0")
    }

    return NextResponse.json(calculateEv(odds, p, stake, runs))
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error.message)
    return errorResponse("请求格式不正确")
  }
}
