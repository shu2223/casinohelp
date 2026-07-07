import { NextResponse } from "next/server"
import { calculateVig } from "@/lib/betting"
import { ApiError, errorResponse, validateOddsForIndex } from "@/lib/validate"

export async function POST(request: Request) {
  try {
    const { odds, labels } = await request.json()
    if (!Array.isArray(odds) || odds.length < 2 || odds.length > 3) {
      throw new ApiError("去水计算赔率数量必须是 2 或 3 个")
    }
    odds.forEach((value: number, index: number) => validateOddsForIndex(value, index))
    if (Array.isArray(labels) && labels.length !== odds.length) {
      throw new ApiError("标签数量必须与赔率数量一致")
    }

    return NextResponse.json(calculateVig(odds, Array.isArray(labels) ? labels : undefined))
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error.message)
    return errorResponse("请求格式不正确")
  }
}
