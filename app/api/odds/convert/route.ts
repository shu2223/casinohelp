import { NextResponse } from "next/server"
import { CalculationError, convertOdds, parseOddsFormat } from "@/lib/betting"
import { errorResponse } from "@/lib/validate"

export async function POST(request: Request) {
  try {
    const { value, format } = await request.json()
    const oddsFormat = parseOddsFormat(String(format))
    return NextResponse.json(convertOdds(oddsFormat, value))
  } catch (error) {
    if (error instanceof CalculationError) return errorResponse(error.message)
    return errorResponse("请求格式不正确")
  }
}
