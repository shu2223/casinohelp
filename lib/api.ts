const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "")

export async function getApi<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error ?? "请求失败，请稍后重试")
  }
  return data as T
}

// 调用 Rust API；生产静态部署时可通过 NEXT_PUBLIC_API_BASE_URL 指向 Fly 后端。
export async function postApi<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
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
