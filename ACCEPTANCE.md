# 验收清单：博彩决策助手

> 验收人按本文档逐项执行。**任何一项不通过即返工**，返工后重新走完整清单。
> 数值容差：概率/比例类 `1e-4`，金额类 `±0.01`，组合凯利收敛值 `±0.002`。

## A. 工程质量（一票否决项）

- [ ] A1 `cargo build --release` 成功，产物为单个可执行文件（Windows 下 `server.exe` 或等价命名）
- [ ] A2 `cargo test --workspace` 全部通过，且 `crates/core` 的测试覆盖本文 C 节全部数值向量（测试代码里能找到这些数字）
- [ ] A3 `cargo clippy --workspace --all-targets -- -D warnings` 零警告
- [ ] A4 `cargo fmt --check` 通过
- [ ] A5 计算逻辑全部位于 `crates/core`，`server` 内无公式实现（人工 review）
- [ ] A6 无数据库依赖、无 HTTP 客户端依赖、前端无 CDN 外链（检查 Cargo.toml 与 index.html）

## B. 服务行为

- [ ] B1 直接运行产物，终端打印 `博彩决策助手已启动：http://127.0.0.1:8787`
- [ ] B2 浏览器打开 `http://127.0.0.1:8787` 能看到 5 个 Tab 的中文界面
- [ ] B3 `PORT=9000` 启动时监听 9000
- [ ] B4 非法输入返回 HTTP 422 + 中文 error，例如：
  ```
  curl -s -X POST localhost:8787/api/kelly -H "Content-Type: application/json" -d '{"odds":2.5,"p":1.5,"bankroll":1000,"fraction":0.5}'
  → 422，body 含「胜率」相关中文错误
  ```
  同样验证 `odds=0.9`（赔率非法）、`bankroll=-5`（本金非法）、组合凯利传 11 场（超限）。

## C. 数值验收向量（curl 逐条打，与手算基准核对）

### C1 凯利 `/api/kelly`
| 输入 | 期望输出 |
|---|---|
| odds=2.5, p=0.5, bankroll=1000, fraction=0.5 | edge=0.25, kelly_fraction=0.166667, stake=83.33, should_bet=true |
| odds=2.5, p=0.5, bankroll=1000, fraction=1.0 | stake=166.67 |
| odds=1.8, p=0.5, bankroll=1000, fraction=0.5 | kelly_fraction=−0.125（或报告 edge=−0.1），**stake=0, should_bet=false**，verdict 含「不该下」 |
| odds=2.0, p=0.5（临界零优势） | stake=0, should_bet=false |

### C2 组合凯利 `/api/kelly/multi`
| 输入 | 期望输出 |
|---|---|
| 单场 [odds=2.5, p=0.5], bankroll=1000, fraction=1.0 | 与 C1 一致：fraction≈0.1667, stake≈166.67 |
| 两场相同 [odds=2.5, p=0.5] × 2 | 对称：两场 fᵢ 相等，且每场 ≈ **0.1609**（低于单注的 0.1667） |
| 两场其一无优势 [odds=2.5, p=0.5] + [odds=1.8, p=0.5] | 第二场 fᵢ=0；第一场 ≈ 0.1667 |
| 性质 | 每场 fᵢ ≤ 该场 naive_kelly；Σfᵢ ≤ Σnaive_kelly |

### C3 赔率转换 `/api/odds/convert`
| 输入 | 期望输出 |
|---|---|
| value=2.5, format=decimal | american=150, hongkong=1.5, malay=−0.6667, indonesian=1.5, fractional="3/2", implied_probability=0.4 |
| value=1.5, format=decimal | american=−200, hongkong=0.5, malay=0.5, indonesian=−2.0, fractional="1/2", implied_probability=0.6667 |
| value=2.0, format=decimal | american=100, malay=1.0, indonesian=1.0 |
| value=−110, format=american | decimal=1.909091, implied_probability=0.5238 |
| value="3/2", format=fractional | decimal=2.5 |

### C4 去水 `/api/vig`
输入 odds=[2.10, 3.40, 3.60]：
- overround = 0.048086（4.81%）
- 主胜：implied=0.476190, true_probability=0.454343, fair_odds=2.2010
- 平局：true_probability=0.280623, fair_odds=3.5635
- 客胜：true_probability=0.265034, fair_odds=3.7731

输入 odds=[2.2, 2.2]（Σq=0.909<1）：正常返回且带套利提示 note。

### C5 期望值 `/api/ev`
输入 odds=2.5, p=0.45, stake=100, n=100：
- ev=12.50, roi=0.125, std_dev=124.37
- long_run.expected_profit=1250.00, long_run.std_dev=1243.73, positive_ev=true

输入 odds=2.0, p=0.45, stake=100：ev=−10.00, positive_ev=false。

## D. 前端人工验收

- [ ] D1 5 个 Tab 均可切换且对应功能可用，文案全中文
- [ ] D2 凯利 Tab：输入 C1 第 1 行数据，界面显示绿色「有优势」卡片与 83.33；输入第 3 行数据显示红色「不该下」且金额为 0
- [ ] D3 组合凯利 Tab：能加到 10 行、删到 1 行，第 11 行加不上或有提示
- [ ] D4 非法输入（如胜率填 1.5）：错误的中文提示显示在表单下方，无 alert 弹窗
- [ ] D5 浏览器窗口缩到 400px 宽：无横向滚动条，按钮和输入框可正常操作
- [ ] D6 页脚存在免责声明（REQUIREMENTS.md 第 4 节指定文案）

## E. 验收产出

验收人（Claude）执行完 A–E 后输出验收报告：逐项 ✅/❌，❌ 项附复现命令与期望/实际值，交 Codex 返工。全部 ✅ 后本期 MVP 关闭。
