"""AI Assistant service layer using httpx to call LLM APIs with rule-based fallback."""

import logging
import re
from typing import Any
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


def extract_numbers(text: str) -> set[str]:
    """Helper to extract numerical values and percentages from a string."""
    # Find numbers like 1,200, 15.4, 90%, 65000
    pattern = r"\b\d+(?:,\d+)*(?:\.\d+)?%?\b"
    found = re.findall(pattern, text)
    # Normalize strings (remove commas for matching integers)
    normalized = set()
    for val in found:
        val_clean = val.replace(",", "")
        normalized.add(val_clean)
        # Also add raw to be safe
        normalized.add(val)
    return normalized


def validate_groundedness(response_text: str, context_text: str) -> bool:
    """Scan response text to ensure all mentioned numbers are present in the context.

    Prevents hallucination of metrics/percentages.
    """
    resp_nums = extract_numbers(response_text)
    context_nums = extract_numbers(context_text)

    # Allow common small numbers like 1, 2, 3, 30 (default days limit), 0
    allowed_numbers = {"0", "1", "2", "3", "4", "5", "7", "10", "30", "0%"}

    for num in resp_nums:
        if num in allowed_numbers:
            continue
        if num not in context_nums:
            # Check if it matches after removing '%' sign
            if num.endswith("%") and num[:-1] in context_nums:
                continue
            logger.warning("Groundedness Guardrail: Flagged hallucinated number '%s' not present in context.", num)
            return False
    return True


def build_rule_based_chart_explanation(chart_type: str, chart_data: Any) -> str:
    """Build a deterministic, rule-based text summary for a chart (no key fallback)."""
    if not chart_data:
        return "No data was provided to explain this chart."

    try:
        if isinstance(chart_data, dict):
            # Probably a list of items inside a dictionary
            items = list(chart_data.values())[0] if chart_data else []
        else:
            items = chart_data

        if not isinstance(items, list) or len(items) == 0:
            return f"Chart of type {chart_type} contains structured data parameters."

        # Describe series
        total_rev = 0.0
        max_val = -1.0
        max_label = ""
        min_val = 9999999999.0
        min_label = ""

        # Guess columns based on first item keys
        first = items[0]
        val_key = None
        lbl_key = None

        for k, v in first.items():
            if isinstance(v, (int, float)):
                val_key = k
            elif isinstance(v, str):
                lbl_key = k

        if not val_key:
            return f"Provided data has {len(items)} items representing historical counts."

        for item in items:
            val = float(item[val_key])
            lbl = str(item.get(lbl_key, "Item"))
            total_rev += val
            if val > max_val:
                max_val = val
                max_label = lbl
            if val < min_val:
                min_val = val
                min_label = lbl

        mean_val = total_rev / len(items)

        desc = (
            f"Rule-Based Analytics: This {chart_type} visualizes {len(items)} data points. "
            f"The dataset reaches a peak value of {max_val:,.2f} associated with '{max_label}' "
            f"and a minimum value of {min_val:,.2f} under '{min_label}'. "
            f"The overall average value across the series stands at {mean_val:,.2f}."
        )
        return desc
    except Exception as exc:
        logger.error("Failed to generate rule-based chart explanation: %s", exc)
        return "Explanation unavailable. Chart contains valid sales data series."


def build_rule_based_dashboard_summary(
    kpis: dict, trend: list, categories: list, regions: list
) -> str:
    """Build a deterministic summary of dashboard sales highlights (no key fallback)."""
    try:
        rev = kpis.get("revenue", {})
        rev_val = rev.get("value", 0.0)
        rev_pct = rev.get("percentage_change", 0.0)
        meaning = rev.get("business_meaning", "")

        top_cat = categories[0]["category"] if categories else "N/A"
        top_cat_rev = categories[0]["revenue"] if categories else 0.0
        top_reg = regions[0]["region"] if regions else "N/A"

        summary = (
            f"Executive Summary: Total aggregated sales revenue stands at ${rev_val:,.2f}, representing "
            f"a change of {rev_pct}% compared to the previous period. The sales dashboard metrics indicate "
            f"that Category '{top_cat}' is the leading revenue driver, contributing ${top_cat_rev:,.2f} to date. "
            f"Regional aggregates show '{top_reg}' is currently the top performing region. {meaning}"
        )
        return summary
    except Exception as exc:
        logger.error("Failed to generate rule-based summary: %s", exc)
        return "Executive summary unavailable. Please check that dataset mapping is correct."


