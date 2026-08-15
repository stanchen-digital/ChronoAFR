import json
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional
from pathlib import Path
from config import FORECAST_DIR

@dataclass
class RevenueSegmentInput:
    name: str
    base_amount: float           # Base year revenue for this segment ($M)
    share_pct: float             # Percentage of total base revenue (%)
    growth_y1: float             # Y1 Growth rate (can be negative, e.g. -0.15 = -15%)
    growth_y2: float = 0.15      # Y2 Growth rate
    growth_y3: float = 0.10      # Y3 Growth rate

@dataclass
class CogsSegmentInput:
    name: str                    # e.g. "電商履約與物流成本", "AWS 資料中心營運成本"
    base_amount: float           # Base year COGS ($M)
    ratio_pct: float             # % of Total Revenue
    growth_y1: float = 0.10      # Y1 Growth rate (can be negative or surge)

@dataclass
class OpExSegmentInput:
    name: str                    # e.g., "研發費用 (R&D)", "銷售與行銷 (S&M)", "管理費用 (G&A)"
    base_amount: float           # Base year amount ($M)
    ratio_pct: float             # % of Total Revenue
    growth_y1: float = 0.10      # Y1 Growth rate (can be negative during cost-cutting)

@dataclass
class ForecastAssumptions:
    ticker: str
    base_year: int
    base_revenue: float                          # Total Base Revenue ($M)
    revenue_segments: List[Dict[str, Any]] = field(default_factory=list) # Detailed Revenue Segment Breakdown
    cogs_segments: List[Dict[str, Any]] = field(default_factory=list)    # Detailed COGS Segment Breakdown
    gross_margin: float = 0.485                  # Fallback Gross Margin if cogs_segments is empty
    opex_segments: List[Dict[str, Any]] = field(default_factory=list)    # Detailed OpEx Breakdown (R&D, S&M, G&A)
    tax_rate: float = 0.21                       # Tax Rate (21%)
    fcf_conversion_rate: float = 0.90            # Net Income to FCF conversion ratio
    wacc: float = 0.09                           # WACC (9%)
    terminal_growth_rate: float = 0.035          # Terminal Growth (3.5%)

    # Valuation & P/E Band Parameters
    current_price: float = 185.0                 # Current Stock Price ($ / NT$)
    shares_outstanding: float = 10400.0          # Shares Outstanding (Millions)
    historical_pe_avg: float = 35.0              # Historical Average P/E Ratio
    historical_pe_min: float = 20.0              # Historical Minimum P/E Ratio
    historical_pe_max: float = 45.0              # Historical Maximum P/E Ratio

    # Legacy fields for backward compatibility
    revenue_growth_y1: float = 0.25
    revenue_growth_y2: float = 0.18
    revenue_growth_y3: float = 0.12
    op_margin: float = 0.35

