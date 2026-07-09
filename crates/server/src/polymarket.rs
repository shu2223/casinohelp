use std::{
    collections::HashMap,
    env,
    sync::OnceLock,
    time::{Duration, Instant},
};

use axum::{
    extract::{Json, Query},
    http::StatusCode,
};
use lucky_tools_core::{calculate_kelly, calculate_vig, KellyResult};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::RwLock;

use crate::{ApiError, ApiResult};

const GAMMA_MARKETS_URL: &str = "https://gamma-api.polymarket.com/markets";
const ANTHROPIC_MESSAGES_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL: &str = "claude-haiku-4-5-20251001";
const CACHE_TTL: Duration = Duration::from_secs(45);

static MARKET_CACHE: OnceLock<RwLock<HashMap<String, CacheEntry>>> = OnceLock::new();

#[derive(Clone)]
struct CacheEntry {
    expires_at: Instant,
    markets: Vec<PolymarketMarket>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct MarketsQuery {
    category: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PolymarketMarket {
    pub id: String,
    pub question: String,
    pub description: Option<String>,
    pub outcomes: Vec<String>,
    pub prices: Vec<f64>,
    pub decimal_odds: Vec<f64>,
    pub fair_probabilities: Vec<f64>,
    pub best_bid: Option<f64>,
    pub best_ask: Option<f64>,
    pub spread: Option<f64>,
    pub volume: f64,
    pub liquidity: f64,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct MarketsResponse {
    pub category: String,
    pub limit: usize,
    pub markets: Vec<PolymarketMarket>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct EstimateRequest {
    question: String,
    outcomes: Vec<String>,
    context: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct EstimateOutcome {
    pub label: String,
    pub p: f64,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct EstimateResponse {
    pub model: String,
    pub outcomes: Vec<EstimateOutcome>,
    pub confidence: f64,
    pub note: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnalyzeRequest {
    items: Vec<AnalyzeItemRequest>,
    bankroll: f64,
    fraction: f64,
}

#[derive(Debug, Deserialize)]
struct AnalyzeItemRequest {
    odds: f64,
    p: f64,
    label: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct AnalyzeResponse {
    pub ranked: Vec<AnalyzeItemResult>,
    pub total_stake: f64,
}

#[derive(Debug, Serialize)]
pub(crate) struct AnalyzeItemResult {
    pub rank: usize,
    pub index: usize,
    pub label: String,
    pub odds: f64,
    pub p: f64,
    pub edge: f64,
    pub kelly_fraction: f64,
    pub stake: f64,
    pub ev: f64,
    pub should_bet: bool,
    pub verdict: String,
}

#[derive(Debug, Deserialize)]
struct GammaMarket {
    #[serde(default)]
    id: Value,
    question: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    outcomes: Value,
    #[serde(default, rename = "outcomePrices")]
    outcome_prices: Value,
    #[serde(default)]
    volume: Value,
    #[serde(default, rename = "volumeNum")]
    volume_num: Value,
    #[serde(default)]
    liquidity: Value,
    #[serde(default, rename = "liquidityNum")]
    liquidity_num: Value,
    #[serde(default, rename = "bestBid")]
    best_bid: Value,
    #[serde(default, rename = "bestAsk")]
    best_ask: Value,
    #[serde(default)]
    spread: Value,
    #[serde(default, rename = "endDate")]
    end_date: Option<String>,
}

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: &'static str,
    max_tokens: u32,
    temperature: f64,
    system: &'static str,
    messages: Vec<AnthropicMessage>,
}

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: &'static str,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicEstimatePayload {
    outcomes: Vec<EstimateOutcome>,
    confidence: f64,
}

pub(crate) async fn markets(Query(query): Query<MarketsQuery>) -> ApiResult<MarketsResponse> {
    let category = query
        .category
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("all")
        .to_string();
    let limit = query.limit.unwrap_or(20);
    if !(1..=50).contains(&limit) {
        return Err(ApiError::new("盘口数量 limit 必须在 1 到 50 之间"));
    }

    let markets = fetch_markets(&category, limit).await?;
    Ok(Json(MarketsResponse {
        category,
        limit,
        markets,
    }))
}

pub(crate) async fn estimate(Json(request): Json<EstimateRequest>) -> ApiResult<EstimateResponse> {
    let question = request.question.trim();
    if question.is_empty() {
        return Err(ApiError::new("盘口问题不能为空"));
    }
    if !(2..=10).contains(&request.outcomes.len()) {
        return Err(ApiError::new("估算概率至少需要 2 个结果，最多 10 个结果"));
    }
    for outcome in &request.outcomes {
        if outcome.trim().is_empty() {
            return Err(ApiError::new("结果名称不能为空"));
        }
    }

    let api_key = env::var("ANTHROPIC_API_KEY").map_err(|_| {
        ApiError::new("AI 估算需要配置 ANTHROPIC_API_KEY；手动模式和盘口抓取不受影响")
    })?;

    let client = http_client()?;
    let prompt = build_estimate_prompt(question, &request.outcomes, request.context.as_deref());
    let response = client
        .post(ANTHROPIC_MESSAGES_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&AnthropicRequest {
            model: ANTHROPIC_MODEL,
            max_tokens: 1200,
            temperature: 0.2,
            system: "You estimate event probabilities for prediction-market questions. Do not assume market prices; use independent reasoning only. Return valid JSON only.",
            messages: vec![AnthropicMessage {
                role: "user",
                content: prompt,
            }],
        })
        .send()
        .await
        .map_err(|error| ApiError::new(format!("AI 估算请求失败：{error}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(ApiError::with_status(
            StatusCode::BAD_GATEWAY,
            format!("AI 估算服务返回异常（{status}）：{}", truncate(&text, 180)),
        ));
    }

    let payload: AnthropicResponse = response
        .json()
        .await
        .map_err(|error| ApiError::new(format!("AI 估算响应格式不正确：{error}")))?;
    let text = payload
        .content
        .into_iter()
        .find(|part| part.content_type == "text")
        .and_then(|part| part.text)
        .ok_or_else(|| ApiError::new("AI 估算没有返回文本结果"))?;
    let parsed = parse_estimate_payload(&text, &request.outcomes)?;

    Ok(Json(EstimateResponse {
        model: ANTHROPIC_MODEL.to_string(),
        outcomes: parsed.outcomes,
        confidence: parsed.confidence.clamp(0.0, 1.0),
        note: "AI 概率为独立初筛估计；提示词未包含市场价格。".to_string(),
    }))
}

pub(crate) async fn analyze(Json(request): Json<AnalyzeRequest>) -> ApiResult<AnalyzeResponse> {
    if !(1..=200).contains(&request.items.len()) {
        return Err(ApiError::new("分析项目数量必须在 1 到 200 之间"));
    }
    validate_positive(request.bankroll, "本金")?;
    validate_fraction(request.fraction)?;

    let mut ranked = Vec::with_capacity(request.items.len());
    for (index, item) in request.items.iter().enumerate() {
        validate_odds(item.odds, index)?;
        validate_probability(item.p, index)?;
        let label = item.label.trim();
        if label.is_empty() {
            return Err(ApiError::new(format!("第 {} 项名称不能为空", index + 1)));
        }
        let KellyResult {
            edge,
            kelly_fraction,
            stake,
            ev,
            should_bet,
            verdict,
        } = calculate_kelly(item.odds, item.p, request.bankroll, request.fraction);

        ranked.push(AnalyzeItemResult {
            rank: 0,
            index,
            label: label.to_string(),
            odds: item.odds,
            p: item.p,
            edge,
            kelly_fraction,
            stake,
            ev,
            should_bet,
            verdict,
        });
    }

    ranked.sort_by(|left, right| right.edge.total_cmp(&left.edge));
    for (rank, item) in ranked.iter_mut().enumerate() {
        item.rank = rank + 1;
    }
    let total_stake = ranked.iter().map(|item| item.stake).sum();

    Ok(Json(AnalyzeResponse {
        ranked,
        total_stake,
    }))
}

async fn fetch_markets(category: &str, limit: usize) -> Result<Vec<PolymarketMarket>, ApiError> {
    let cache_key = format!("{}:{limit}", category.to_lowercase());
    let now = Instant::now();
    let cache = MARKET_CACHE.get_or_init(|| RwLock::new(HashMap::new()));
    if let Some(entry) = cache.read().await.get(&cache_key) {
        if entry.expires_at > now {
            return Ok(entry.markets.clone());
        }
    }

    let client = http_client()?;
    let limit_string = limit.to_string();
    let mut query = vec![
        ("closed", "false"),
        ("active", "true"),
        ("order", "volume"),
        ("ascending", "false"),
        ("limit", limit_string.as_str()),
    ];
    let tag_id = category_tag_id(category);
    if let Some(tag_id) = tag_id.as_deref() {
        query.push(("tag_id", tag_id));
    }

    let response = client
        .get(GAMMA_MARKETS_URL)
        .query(&query)
        .send()
        .await
        .map_err(|error| ApiError::new(format!("Polymarket 盘口抓取失败：{error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(ApiError::with_status(
            StatusCode::BAD_GATEWAY,
            format!(
                "Polymarket 上游返回异常（{status}）：{}",
                truncate(&text, 180)
            ),
        ));
    }

    let raw_markets: Vec<GammaMarket> = response
        .json()
        .await
        .map_err(|error| ApiError::new(format!("Polymarket 响应格式不正确：{error}")))?;
    let markets: Vec<PolymarketMarket> = raw_markets
        .into_iter()
        .filter_map(normalize_market)
        .take(limit)
        .collect();

    cache.write().await.insert(
        cache_key,
        CacheEntry {
            expires_at: now + CACHE_TTL,
            markets: markets.clone(),
        },
    );

    Ok(markets)
}

fn normalize_market(raw: GammaMarket) -> Option<PolymarketMarket> {
    let outcomes = parse_string_array(&raw.outcomes)?;
    let prices = parse_number_array(&raw.outcome_prices)?;
    if outcomes.len() < 2 || outcomes.len() != prices.len() {
        return None;
    }
    if prices
        .iter()
        .any(|price| !price.is_finite() || *price <= 0.0 || *price >= 1.0)
    {
        return None;
    }
    let decimal_odds: Vec<f64> = prices.iter().map(|price| 1.0 / price).collect();
    let fair_probabilities = calculate_vig(&decimal_odds, Some(&outcomes))
        .outcomes
        .into_iter()
        .map(|outcome| outcome.true_probability)
        .collect();

    Some(PolymarketMarket {
        id: value_to_string(&raw.id).unwrap_or_else(|| raw.question.clone()),
        question: raw.question,
        description: raw.description,
        outcomes,
        prices,
        decimal_odds,
        fair_probabilities,
        best_bid: parse_number(&raw.best_bid),
        best_ask: parse_number(&raw.best_ask),
        spread: parse_number(&raw.spread),
        volume: parse_number(&raw.volume_num)
            .or_else(|| parse_number(&raw.volume))
            .unwrap_or(0.0),
        liquidity: parse_number(&raw.liquidity_num)
            .or_else(|| parse_number(&raw.liquidity))
            .unwrap_or(0.0),
        end_date: raw.end_date,
    })
}

fn http_client() -> Result<Client, ApiError> {
    Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("lucky-tools-polymarket/0.1")
        .build()
        .map_err(|error| ApiError::new(format!("HTTP 客户端初始化失败：{error}")))
}

fn category_tag_id(category: &str) -> Option<String> {
    let normalized = category.trim().to_ascii_lowercase();
    if normalized.is_empty() || normalized == "all" {
        return None;
    }
    if normalized.chars().all(|ch| ch.is_ascii_digit()) {
        return Some(normalized);
    }
    match normalized.as_str() {
        "sports" | "sport" => Some("1".to_string()),
        "politics" | "politic" => Some("2".to_string()),
        "crypto" | "bitcoin" => Some("21".to_string()),
        "business" | "finance" | "stocks" => Some("22".to_string()),
        "culture" | "entertainment" => Some("51".to_string()),
        "esports" | "gaming" => Some("64".to_string()),
        "weather" | "climate" => Some("74".to_string()),
        "science" | "space" => Some("75".to_string()),
        _ => None,
    }
}

fn build_estimate_prompt(question: &str, outcomes: &[String], context: Option<&str>) -> String {
    let outcomes_json = serde_json::to_string(outcomes).unwrap_or_else(|_| "[]".to_string());
    let context_text = context
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("No extra context provided.");

    format!(
        "Estimate independent probabilities for this prediction-market question. Do not use or infer any market price because none is provided.\n\nQuestion: {question}\nOutcomes: {outcomes_json}\nContext: {context_text}\n\nReturn JSON only in this shape:\n{{\"outcomes\":[{{\"label\":\"exact outcome label\",\"p\":0.0,\"reason\":\"brief reason\"}}],\"confidence\":0.0}}\nRules: include every provided outcome exactly once; probabilities must be decimals between 0 and 1 and sum to 1; confidence is 0 to 1."
    )
}

fn parse_estimate_payload(
    text: &str,
    expected_outcomes: &[String],
) -> Result<AnthropicEstimatePayload, ApiError> {
    let start = text
        .find('{')
        .ok_or_else(|| ApiError::new("AI 估算结果不是 JSON"))?;
    let end = text
        .rfind('}')
        .ok_or_else(|| ApiError::new("AI 估算结果不是 JSON"))?;
    let json = &text[start..=end];
    let mut payload: AnthropicEstimatePayload = serde_json::from_str(json)
        .map_err(|error| ApiError::new(format!("AI 估算 JSON 解析失败：{error}")))?;
    if payload.outcomes.len() != expected_outcomes.len() {
        return Err(ApiError::new("AI 估算结果数量与盘口结果数量不一致"));
    }

    let mut by_label: HashMap<String, EstimateOutcome> = payload
        .outcomes
        .into_iter()
        .map(|outcome| (outcome.label.trim().to_string(), outcome))
        .collect();
    let mut ordered = Vec::with_capacity(expected_outcomes.len());
    for label in expected_outcomes {
        let mut outcome = by_label
            .remove(label)
            .ok_or_else(|| ApiError::new("AI 估算结果标签与盘口结果不一致"))?;
        outcome.p = outcome.p.clamp(0.000_001, 0.999_999);
        ordered.push(outcome);
    }

    let sum: f64 = ordered.iter().map(|outcome| outcome.p).sum();
    if !sum.is_finite() || sum <= 0.0 {
        return Err(ApiError::new("AI 估算概率无效"));
    }
    for outcome in &mut ordered {
        outcome.p /= sum;
    }
    payload.outcomes = ordered;
    Ok(payload)
}

fn parse_string_array(value: &Value) -> Option<Vec<String>> {
    match value {
        Value::Array(items) => items
            .iter()
            .map(|item| item.as_str().map(ToOwned::to_owned))
            .collect(),
        Value::String(text) => serde_json::from_str::<Vec<String>>(text).ok(),
        _ => None,
    }
}

fn parse_number_array(value: &Value) -> Option<Vec<f64>> {
    match value {
        Value::Array(items) => items.iter().map(parse_number).collect(),
        Value::String(text) => {
            let values = serde_json::from_str::<Vec<Value>>(text).ok()?;
            values.iter().map(parse_number).collect()
        }
        _ => None,
    }
}

fn parse_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.parse::<f64>().ok(),
        _ => None,
    }
}

fn value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

fn validate_positive(value: f64, name: &str) -> Result<(), ApiError> {
    if value.is_finite() && value > 0.0 {
        Ok(())
    } else {
        Err(ApiError::new(format!("{name}必须大于 0")))
    }
}

fn validate_fraction(value: f64) -> Result<(), ApiError> {
    if value.is_finite() && value > 0.0 && value <= 1.0 {
        Ok(())
    } else {
        Err(ApiError::new("凯利分数必须大于 0 且不超过 1"))
    }
}

fn validate_odds(value: f64, index: usize) -> Result<(), ApiError> {
    if value.is_finite() && value > 1.0 {
        Ok(())
    } else {
        Err(ApiError::new(format!(
            "第 {} 项小数赔率必须大于 1",
            index + 1
        )))
    }
}

fn validate_probability(value: f64, index: usize) -> Result<(), ApiError> {
    if value.is_finite() && value > 0.0 && value < 1.0 {
        Ok(())
    } else {
        Err(ApiError::new(format!(
            "第 {} 项胜率必须在 0 和 1 之间",
            index + 1
        )))
    }
}

fn truncate(text: &str, max_chars: usize) -> String {
    let mut output: String = text.chars().take(max_chars).collect();
    if text.chars().count() > max_chars {
        output.push_str("...");
    }
    output
}
