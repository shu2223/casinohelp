use serde::{Deserialize, Serialize};

const MULTI_MAX_TOTAL_FRACTION: f64 = 0.999;

#[derive(Debug, Clone, PartialEq)]
pub struct CalculationError {
    pub message: String,
}

impl CalculationError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct BetInput {
    pub odds: f64,
    pub p: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct KellyResult {
    pub edge: f64,
    pub kelly_fraction: f64,
    pub stake: f64,
    pub ev: f64,
    pub should_bet: bool,
    pub verdict: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MultiKellyAllocation {
    pub index: usize,
    pub kelly_fraction: f64,
    pub stake: f64,
    pub naive_kelly: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MultiKellyResult {
    pub allocations: Vec<MultiKellyAllocation>,
    pub total_fraction: f64,
    pub total_stake: f64,
    pub note: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OddsFormat {
    Decimal,
    American,
    Hongkong,
    Malay,
    Indonesian,
    Fractional,
}

#[derive(Debug, Clone, PartialEq)]
pub enum OddsValue {
    Number(f64),
    Text(String),
}

#[derive(Debug, Clone, Serialize)]
pub struct OddsConversionResult {
    pub decimal: f64,
    pub american: f64,
    pub hongkong: f64,
    pub malay: f64,
    pub indonesian: f64,
    pub fractional: String,
    pub implied_probability: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct VigOutcome {
    pub label: String,
    pub implied: f64,
    pub true_probability: f64,
    pub fair_odds: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct VigResult {
    pub overround: f64,
    pub overround_percent: String,
    pub outcomes: Vec<VigOutcome>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LongRunResult {
    pub n: u32,
    pub expected_profit: f64,
    pub std_dev: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct EvResult {
    pub ev: f64,
    pub roi: f64,
    pub std_dev: f64,
    pub long_run: LongRunResult,
    pub positive_ev: bool,
}

pub fn calculate_kelly(odds: f64, p: f64, bankroll: f64, fraction: f64) -> KellyResult {
    debug_assert!(odds > 1.0);
    debug_assert!(p > 0.0 && p < 1.0);
    debug_assert!(bankroll > 0.0);
    debug_assert!(fraction > 0.0 && fraction <= 1.0);

    let b = odds - 1.0;
    let edge = b * p - (1.0 - p);
    let kelly_fraction = edge / b;
    let should_bet = kelly_fraction > 0.0;
    let stake = if should_bet {
        bankroll * kelly_fraction * fraction
    } else {
        0.0
    };
    let ev = edge * stake;
    let verdict = if should_bet {
        format!(
            "有优势，建议下注 {:.2}（{}）",
            stake,
            fraction_label(fraction)
        )
    } else {
        "无优势，不该下".to_string()
    };

    KellyResult {
        edge,
        kelly_fraction,
        stake,
        ev,
        should_bet,
        verdict,
    }
}

pub fn calculate_multi_kelly(bets: &[BetInput], bankroll: f64, fraction: f64) -> MultiKellyResult {
    debug_assert!(!bets.is_empty() && bets.len() <= 10);
    debug_assert!(bankroll > 0.0);
    debug_assert!(fraction > 0.0 && fraction <= 1.0);
    for bet in bets {
        debug_assert!(bet.odds > 1.0);
        debug_assert!(bet.p > 0.0 && bet.p < 1.0);
    }

    let naive: Vec<f64> = bets
        .iter()
        .map(|bet| calculate_kelly(bet.odds, bet.p, bankroll, 1.0).kelly_fraction.max(0.0))
        .collect();
    let fractions = optimize_multi_kelly(bets, &naive);

    let allocations: Vec<MultiKellyAllocation> = fractions
        .iter()
        .enumerate()
        .map(|(index, &kelly_fraction)| MultiKellyAllocation {
            index,
            kelly_fraction,
            stake: bankroll * kelly_fraction * fraction,
            naive_kelly: naive[index],
        })
        .collect();
    let total_fraction = fractions.iter().sum();
    let total_stake = allocations.iter().map(|allocation| allocation.stake).sum();

    MultiKellyResult {
        allocations,
        total_fraction,
        total_stake,
        note: "已做联合优化，总仓位低于逐场单注凯利之和".to_string(),
    }
}

pub fn parse_odds_format(format: &str) -> Result<OddsFormat, CalculationError> {
    match format {
        "decimal" => Ok(OddsFormat::Decimal),
        "american" => Ok(OddsFormat::American),
        "hongkong" => Ok(OddsFormat::Hongkong),
        "malay" => Ok(OddsFormat::Malay),
        "indonesian" => Ok(OddsFormat::Indonesian),
        "fractional" => Ok(OddsFormat::Fractional),
        _ => Err(CalculationError::new("赔率格式不支持")),
    }
}

pub fn convert_odds(
    format: OddsFormat,
    value: OddsValue,
) -> Result<OddsConversionResult, CalculationError> {
    let decimal = match format {
        OddsFormat::Decimal => {
            let v = numeric_value(value)?;
            if v <= 1.0 {
                return Err(CalculationError::new("小数赔率必须大于 1"));
            }
            v
        }
        OddsFormat::American => {
            let v = numeric_value(value)?;
            if v.abs() < 100.0 {
                return Err(CalculationError::new("美式赔率绝对值必须不小于 100"));
            }
            if v > 0.0 {
                1.0 + v / 100.0
            } else {
                1.0 + 100.0 / -v
            }
        }
        OddsFormat::Hongkong => {
            let v = numeric_value(value)?;
            if v <= 0.0 {
                return Err(CalculationError::new("香港盘赔率必须大于 0"));
            }
            v + 1.0
        }
        OddsFormat::Malay => {
            let v = numeric_value(value)?;
            if v > 0.0 {
                if v > 1.0 {
                    return Err(CalculationError::new("马来盘正赔率必须不大于 1"));
                }
                v + 1.0
            } else if v < 0.0 {
                1.0 - 1.0 / v
            } else {
                return Err(CalculationError::new("马来盘赔率不能为 0"));
            }
        }
        OddsFormat::Indonesian => {
            let v = numeric_value(value)?;
            if v > 0.0 {
                if v < 1.0 {
                    return Err(CalculationError::new("印尼盘正赔率必须不小于 1"));
                }
                v + 1.0
            } else if v < 0.0 {
                1.0 - 1.0 / v
            } else {
                return Err(CalculationError::new("印尼盘赔率不能为 0"));
            }
        }
        OddsFormat::Fractional => {
            let text = text_value(value)?;
            let (numerator, denominator) = parse_fraction(&text)?;
            1.0 + numerator as f64 / denominator as f64
        }
    };

    Ok(convert_decimal(decimal))
}

pub fn calculate_vig(odds: &[f64], labels: Option<&[String]>) -> VigResult {
    debug_assert!(odds.len() == 2 || odds.len() == 3);
    for odd in odds {
        debug_assert!(*odd > 1.0);
    }

    let implied: Vec<f64> = odds.iter().map(|odd| 1.0 / odd).collect();
    let implied_sum: f64 = implied.iter().sum();
    let overround = implied_sum - 1.0;
    let outcomes = odds
        .iter()
        .enumerate()
        .map(|(index, _)| {
            let true_probability = implied[index] / implied_sum;
            VigOutcome {
                label: labels
                    .and_then(|items| items.get(index))
                    .cloned()
                    .unwrap_or_else(|| format!("结果{}", index + 1)),
                implied: implied[index],
                true_probability,
                fair_odds: 1.0 / true_probability,
            }
        })
        .collect();

    VigResult {
        overround,
        overround_percent: format!("{:.2}%", overround * 100.0),
        outcomes,
        note: (implied_sum <= 1.0).then(|| "赔率组合存在套利空间".to_string()),
    }
}

pub fn calculate_ev(odds: f64, p: f64, stake: f64, n: u32) -> EvResult {
    debug_assert!(odds > 1.0);
    debug_assert!(p > 0.0 && p < 1.0);
    debug_assert!(stake > 0.0);
    debug_assert!(n > 0);

    let ev = p * (odds - 1.0) * stake - (1.0 - p) * stake;
    let roi = ev / stake;
    let std_dev = stake * odds * (p * (1.0 - p)).sqrt();
    let n_f64 = f64::from(n);

    EvResult {
        ev,
        roi,
        std_dev,
        long_run: LongRunResult {
            n,
            expected_profit: n_f64 * ev,
            std_dev: std_dev * n_f64.sqrt(),
        },
        positive_ev: ev > 0.0,
    }
}

fn optimize_multi_kelly(bets: &[BetInput], naive: &[f64]) -> Vec<f64> {
    let mut fractions = project_simplex(naive.to_vec(), MULTI_MAX_TOTAL_FRACTION);
    let mut step = 1.0;

    for _ in 0..10_000 {
        let gradient = multi_gradient(bets, &fractions);
        let projected = project_simplex(
            fractions
                .iter()
                .zip(&gradient)
                .map(|(&f, &g)| f + g)
                .collect(),
            MULTI_MAX_TOTAL_FRACTION,
        );
        let projected_gradient_norm = l2_distance(&projected, &fractions);
        if projected_gradient_norm < 1e-9 {
            break;
        }

        let current_objective = multi_objective(bets, &fractions);
        let mut accepted = false;
        let mut local_step = step;

        for _ in 0..80 {
            let candidate = project_simplex(
                fractions
                    .iter()
                    .zip(&gradient)
                    .map(|(&f, &g)| f + local_step * g)
                    .collect(),
                MULTI_MAX_TOTAL_FRACTION,
            );
            let candidate_objective = multi_objective(bets, &candidate);
            if candidate_objective >= current_objective - 1e-14 {
                let delta = l2_distance(&candidate, &fractions);
                fractions = candidate;
                step = (local_step * 1.2).min(64.0);
                accepted = true;
                if delta < 1e-12 {
                    return clean_fractions(fractions, naive);
                }
                break;
            }
            local_step *= 0.5;
        }

        if !accepted {
            break;
        }
    }

    clean_fractions(fractions, naive)
}

fn clean_fractions(mut fractions: Vec<f64>, naive: &[f64]) -> Vec<f64> {
    for (fraction, &naive_fraction) in fractions.iter_mut().zip(naive) {
        if *fraction < 1e-10 || naive_fraction <= 0.0 {
            *fraction = 0.0;
        }
        if *fraction > naive_fraction && *fraction - naive_fraction < 1e-8 {
            *fraction = naive_fraction;
        }
    }
    fractions
}

fn multi_objective(bets: &[BetInput], fractions: &[f64]) -> f64 {
    let mut objective = 0.0;
    for mask in 0..(1usize << bets.len()) {
        let mut probability = 1.0;
        let mut wealth = 1.0;

        for (index, bet) in bets.iter().enumerate() {
            let won = (mask & (1usize << index)) != 0;
            probability *= if won { bet.p } else { 1.0 - bet.p };
            let return_per_unit = if won { bet.odds - 1.0 } else { -1.0 };
            wealth += fractions[index] * return_per_unit;
        }

        if wealth <= 0.0 {
            return f64::NEG_INFINITY;
        }
        objective += probability * wealth.ln();
    }
    objective
}

fn multi_gradient(bets: &[BetInput], fractions: &[f64]) -> Vec<f64> {
    let mut gradient = vec![0.0; bets.len()];

    for mask in 0..(1usize << bets.len()) {
        let mut probability = 1.0;
        let mut wealth = 1.0;
        let mut returns = vec![0.0; bets.len()];

        for (index, bet) in bets.iter().enumerate() {
            let won = (mask & (1usize << index)) != 0;
            probability *= if won { bet.p } else { 1.0 - bet.p };
            returns[index] = if won { bet.odds - 1.0 } else { -1.0 };
            wealth += fractions[index] * returns[index];
        }

        for (value, return_per_unit) in gradient.iter_mut().zip(returns) {
            *value += probability * return_per_unit / wealth;
        }
    }

    gradient
}

fn project_simplex(mut values: Vec<f64>, max_sum: f64) -> Vec<f64> {
    for value in &mut values {
        if !value.is_finite() || *value < 0.0 {
            *value = 0.0;
        }
    }

    let sum: f64 = values.iter().sum();
    if sum <= max_sum {
        return values;
    }

    let mut sorted = values.clone();
    sorted.sort_by(|a, b| b.total_cmp(a));

    let mut running_sum = 0.0;
    let mut theta = 0.0;
    for (index, value) in sorted.iter().enumerate() {
        running_sum += value;
        let candidate_theta = (running_sum - max_sum) / (index + 1) as f64;
        let next_value = sorted.get(index + 1).copied().unwrap_or(f64::NEG_INFINITY);
        if next_value <= candidate_theta {
            theta = candidate_theta;
            break;
        }
    }

    values
        .into_iter()
        .map(|value| (value - theta).max(0.0))
        .collect()
}

fn convert_decimal(decimal: f64) -> OddsConversionResult {
    OddsConversionResult {
        decimal,
        american: if decimal >= 2.0 {
            100.0 * (decimal - 1.0)
        } else {
            -100.0 / (decimal - 1.0)
        },
        hongkong: decimal - 1.0,
        malay: if decimal <= 2.0 {
            decimal - 1.0
        } else {
            -1.0 / (decimal - 1.0)
        },
        indonesian: if decimal >= 2.0 {
            decimal - 1.0
        } else {
            -1.0 / (decimal - 1.0)
        },
        fractional: best_fraction(decimal - 1.0),
        implied_probability: 1.0 / decimal,
    }
}

fn numeric_value(value: OddsValue) -> Result<f64, CalculationError> {
    match value {
        OddsValue::Number(number) if number.is_finite() => Ok(number),
        OddsValue::Text(text) => text
            .parse::<f64>()
            .map_err(|_| CalculationError::new("赔率数值格式不正确")),
        OddsValue::Number(_) => Err(CalculationError::new("赔率数值必须是有限数字")),
    }
}

fn text_value(value: OddsValue) -> Result<String, CalculationError> {
    match value {
        OddsValue::Text(text) => Ok(text),
        OddsValue::Number(number) => Ok(number.to_string()),
    }
}

fn parse_fraction(value: &str) -> Result<(u64, u64), CalculationError> {
    let Some((numerator, denominator)) = value.trim().split_once('/') else {
        return Err(CalculationError::new("分数盘格式必须类似 3/2"));
    };
    let numerator = numerator
        .trim()
        .parse::<u64>()
        .map_err(|_| CalculationError::new("分数盘分子必须是正整数"))?;
    let denominator = denominator
        .trim()
        .parse::<u64>()
        .map_err(|_| CalculationError::new("分数盘分母必须是正整数"))?;
    if numerator == 0 || denominator == 0 {
        return Err(CalculationError::new("分数盘分子和分母必须大于 0"));
    }
    Ok((numerator, denominator))
}

fn best_fraction(value: f64) -> String {
    let mut best_numerator = 1u64;
    let mut best_denominator = 1u64;
    let mut best_error = f64::INFINITY;

    for denominator in 1..=100u64 {
        let numerator = (value * denominator as f64).round().max(1.0) as u64;
        let approximation = numerator as f64 / denominator as f64;
        let error = (approximation - value).abs();
        if error < best_error {
            best_error = error;
            best_numerator = numerator;
            best_denominator = denominator;
        }
    }

    let divisor = gcd(best_numerator, best_denominator);
    format!("{}/{}", best_numerator / divisor, best_denominator / divisor)
}

fn gcd(mut a: u64, mut b: u64) -> u64 {
    while b != 0 {
        let remainder = a % b;
        a = b;
        b = remainder;
    }
    a
}

fn fraction_label(fraction: f64) -> &'static str {
    if (fraction - 1.0).abs() < 1e-12 {
        "全凯利"
    } else if (fraction - 0.5).abs() < 1e-12 {
        "半凯利"
    } else if (fraction - 0.25).abs() < 1e-12 {
        "四分之一凯利"
    } else {
        "分数凯利"
    }
}

fn l2_distance(left: &[f64], right: &[f64]) -> f64 {
    left.iter()
        .zip(right)
        .map(|(l, r)| (l - r).powi(2))
        .sum::<f64>()
        .sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROPORTION_TOLERANCE: f64 = 1e-4;
    const MONEY_TOLERANCE: f64 = 0.01;
    const MULTI_TOLERANCE: f64 = 0.002;

    fn assert_close(actual: f64, expected: f64, tolerance: f64) {
        assert!(
            (actual - expected).abs() <= tolerance,
            "expected {expected}, got {actual}"
        );
    }

    #[test]
    fn c1_kelly_positive_half_fraction() {
        let result = calculate_kelly(2.5, 0.5, 1000.0, 0.5);
        assert_close(result.edge, 0.25, PROPORTION_TOLERANCE);
        assert_close(result.kelly_fraction, 0.166_667, PROPORTION_TOLERANCE);
        assert_close(result.stake, 83.33, MONEY_TOLERANCE);
        assert!(result.should_bet);
    }

    #[test]
    fn c1_kelly_positive_full_fraction() {
        let result = calculate_kelly(2.5, 0.5, 1000.0, 1.0);
        assert_close(result.stake, 166.67, MONEY_TOLERANCE);
    }

    #[test]
    fn c1_kelly_negative_edge_never_negative_stake() {
        let result = calculate_kelly(1.8, 0.5, 1000.0, 0.5);
        assert_close(result.edge, -0.1, PROPORTION_TOLERANCE);
        assert_close(result.kelly_fraction, -0.125, PROPORTION_TOLERANCE);
        assert_close(result.stake, 0.0, MONEY_TOLERANCE);
        assert!(!result.should_bet);
        assert!(result.verdict.contains("不该下"));
    }

    #[test]
    fn c1_kelly_break_even_is_not_bettable() {
        let result = calculate_kelly(2.0, 0.5, 1000.0, 0.5);
        assert_close(result.stake, 0.0, MONEY_TOLERANCE);
        assert!(!result.should_bet);
    }

    #[test]
    fn c2_multi_single_matches_single_kelly() {
        let result = calculate_multi_kelly(&[BetInput { odds: 2.5, p: 0.5 }], 1000.0, 1.0);
        assert_close(
            result.allocations[0].kelly_fraction,
            0.166_667,
            PROPORTION_TOLERANCE,
        );
        assert_close(result.allocations[0].stake, 166.67, MONEY_TOLERANCE);
    }

    #[test]
    fn c2_multi_two_identical_bets_are_symmetric_and_lower_than_naive() {
        let bets = [
            BetInput { odds: 2.5, p: 0.5 },
            BetInput { odds: 2.5, p: 0.5 },
        ];
        let result = calculate_multi_kelly(&bets, 1000.0, 1.0);
        assert_close(
            result.allocations[0].kelly_fraction,
            result.allocations[1].kelly_fraction,
            PROPORTION_TOLERANCE,
        );
        assert_close(
            result.allocations[0].kelly_fraction,
            0.1609,
            MULTI_TOLERANCE,
        );
        for allocation in &result.allocations {
            assert!(allocation.kelly_fraction <= allocation.naive_kelly + PROPORTION_TOLERANCE);
        }
        let naive_sum: f64 = result
            .allocations
            .iter()
            .map(|allocation| allocation.naive_kelly)
            .sum();
        assert!(result.total_fraction <= naive_sum + PROPORTION_TOLERANCE);
    }

    #[test]
    fn c2_multi_zeroes_non_positive_edge_bet() {
        let bets = [
            BetInput { odds: 2.5, p: 0.5 },
            BetInput { odds: 1.8, p: 0.5 },
        ];
        let result = calculate_multi_kelly(&bets, 1000.0, 1.0);
        assert_close(
            result.allocations[0].kelly_fraction,
            0.166_667,
            MULTI_TOLERANCE,
        );
        assert_close(result.allocations[1].kelly_fraction, 0.0, PROPORTION_TOLERANCE);
    }

    #[test]
    fn c3_convert_decimal_two_point_five() {
        let result = convert_odds(OddsFormat::Decimal, OddsValue::Number(2.5)).unwrap();
        assert_close(result.american, 150.0, PROPORTION_TOLERANCE);
        assert_close(result.hongkong, 1.5, PROPORTION_TOLERANCE);
        assert_close(result.malay, -0.6667, PROPORTION_TOLERANCE);
        assert_close(result.indonesian, 1.5, PROPORTION_TOLERANCE);
        assert_eq!(result.fractional, "3/2");
        assert_close(result.implied_probability, 0.4, PROPORTION_TOLERANCE);
    }

    #[test]
    fn c3_convert_decimal_one_point_five() {
        let result = convert_odds(OddsFormat::Decimal, OddsValue::Number(1.5)).unwrap();
        assert_close(result.american, -200.0, PROPORTION_TOLERANCE);
        assert_close(result.hongkong, 0.5, PROPORTION_TOLERANCE);
        assert_close(result.malay, 0.5, PROPORTION_TOLERANCE);
        assert_close(result.indonesian, -2.0, PROPORTION_TOLERANCE);
        assert_eq!(result.fractional, "1/2");
        assert_close(result.implied_probability, 0.6667, PROPORTION_TOLERANCE);
    }

    #[test]
    fn c3_convert_decimal_two_boundary() {
        let result = convert_odds(OddsFormat::Decimal, OddsValue::Number(2.0)).unwrap();
        assert_close(result.american, 100.0, PROPORTION_TOLERANCE);
        assert_close(result.malay, 1.0, PROPORTION_TOLERANCE);
        assert_close(result.indonesian, 1.0, PROPORTION_TOLERANCE);
    }

    #[test]
    fn c3_convert_american_negative() {
        let result = convert_odds(OddsFormat::American, OddsValue::Number(-110.0)).unwrap();
        assert_close(result.decimal, 1.909_091, PROPORTION_TOLERANCE);
        assert_close(result.implied_probability, 0.5238, PROPORTION_TOLERANCE);
    }

    #[test]
    fn c3_convert_fractional_text() {
        let result = convert_odds(
            OddsFormat::Fractional,
            OddsValue::Text("3/2".to_string()),
        )
        .unwrap();
        assert_close(result.decimal, 2.5, PROPORTION_TOLERANCE);
    }

    #[test]
    fn c4_vig_three_way_market() {
        let odds = [2.10, 3.40, 3.60];
        let labels = ["主胜".to_string(), "平局".to_string(), "客胜".to_string()];
        let result = calculate_vig(&odds, Some(&labels));
        assert_close(result.overround, 0.048_086, PROPORTION_TOLERANCE);
        assert_eq!(result.overround_percent, "4.81%");
        assert_close(result.outcomes[0].implied, 0.476_190, PROPORTION_TOLERANCE);
        assert_close(
            result.outcomes[0].true_probability,
            0.454_343,
            PROPORTION_TOLERANCE,
        );
        assert_close(result.outcomes[0].fair_odds, 2.2010, PROPORTION_TOLERANCE);
        assert_close(
            result.outcomes[1].true_probability,
            0.280_623,
            PROPORTION_TOLERANCE,
        );
        assert_close(result.outcomes[1].fair_odds, 3.5635, PROPORTION_TOLERANCE);
        assert_close(
            result.outcomes[2].true_probability,
            0.265_034,
            PROPORTION_TOLERANCE,
        );
        assert_close(result.outcomes[2].fair_odds, 3.7731, PROPORTION_TOLERANCE);
    }

    #[test]
    fn c4_vig_arbitrage_market_gets_note() {
        let result = calculate_vig(&[2.2, 2.2], None);
        assert_eq!(result.note.as_deref(), Some("赔率组合存在套利空间"));
    }

    #[test]
    fn c5_ev_positive_case() {
        let result = calculate_ev(2.5, 0.45, 100.0, 100);
        assert_close(result.ev, 12.50, MONEY_TOLERANCE);
        assert_close(result.roi, 0.125, PROPORTION_TOLERANCE);
        assert_close(result.std_dev, 124.37, MONEY_TOLERANCE);
        assert_close(result.long_run.expected_profit, 1250.00, MONEY_TOLERANCE);
        assert_close(result.long_run.std_dev, 1243.73, MONEY_TOLERANCE);
        assert!(result.positive_ev);
    }

    #[test]
    fn c5_ev_negative_case() {
        let result = calculate_ev(2.0, 0.45, 100.0, 100);
        assert_close(result.ev, -10.00, MONEY_TOLERANCE);
        assert!(!result.positive_ev);
    }
}
