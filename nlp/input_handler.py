"""
Input handling: PDF, plain text files, or raw strings → cleaned text for NLP.
"""
from __future__ import annotations

import os

import pdfplumber


def extract_text_from_pdf(file_path: str) -> str:
    """
    Open a PDF with pdfplumber, extract text from every page, join into one string.
    Returns empty string if the file is missing, unreadable, or has no extractable text.
    """
    if not os.path.isfile(file_path):
        print(f"Error: file not found: {file_path}")
        return ""

    parts: list[str] = []
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    parts.append(page_text)
    except Exception as exc:
        print(f"Error reading PDF ({file_path}): {exc}")
        return ""

    joined = "\n".join(parts)
    if not joined.strip():
        return ""
    return joined


def extract_text_from_txt(file_path: str) -> str:
    """Read a UTF-8 text file; unknown bytes are replaced so read never crashes."""
    if not os.path.isfile(file_path):
        print(f"Error: file not found: {file_path}")
        return ""

    with open(file_path, encoding="utf-8", errors="replace") as f:
        return f.read()


def clean_text(text: str) -> str:
    """Collapse whitespace: extra spaces and newline runs become a single space."""
    if not text:
        return ""
    return " ".join(text.split())


def get_input(source: str) -> str:
    """
    Normalize input to cleaned plain text.

    - Path ending in .pdf → PDF extraction
    - Path ending in .txt → text file read
    - Anything else → treat ``source`` as raw text
    """
    if source is None:
        return ""

    s = source.strip()
    if not s:
        return ""

    if s.lower().endswith(".pdf"):
        raw = extract_text_from_pdf(s)
        return clean_text(raw)

    if s.lower().endswith(".txt"):
        raw = extract_text_from_txt(s)
        return clean_text(raw)

    return clean_text(s)


if __name__ == "__main__":
    # Direct string input
    sample = "Patient aged 34   with PCOS.\n\n\nIVF cycle discussed."
    print("--- sample string ---")
    print(get_input(sample))
    print()

    # Optional: PDF path (set to a real file under the project to test)
    sample_pdf = os.path.join(
        os.path.dirname(__file__), "..", "data", "raw", "sample_report.pdf"
    )
    sample_pdf = os.path.normpath(sample_pdf)
    print("--- optional PDF ---")
    if os.path.isfile(sample_pdf):
        print(get_input(sample_pdf))
    else:
        print(f"(skip) no file at {sample_pdf}")
