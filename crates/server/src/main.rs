use std::{env, net::SocketAddr};

use axum::{
    extract::Json,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use lucky_tools_core::{
    calculate_ev, calculate_kelly, calculate_multi_kelly, calculate_vig, convert_odds,
    parse_odds_format, BetInput, EvResult, KellyResult, MultiKellyResult, OddsConversionResult,
    OddsValue, VigResult,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;

type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(Debug)]
struct ApiError {
    message: String,
}

impl ApiError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(ErrorResponse {
                error: self.message,
            }),
        )
            .into_response()
    }
}

#[derive(Debug, Deserialize)]
struct KellyRequest {
    odds: f64,
    p: f64,
    bankroll: f64,
    fraction: f64,
}

#[derive(Debug, Deserialize)]
struct MultiKellyRequest {
    bets: Vec<BetInput>,
    bankroll: f64,
    fraction: f64,
}

#[derive(Debug, Deserialize)]
struct OddsConvertRequest {
    value: JsonOddsValue,
    format: String,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum JsonOddsValue {
    Number(f64),
    Text(String),
}

#[derive(Debug, Deserialize)]
struct VigRequest {
    odds: Vec<f64>,
    labels: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct EvRequest {
    odds: f64,
    p: f64,
    stake: f64,
    n: Option<u32>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let port = env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(8787);
    let address = SocketAddr::from(([127, 0, 0, 1], port));

    let app = Router::new()
        .route("/", get(root))
        .route("/api/kelly", post(kelly))
        .route("/api/kelly/multi", post(multi_kelly))
        .route("/api/odds/convert", post(odds_convert))
        .route("/api/vig", post(vig))
        .route("/api/ev", post(ev))
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("博彩决策助手已启动：http://127.0.0.1:{port}");
    axum::serve(listener, app).await?;

    Ok(())
}

async fn root() -> &'static str {
    "博彩决策助手 API 服务已运行。请通过 /api/ 前缀调用 JSON 接口。"
}

async fn kelly(Json(request): Json<KellyRequest>) -> ApiResult<KellyResult> {
    validate_odds(request.odds)?;
    validate_probability(request.p)?;
    validate_positive_amount(request.bankroll, "本金")?;
    validate_fraction(request.fraction)?;

    Ok(Json(calculate_kelly(
        request.odds,
        request.p,
        request.bankroll,
        request.fraction,
    )))
}

async fn multi_kelly(Json(request): Json<MultiKellyRequest>) -> ApiResult<MultiKellyResult> {
    if !(1..=10).contains(&request.bets.len()) {
        return Err(ApiError::new("组合凯利注数必须在 1 到 10 之间"));
    }
    validate_positive_amount(request.bankroll, "本金")?;
    validate_fraction(request.fraction)?;
    for (index, bet) in request.bets.iter().enumerate() {
        validate_odds_for_index(bet.odds, index)?;
        validate_probability_for_index(bet.p, index)?;
    }

    Ok(Json(calculate_multi_kelly(
        &request.bets,
        request.bankroll,
        request.fraction,
    )))
}

async fn odds_convert(Json(request): Json<OddsConvertRequest>) -> ApiResult<OddsConversionResult> {
    let format =
        parse_odds_format(&request.format).map_err(|error| ApiError::new(error.message))?;
    let value = match request.value {
        JsonOddsValue::Number(number) => OddsValue::Number(number),
        JsonOddsValue::Text(text) => OddsValue::Text(text),
    };
    let result = convert_odds(format, value).map_err(|error| ApiError::new(error.message))?;

    Ok(Json(result))
}

async fn vig(Json(request): Json<VigRequest>) -> ApiResult<VigResult> {
    if request.odds.len() < 2 {
        return Err(ApiError::new("去水计算至少需要 2 个结果"));
    }
    for (index, odds) in request.odds.iter().enumerate() {
        validate_odds_for_index(*odds, index)?;
    }
    if let Some(labels) = &request.labels {
        if labels.len() != request.odds.len() {
            return Err(ApiError::new("标签数量必须与赔率数量一致"));
        }
    }

    Ok(Json(calculate_vig(
        &request.odds,
        request.labels.as_deref(),
    )))
}

async fn ev(Json(request): Json<EvRequest>) -> ApiResult<EvResult> {
    validate_odds(request.odds)?;
    validate_probability(request.p)?;
    validate_positive_amount(request.stake, "注额")?;
    let n = request.n.unwrap_or(100);
    if n == 0 {
        return Err(ApiError::new("长期注数必须大于 0"));
    }

    Ok(Json(calculate_ev(
        request.odds,
        request.p,
        request.stake,
        n,
    )))
}

fn validate_probability(value: f64) -> Result<(), ApiError> {
    if value.is_finite() && (0.0..1.0).contains(&value) {
        Ok(())
    } else {
        Err(ApiError::new("胜率必须在 0 和 1 之间"))
    }
}

fn validate_probability_for_index(value: f64, index: usize) -> Result<(), ApiError> {
    if value.is_finite() && (0.0..1.0).contains(&value) {
        Ok(())
    } else {
        Err(ApiError::new(format!(
            "第 {} 场胜率必须在 0 和 1 之间",
            index + 1
        )))
    }
}

fn validate_odds(value: f64) -> Result<(), ApiError> {
    if value.is_finite() && value > 1.0 {
        Ok(())
    } else {
        Err(ApiError::new("小数赔率必须大于 1"))
    }
}

fn validate_odds_for_index(value: f64, index: usize) -> Result<(), ApiError> {
    if value.is_finite() && value > 1.0 {
        Ok(())
    } else {
        Err(ApiError::new(format!(
            "第 {} 场小数赔率必须大于 1",
            index + 1
        )))
    }
}

fn validate_positive_amount(value: f64, name: &str) -> Result<(), ApiError> {
    if value.is_finite() && value > 0.0 {
        Ok(())
    } else {
        Err(ApiError::new(format!("{name}必须大于 0")))
    }
}

fn validate_fraction(value: f64) -> Result<(), ApiError> {
    if value.is_finite() && (0.0..=1.0).contains(&value) {
        Ok(())
    } else {
        Err(ApiError::new("凯利分数必须大于 0 且不超过 1"))
    }
}