async def call_llm(system_prompt: str, prompt: str) -> str:
    """Route LLM requests using httpx to available API keys (OpenRouter, Gemini, OpenAI, Anthropic)."""
    timeout = 5.0  # Strict timeout guardrail

    # 0. OpenRouter integration
    if settings.OPENROUTER_API_KEY:
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "EDIP",
        }
        payload = {
            "model": "google/gemini-2.5-flash",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(url, json=payload, headers=headers)
            res.raise_for_status()
            data = res.json()
            return str(data["choices"][0]["message"]["content"]).strip()

    # 1. Google Gemini integration
    if settings.GEMINI_API_KEY:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": f"System Guidelines: {system_prompt}\n\nUser Request: {prompt}"
                        }
                    ]
                }
            ],
            "generationConfig": {"temperature": 0.1},
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(url, json=payload)
            res.raise_for_status()
            data = res.json()
            return str(data["candidates"][0]["content"]["parts"][0]["text"]).strip()

    # 2. OpenAI integration
    if settings.OPENAI_API_KEY:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(url, json=payload, headers=headers)
            res.raise_for_status()
            data = res.json()
            return str(data["choices"][0]["message"]["content"]).strip()

    # 3. Anthropic integration
    if settings.ANTHROPIC_API_KEY:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": settings.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": "claude-3-5-sonnet-20240620",
            "max_tokens": 500,
            "messages": [{"role": "user", "content": f"{system_prompt}\n\n{prompt}"}],
            "temperature": 0.1,
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(url, json=payload, headers=headers)
            res.raise_for_status()
            data = res.json()
            return str(data["content"][0]["text"]).strip()

    raise ValueError("No LLM API keys configured.")


async def explain_chart_service(chart_type: str, chart_data: Any) -> str:
    """Assemble context, call LLM, and validate groundedness to explain a chart."""
    context_str = f"Chart Type: {chart_type}\nData values: {chart_data}"

    # Fallback if no keys
    if not (settings.GEMINI_API_KEY or settings.OPENAI_API_KEY or settings.ANTHROPIC_API_KEY or settings.OPENROUTER_API_KEY):
        return build_rule_based_chart_explanation(chart_type, chart_data)

    system_prompt = (
        "You are an expert business intelligence assistant. Propose a brief, plain-language business explanation "
        "of the chart based ONLY on the data values provided. Guidelines:\n"
        "- Do NOT invent or assume any figures, trends, or facts not present in the data values.\n"
        "- Do NOT use percentages or numbers unless they appear in the data values.\n"
        "- Keep it concise (1-2 sentences maximum).\n"
        "- If the chart data is empty or cannot be explained, state 'Data is unavailable' rather than guessing."
    )

    try:
        explanation = await call_llm(system_prompt, context_str)
        # Apply guardrail check
        if validate_groundedness(explanation, context_str):
            return explanation
        else:
            logger.warning("LLM response failed numbers verification. Using fallback.")
            return build_rule_based_chart_explanation(chart_type, chart_data)
    except Exception as exc:
        logger.exception("AI assistant call failed for explain_chart. Fallback to rule-based.")
        return build_rule_based_chart_explanation(chart_type, chart_data)


async def summarize_dashboard_service(
    kpis: dict, trend: list, categories: list, regions: list
) -> str:
    """Assemble context, call LLM, and validate groundedness to summarize a sales dashboard."""
    context_str = (
        f"KPI Metrics: {kpis}\n"
        f"Granular Revenue Trend: {trend[:10]} (showing first 10 rows)\n"
        f"Top Categories: {categories}\n"
        f"Regions Performance: {regions}"
    )

    # Fallback if no keys
    if not (settings.GEMINI_API_KEY or settings.OPENAI_API_KEY or settings.ANTHROPIC_API_KEY or settings.OPENROUTER_API_KEY):
        return build_rule_based_dashboard_summary(kpis, trend, categories, regions)

    system_prompt = (
        "You are an executive assistant summarizing a Sales Dashboard. Return a concise, single-paragraph summary of "
        "sales performance. Guidelines:\n"
        "- Use ONLY numbers and facts provided in the KPI Metrics, Trend, Categories, or Regions context.\n"
        "- Do NOT assume other categories, regions, or figures exist.\n"
        "- Identify the top performing categories or regions exactly as they appear in the context.\n"
        "- Keep it professional, factual, and strictly under 4 sentences.\n"
        "- If you cannot summarize, say 'Executive summary unavailable'."
    )

    try:
        summary = await call_llm(system_prompt, context_str)
        # Apply guardrail check
        if validate_groundedness(summary, context_str):
            return summary
        else:
            logger.warning("LLM summary response failed numbers verification. Using fallback.")
            return build_rule_based_dashboard_summary(kpis, trend, categories, regions)
    except Exception as exc:
        logger.exception("AI assistant call failed for summarize_dashboard. Fallback to rule-based.")
        return build_rule_based_dashboard_summary(kpis, trend, categories, regions)
