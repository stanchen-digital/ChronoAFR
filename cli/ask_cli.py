import argparse
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.rag.gemini_engine import GeminiRAGEngine

def main():
    parser = argparse.ArgumentParser(description="投資資料庫 AI 問答分析 CLI 工具")
    parser.add_argument("--query", type=str, default="請分析 NVDA 與台積電 (2330) 在當前聯準會利率環境下的營運優劣勢與風險。", help="欲查詢的問題")
    parser.add_argument("--ticker", type=str, default=None, help="過濾特定的股票或主題檔案")

    args = parser.parse_args()

    print("==================================================")
    print("🧠 Gemini AI 財報與總經問答分析 CLI")
    print("==================================================")
    print(f"\n[問題]: {args.query}\n")

    engine = GeminiRAGEngine()
    answer = engine.query(args.query, filter_keyword=args.ticker)

    print("--------------------------------------------------")
    print("[AI 回答]:\n")
    print(answer)
    print("--------------------------------------------------")

if __name__ == "__main__":
    main()
