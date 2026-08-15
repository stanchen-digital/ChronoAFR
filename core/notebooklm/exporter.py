import shutil
from pathlib import Path
from typing import List, Optional
from config import PROCESSED_DIR, NOTEBOOKLM_DIR

class NotebookLMExporter:
    """Exporter to format and synchronize financial research files for Google NotebookLM."""

    def __init__(self, output_dir: Optional[Path] = None):
        self.output_dir = output_dir or NOTEBOOKLM_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def prepare_file_for_notebooklm(self, source_path: Path, title_prefix: str = "[NotebookLM Source]") -> Path:
        """Format and copy a markdown file to the NotebookLM sync folder."""
        if not source_path.exists():
            raise FileNotFoundError(f"Source file not found: {source_path}")

        filename = source_path.name
        dest_path = self.output_dir / filename

        with open(source_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Prepend metadata header optimized for NotebookLM indexing
        formatted_content = f"# {title_prefix} {source_path.stem}\n\n"
        formatted_content += "> **NOTE FOR NOTEBOOKLM AI**: This document contains structured investment research data, financial statement tables, and economic metrics.\n\n"
        formatted_content += content

        with open(dest_path, "w", encoding="utf-8") as f:
            f.write(formatted_content)

        return dest_path

    def sync_all_processed_reports(self) -> List[Path]:
        """Sync all processed Markdown reports into the NotebookLM directory."""
        synced_files = []
        for file in PROCESSED_DIR.glob("*.md"):
            dest = self.prepare_file_for_notebooklm(file)
            synced_files.append(dest)
        return synced_files