class ProFormaModel:
    """Pro-Forma Financial Projection & DCF / P/E / P/S Valuation Model supporting Negative Growth & Loss Periods."""

    def __init__(self, assumptions: ForecastAssumptions):
        self.assumptions = assumptions

    def generate_projections(self) -> Dict[str, Any]:
        a = self.assumptions

        # Revenue Projections (supports positive & negative growth)
        has_segments = len(a.revenue_segments) > 0
        segments_y1, segments_y2, segments_y3 = [], [], []
        tot_rev_y1, tot_rev_y2, tot_rev_y3 = 0.0, 0.0, 0.0

        if has_segments:
            for seg in a.revenue_segments:
                b_amt = float(seg.get("base_amount", 0.0))
                g1 = float(seg.get("growth_y1", a.revenue_growth_y1))
                g2 = float(seg.get("growth_y2", a.revenue_growth_y2))
                g3 = float(seg.get("growth_y3", a.revenue_growth_y3))

                rev_y1 = max(0.0, b_amt * (1.0 + g1))
                rev_y2 = max(0.0, rev_y1 * (1.0 + g2))
                rev_y3 = max(0.0, rev_y2 * (1.0 + g3))

                tot_rev_y1 += rev_y1
                tot_rev_y2 += rev_y2
                tot_rev_y3 += rev_y3

                segments_y1.append({"name": seg.get("name"), "revenue": round(rev_y1, 2), "growth": g1})
                segments_y2.append({"name": seg.get("name"), "revenue": round(rev_y2, 2), "growth": g2})
                segments_y3.append({"name": seg.get("name"), "revenue": round(rev_y3, 2), "growth": g3})
        else:
            tot_rev_y1 = max(0.0, a.base_revenue * (1.0 + a.revenue_growth_y1))
            tot_rev_y2 = max(0.0, tot_rev_y1 * (1.0 + a.revenue_growth_y2))
            tot_rev_y3 = max(0.0, tot_rev_y2 * (1.0 + a.revenue_growth_y3))

        # COGS Projections
        has_cogs = len(a.cogs_segments) > 0
        tot_cogs_y1, tot_cogs_y2, tot_cogs_y3 = 0.0, 0.0, 0.0
        cogs_details_y1 = []

        if has_cogs:
            for cg in a.cogs_segments:
                b_amt = float(cg.get("base_amount", 0.0))
                g1 = float(cg.get("growth_y1", 0.10))
                g2 = g1 * 0.8 if g1 > 0 else g1 * 0.5
                g3 = g1 * 0.65 if g1 > 0 else 0.05

                cogs_item_y1 = max(0.0, b_amt * (1.0 + g1))
                cogs_item_y2 = max(0.0, cogs_item_y1 * (1.0 + g2))
                cogs_item_y3 = max(0.0, cogs_item_y2 * (1.0 + g3))

                tot_cogs_y1 += cogs_item_y1
                tot_cogs_y2 += cogs_item_y2
                tot_cogs_y3 += cogs_item_y3

                cogs_details_y1.append({"name": cg.get("name"), "cogs": round(cogs_item_y1, 2), "growth": g1})
        else:
            tot_cogs_y1 = tot_rev_y1 * (1.0 - a.gross_margin)
            tot_cogs_y2 = tot_rev_y2 * (1.0 - a.gross_margin)
            tot_cogs_y3 = tot_rev_y3 * (1.0 - a.gross_margin)

        gp_y1 = tot_rev_y1 - tot_cogs_y1
        gp_y2 = tot_rev_y2 - tot_cogs_y2
        gp_y3 = tot_rev_y3 - tot_cogs_y3

        gm_calc_y1 = gp_y1 / tot_rev_y1 if tot_rev_y1 > 0 else a.gross_margin
        gm_calc_y2 = gp_y2 / tot_rev_y2 if tot_rev_y2 > 0 else a.gross_margin
        gm_calc_y3 = gp_y3 / tot_rev_y3 if tot_rev_y3 > 0 else a.gross_margin

        # OpEx Projections
        has_opex = len(a.opex_segments) > 0
        tot_opex_y1, tot_opex_y2, tot_opex_y3 = 0.0, 0.0, 0.0
        opex_details_y1 = []

        if has_opex:
            for op in a.opex_segments:
                ratio = float(op.get("ratio_pct", 0.10))
                amt_y1 = tot_rev_y1 * ratio
                amt_y2 = tot_rev_y2 * ratio
                amt_y3 = tot_rev_y3 * ratio

                tot_opex_y1 += amt_y1
                tot_opex_y2 += amt_y2
                tot_opex_y3 += amt_y3

                opex_details_y1.append({"name": op.get("name"), "amount": round(amt_y1, 2), "ratio": ratio})
        else:
            tot_opex_y1 = tot_rev_y1 * max(0.05, a.gross_margin - a.op_margin)
            tot_opex_y2 = tot_rev_y2 * max(0.05, a.gross_margin - a.op_margin)
            tot_opex_y3 = tot_rev_y3 * max(0.05, a.gross_margin - a.op_margin)

        # Operating Income (EBIT) - can be negative
        op_inc_y1 = gp_y1 - tot_opex_y1
        op_inc_y2 = gp_y2 - tot_opex_y2
        op_inc_y3 = gp_y3 - tot_opex_y3

        op_margin_calc_y1 = op_inc_y1 / tot_rev_y1 if tot_rev_y1 > 0 else 0.0
        op_margin_calc_y2 = op_inc_y2 / tot_rev_y2 if tot_rev_y2 > 0 else 0.0
        op_margin_calc_y3 = op_inc_y3 / tot_rev_y3 if tot_rev_y3 > 0 else 0.0

        # Tax (Only tax positive income; tax benefit / zero tax for loss)
        tax_y1 = op_inc_y1 * a.tax_rate if op_inc_y1 > 0 else 0.0
        tax_y2 = op_inc_y2 * a.tax_rate if op_inc_y2 > 0 else 0.0
        tax_y3 = op_inc_y3 * a.tax_rate if op_inc_y3 > 0 else 0.0

        net_inc_y1 = op_inc_y1 - tax_y1
        net_inc_y2 = op_inc_y2 - tax_y2
        net_inc_y3 = op_inc_y3 - tax_y3

        fcf_y1 = net_inc_y1 * a.fcf_conversion_rate
        fcf_y2 = net_inc_y2 * a.fcf_conversion_rate
        fcf_y3 = net_inc_y3 * a.fcf_conversion_rate

        # EPS & P/E / P/S Valuation Engine
        shares = max(1.0, a.shares_outstanding)
        eps_y1 = net_inc_y1 / shares
        eps_y2 = net_inc_y2 / shares
        eps_y3 = net_inc_y3 / shares

        # P/S Ratio (Price to Sales) as institutional backup for loss periods
        rev_per_share_y1 = tot_rev_y1 / shares if shares > 0 else 1.0
        fwd_ps_y1 = a.current_price / rev_per_share_y1 if rev_per_share_y1 > 0 else 0.0

        # Standard P/E (None / N/A when EPS <= 0)
        fwd_pe_y1 = round(a.current_price / eps_y1, 2) if eps_y1 > 0 else None
        fwd_pe_y2 = round(a.current_price / eps_y2, 2) if eps_y2 > 0 else None
        fwd_pe_y3 = round(a.current_price / eps_y3, 2) if eps_y3 > 0 else None

        # Turnaround & Target Price Derivations
        is_loss_y1 = eps_y1 <= 0
        if not is_loss_y1:
            # Standard Profit Valuation
            target_price_y1 = round(eps_y1 * a.historical_pe_avg, 2)
            upside_y1 = round(((target_price_y1 - a.current_price) / a.current_price) * 100.0, 1) if a.current_price > 0 else 0.0

            if fwd_pe_y1 <= a.historical_pe_min:
                timing_signal = "🟢 極度低估 / 強力買進區間 (Deeply Undervalued)"
                timing_desc = f"前瞻 {a.base_year+1}E P/E ({fwd_pe_y1:.2f}x) 已觸及歷史底部區間 ({a.historical_pe_min:.1f}x)，安全邊際極高！"
            elif fwd_pe_y1 <= a.historical_pe_avg:
                timing_signal = "🟢 具安全邊際 / 最佳切入時機 (Buying Opportunity)"
                timing_desc = f"前瞻 {a.base_year+1}E P/E ({fwd_pe_y1:.2f}x) 顯著低於歷史平均 ({a.historical_pe_avg:.1f}x)，建議逢低分批佈局！"
            elif fwd_pe_y1 <= a.historical_pe_max:
                timing_signal = "🟡 估值合理 / 建議逢低分批佈局 (Fair Value)"
                timing_desc = f"前瞻 {a.base_year+1}E P/E ({fwd_pe_y1:.2f}x) 處於歷史合理區間 ({a.historical_pe_avg:.1f}x ~ {a.historical_pe_max:.1f}x)。"
            else:
                timing_signal = "🔴 前瞻 P/E 偏高 / 靜待拉回 (Overvalued)"
                timing_desc = f"前瞻 {a.base_year+1}E P/E ({fwd_pe_y1:.2f}x) 超過歷史高點區間 ({a.historical_pe_max:.1f}x)，溢價偏高，建議靜待拉回。"
        else:
            # Loss Period Analysis
            if eps_y2 > 0:
                # Turnaround in Year 2
                disc_target = (eps_y2 * a.historical_pe_avg) / (1 + a.wacc)
                target_price_y1 = round(disc_target, 2)
                upside_y1 = round(((target_price_y1 - a.current_price) / a.current_price) * 100.0, 1) if a.current_price > 0 else 0.0
                timing_signal = f"🟡 轉機型機會 (Turnaround) / 預估 {a.base_year+2} 年轉虧為盈"
                timing_desc = f"{a.base_year+1}E 處於逆風虧損期 (EPS -${abs(eps_y1):.2f})，P/E 顯示 N/A；預計 {a.base_year+2}E 轉虧為盈 (EPS ${eps_y2:.2f})，折現目標價 ${target_price_y1}！"
            elif eps_y3 > 0:
                # Turnaround in Year 3
                disc_target = (eps_y3 * a.historical_pe_avg) / ((1 + a.wacc)**2)
                target_price_y1 = round(disc_target, 2)
                upside_y1 = round(((target_price_y1 - a.current_price) / a.current_price) * 100.0, 1) if a.current_price > 0 else 0.0
                timing_signal = f"🟡 深度週期轉機 (Turnaround) / 預估 {a.base_year+3} 年轉虧為盈"
                timing_desc = f"預計 {a.base_year+1}~{a.base_year+2} 年處於深度去庫存期，{a.base_year+3}E 獲利反轉 (EPS ${eps_y3:.2f})，折現目標價 ${target_price_y1}！"
            else:
                # Continuous Loss
                target_price_y1 = 0.0
                upside_y1 = 0.0
                timing_signal = "🔴 營運處於嚴重虧損期 / 建議保守觀望 (Loss-Making)"
                timing_desc = f"未來 3 年持續每股虧損，P/E 不適用 (N/A)，前瞻 P/S 市銷率為 {fwd_ps_y1:.2f}x，建議參考下方 DCF 企業價值底層防禦力。"

        y1_g = (tot_rev_y1 - a.base_revenue) / a.base_revenue if a.base_revenue > 0 else a.revenue_growth_y1

        projections = [
            {
                "Year": a.base_year + 1,
                "RevenueGrowth": round(y1_g, 4),
                "Revenue": round(tot_rev_y1, 2),
                "COGS": round(tot_cogs_y1, 2),
                "GrossProfit": round(gp_y1, 2),
                "GrossMargin": round(gm_calc_y1, 4),
                "TotalOpEx": round(tot_opex_y1, 2),
                "OperatingIncome": round(op_inc_y1, 2),
                "OperatingMargin": round(op_margin_calc_y1, 4),
                "Tax": round(tax_y1, 2),
                "NetIncome": round(net_inc_y1, 2),
                "FreeCashFlow": round(fcf_y1, 2),
                "EPS": round(eps_y1, 2),
                "ForwardPE": fwd_pe_y1,
                "ForwardPS": round(fwd_ps_y1, 2),
                "TargetPrice": target_price_y1,
                "UpsidePct": upside_y1,
                "IsLoss": is_loss_y1,
                "Segments": segments_y1,
                "CogsDetails": cogs_details_y1,
                "OpExDetails": opex_details_y1
            },
            {
                "Year": a.base_year + 2,
                "RevenueGrowth": round(a.revenue_growth_y2, 4),
                "Revenue": round(tot_rev_y2, 2),
                "COGS": round(tot_cogs_y2, 2),
                "GrossProfit": round(gp_y2, 2),
                "GrossMargin": round(gm_calc_y2, 4),
                "TotalOpEx": round(tot_opex_y2, 2),
                "OperatingIncome": round(op_inc_y2, 2),
                "OperatingMargin": round(op_margin_calc_y2, 4),
                "Tax": round(tax_y2, 2),
                "NetIncome": round(net_inc_y2, 2),
                "FreeCashFlow": round(fcf_y2, 2),
                "EPS": round(eps_y2, 2),
                "ForwardPE": fwd_pe_y2,
                "IsLoss": eps_y2 <= 0,
                "Segments": segments_y2
            },
            {
                "Year": a.base_year + 3,
                "RevenueGrowth": round(a.revenue_growth_y3, 4),
                "Revenue": round(tot_rev_y3, 2),
                "COGS": round(tot_cogs_y3, 2),
                "GrossProfit": round(gp_y3, 2),
                "GrossMargin": round(gm_calc_y3, 4),
                "TotalOpEx": round(tot_opex_y3, 2),
                "OperatingIncome": round(op_inc_y3, 2),
                "OperatingMargin": round(op_margin_calc_y3, 4),
                "Tax": round(tax_y3, 2),
                "NetIncome": round(net_inc_y3, 2),
                "FreeCashFlow": round(fcf_y3, 2),
                "EPS": round(eps_y3, 2),
                "ForwardPE": fwd_pe_y3,
                "IsLoss": eps_y3 <= 0,
                "Segments": segments_y3
            }
        ]

        # DCF Valuation
        pv_fcf = (
            fcf_y1 / (1 + a.wacc)**1 +
            fcf_y2 / (1 + a.wacc)**2 +
            fcf_y3 / (1 + a.wacc)**3
        )

        terminal_value = (fcf_y3 * (1 + a.terminal_growth_rate)) / (a.wacc - a.terminal_growth_rate) if (a.wacc > a.terminal_growth_rate and fcf_y3 > 0) else 0
        pv_terminal_value = terminal_value / (1 + a.wacc)**3
        implied_enterprise_value = pv_fcf + pv_terminal_value

        return {
            "Ticker": a.ticker,
            "Assumptions": asdict(a),
            "Projections": projections,
            "DCF_Valuation": {
                "PV_Explicit_FCF": round(pv_fcf, 2),
                "TerminalValue": round(terminal_value, 2),
                "PV_TerminalValue": round(pv_terminal_value, 2),
                "ImpliedEnterpriseValue": round(implied_enterprise_value, 2)
            },
            "PE_Valuation_Diagnostics": {
                "CurrentPrice": a.current_price,
                "SharesOutstanding": a.shares_outstanding,
                "HistoricalPeAvg": a.historical_pe_avg,
                "HistoricalPeMin": a.historical_pe_min,
                "HistoricalPeMax": a.historical_pe_max,
                "ProjectedEPS_Y1": round(eps_y1, 2),
                "ProjectedEPS_Y2": round(eps_y2, 2),
                "ProjectedEPS_Y3": round(eps_y3, 2),
                "ForwardPE_Y1": fwd_pe_y1,
                "ForwardPE_Y2": fwd_pe_y2,
                "ForwardPE_Y3": fwd_pe_y3,
                "ForwardPS_Y1": round(fwd_ps_y1, 2),
                "TargetPrice_Y1": target_price_y1,
                "UpsidePct_Y1": upside_y1,
                "IsLoss_Y1": is_loss_y1,
                "TimingSignal": timing_signal,
                "TimingDesc": timing_desc
            }
        }

    def save_projection_file(self, filename_suffix: str = "base") -> Path:
        data = self.generate_projections()
        out_path = FORECAST_DIR / f"{self.assumptions.ticker}_forecast_{filename_suffix}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return out_path
