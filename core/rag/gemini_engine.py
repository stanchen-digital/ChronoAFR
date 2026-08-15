import os
from pathlib import Path
from typing import List, Optional
from config import GEMINI_API_KEY, PROCESSED_DIR

class GeminiRAGEngine:
    """Gemini API Engine for Multi-Report Financial QA & Comparative Analysis."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or GEMINI_API_KEY
        self._client = None
        if self.api_key:
            try:
                from google import genai
                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"[Gemini] Client init warning: {e}")

    def load_processed_contexts(
        self,
        selected_files: Optional[List[str]] = None,
        filter_keyword: Optional[str] = None
    ) -> str:
        """Load Markdown financial reports as combined context."""
        try:
            from core.parsers.doc_importer import DocumentImporter
            DocumentImporter().import_all_gdrive_documents()
        except Exception as e:
            print(f"[RAG] Document import warning: {e}")

        context_parts = []
        all_files = sorted(PROCESSED_DIR.glob("*.md"), key=os.path.getmtime, reverse=True)

        for filepath in all_files:
            # If user explicitly selected specific files, ONLY load those files!
            if selected_files and len(selected_files) > 0:
                if filepath.name not in selected_files:
                    continue

            # Otherwise check keyword filter
            elif filter_keyword and str(filter_keyword).strip():
                kw = str(filter_keyword).strip().lower()
                if kw not in filepath.name.lower() and kw not in filepath.stem.lower():
                    if not filepath.name.startswith("GDrive_"):
                        continue

            with open(filepath, "r", encoding="utf-8") as f:
                context_parts.append(f"--- Document: {filepath.name} ---\n" + f.read())

        return "\n\n".join(context_parts)

    def query(
        self,
        prompt: str,
        selected_files: Optional[List[str]] = None,
        filter_keyword: Optional[str] = None
    ) -> str:
        """Query Gemini over specified or filtered documents."""
        context = self.load_processed_contexts(
            selected_files=selected_files,
            filter_keyword=filter_keyword
        )

        full_prompt = (
            "你是一位資深的金融分析師與投資研究專家。請根據下方提供的權威財報資料與總經數據，對用戶的問題給出客觀、結構化且深入的分析。\n\n"
            f"=== 權威資料庫背景資料 ===\n{context if context else '(目前本地資料庫尚無特定檔案，請根據一般專業知識回答)'}\n\n"
            f"=== 用戶查詢與分析問題 ===\n{prompt}\n\n"
            "請回答："
        )

        if self._client:
            try:
                response = self._client.models.generate_content(
                    model="gemini-flash-latest",
                    contents=full_prompt
                )
                return response.text
            except Exception as e:
                return f"[Gemini API Call Error]: {e}\n\n(提示：請確認您的 .env 檔案中包含有效的 GEMINI_API_KEY)"
        else:
            return (
                "⚠️ **[尚未設定 GEMINI_API_KEY]**\n\n"
                "系統已成功預載並解析相關財報與總經資料庫。\n"
                "請在專案根目錄的 `.env` 檔案中填入 `GEMINI_API_KEY=您的金鑰`，即可啟用大語言模型 AI 即時問答分析！\n\n"
                f"**準備傳送給 Gemini 的資料庫摘要**:\n{context[:600]}..."
            )
