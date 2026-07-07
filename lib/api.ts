// 调用本地 API 路由；出错时抛出后端返回的中文错误消息。
export async function postApi<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error ?? "计算失败，请检查输入")
  }
  return data as T
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "-"
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "-"
  return `${(value * 100).toFixed(digits)}%`
}
