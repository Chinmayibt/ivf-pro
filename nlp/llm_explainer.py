import json
import os
import re

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")


def fallback_explanation(data: dict | None = None) -> dict:
    return {
        "summary": "Explanation unavailable",
        "key_drivers": [],
        "positive_factors": [],
        "negative_factors": [],
        "final_guidance": "",
    }


def _normalize_positive_factors(raw) -> list:
    if not isinstance(raw, list):
        return fallback_explanation()["positive_factors"]

    normalized = []
    for item in raw:
        if isinstance(item, dict):
            factor = str(item.get("factor", "")).strip() or "Unspecified positive factor"
            why_it_helps = str(item.get("why_it_helps", "")).strip()
            if not why_it_helps:
                # Backward compatibility for prior key name.
                why_it_helps = str(item.get("why_it_matters", "")).strip()
            if not why_it_helps:
                why_it_helps = "Potentially supportive for IVF success."
            normalized.append({"factor": factor, "why_it_helps": why_it_helps})
        elif isinstance(item, str) and item.strip():
            normalized.append(
                {
                    "factor": item.strip(),
                    "why_it_helps": "This factor may support fertilization, implantation, or pregnancy progression.",
                }
            )
    return normalized or fallback_explanation()["positive_factors"]


def _normalize_negative_factors(raw) -> list:
    if not isinstance(raw, list):
        return fallback_explanation()["negative_factors"]

    normalized = []
    for item in raw:
        if isinstance(item, dict):
            factor = str(item.get("factor", "")).strip() or "Unspecified negative factor"
            severity = str(item.get("severity", "moderate")).strip().lower()
            if severity not in {"high", "moderate", "low"}:
                severity = "moderate"
            why_it_matters = str(item.get("why_it_matters", "")).strip() or "Clinical relevance not provided."
            impact = str(item.get("impact", "")).strip() or "Impact on IVF outcome not specified."
            how_to_improve = item.get("how_to_improve", {})
            if isinstance(how_to_improve, list):
                # backward compatibility with old list output
                how_to_improve = {
                    "short_term": [str(step).strip() for step in how_to_improve if str(step).strip()][:5],
                    "before_next_cycle": [],
                    "clinical_options": [],
                }
            if not isinstance(how_to_improve, dict):
                how_to_improve = {}
            short_term = how_to_improve.get("short_term", [])
            before_next_cycle = how_to_improve.get("before_next_cycle", [])
            clinical_options = how_to_improve.get("clinical_options", [])
            short_term = [str(step).strip() for step in short_term if str(step).strip()] if isinstance(short_term, list) else []
            before_next_cycle = [str(step).strip() for step in before_next_cycle if str(step).strip()] if isinstance(before_next_cycle, list) else []
            clinical_options = [str(step).strip() for step in clinical_options if str(step).strip()] if isinstance(clinical_options, list) else []
            if not short_term:
                short_term = [
                    "Start immediate risk-focused behavior changes tailored to this factor.",
                ]
            if not before_next_cycle:
                before_next_cycle = [
                    "Track objective progress before the next IVF cycle decision.",
                ]
            if not clinical_options:
                clinical_options = [
                    "Review non-prescription clinical planning options relevant to this factor.",
                ]
            normalized.append(
                {
                    "factor": factor,
                    "severity": severity,
                    "why_it_matters": why_it_matters,
                    "impact": impact,
                    "how_to_improve": {
                        "short_term": short_term[:5],
                        "before_next_cycle": before_next_cycle[:5],
                        "clinical_options": clinical_options[:5],
                    },
                }
            )
        elif isinstance(item, str) and item.strip():
            normalized.append(
                {
                    "factor": item.strip(),
                    "severity": "moderate",
                    "why_it_matters": "This factor may reduce the likelihood of IVF success.",
                    "impact": "Potential negative effect on fertilization, implantation, or pregnancy progression.",
                    "how_to_improve": {
                        "short_term": [
                            "Start targeted daily actions linked to this risk factor.",
                        ],
                        "before_next_cycle": [
                            "Set measurable milestones before proceeding to the next cycle.",
                        ],
                        "clinical_options": [
                            "Review general non-prescription clinical options for this risk profile.",
                        ],
                    },
                }
            )

    return normalized or fallback_explanation()["negative_factors"]


def _normalize(explanation: dict) -> dict:
    fallback = fallback_explanation()
    return {
        "summary": str(explanation.get("summary", fallback["summary"])),
        "key_drivers": explanation.get("key_drivers", fallback["key_drivers"])
        if isinstance(explanation.get("key_drivers"), list)
        else fallback["key_drivers"],
        "positive_factors": _normalize_positive_factors(
            explanation.get("positive_factors", fallback["positive_factors"])
        ),
        "negative_factors": _normalize_negative_factors(
            explanation.get("negative_factors", fallback["negative_factors"])
        ),
        "final_guidance": str(explanation.get("final_guidance", fallback["final_guidance"])),
    }


def _parse_llm_json(content: str) -> dict:
    text = (content or "").strip()
    if not text:
        raise ValueError("Empty LLM content")

    # 1) Try direct JSON first.
    try:
        return json.loads(text)
    except Exception:
        pass

    # 2) Try fenced JSON block.
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, flags=re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1).strip())

    # 3) Try first JSON object substring.
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(text[start : end + 1])

    raise ValueError("No JSON object found in LLM response")


def _cached_generate(serialized_data: str) -> dict:
    data = json.loads(serialized_data)

    prompt = f"""

You are a clinical IVF decision-support assistant.

Your job is to provide a DETAILED, PRACTICAL, and medically grounded explanation.

STRICT RULES:
- Do NOT hallucinate new clinical data
- Use ONLY provided features
- Be realistic and balanced
- Avoid absolute guarantees
- Be actionable and helpful

OUTPUT FORMAT (STRICT JSON):

{{
  "summary": "...",
  "key_drivers": ["..."],
  "positive_factors": [
    {{
      "factor": "...",
      "why_it_helps": "..."
    }}
  ],
  "negative_factors": [
    {{
      "factor": "...",
      "severity": "high | moderate | low",
      "why_it_matters": "...",
      "impact": "...",
      "how_to_improve": {{
        "short_term": ["..."],
        "before_next_cycle": ["..."],
        "clinical_options": ["..."]
      }}
    }}
  ],
  "final_guidance": "..."
}}

-------------------------------------

INSTRUCTIONS:

1. Summary:
Give 2–3 lines explaining overall IVF success likelihood.

2. Key Drivers:
Explain the most important factors influencing outcome.

3. Positive Factors:
Explain WHY they help (not just list).

4. Negative Factors (VERY IMPORTANT):
For each negative factor:

1. Assign severity:
- high -> strong impact on IVF success
- moderate -> noticeable but not dominant
- low -> minor impact

2. Provide SPECIFIC, PERSONALIZED improvement steps

Divide into:

- short_term -> immediate actions
- before_next_cycle -> preparation strategies
- clinical_options -> general medical approaches (no prescriptions)

3. DO NOT use generic phrases like:
- "consult doctor"
- "lifestyle optimization"

4. Use patient data:
- BMI -> weight targets
- embryo quality -> lab + antioxidant support
- AMH -> stimulation optimization
- age -> time sensitivity

5. Be practical and actionable

This section must be detailed and useful.

5. Final Guidance:
Short, practical next steps.

-------------------------------------

INPUT:
{data}

"""

    if not GROQ_API_KEY:
        return fallback_explanation(data)

    try:
        client = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        content = response.choices[0].message.content or ""
        content = content.strip()
        content = content.replace("```json", "").replace("```", "")

        try:
            parsed = json.loads(content)
        except Exception:
            # Fallback to robust extractor once before final fallback.
            try:
                parsed = _parse_llm_json(content)
            except Exception:
                parsed = fallback_explanation(data)

        # Required field validation.
        if "negative_factors" not in parsed:
            parsed["negative_factors"] = []

        if not isinstance(parsed.get("negative_factors"), list):
            parsed["negative_factors"] = []

        for item in parsed["negative_factors"]:
            if not isinstance(item, dict):
                continue
            severity = str(item.get("severity", "moderate")).strip().lower()
            if severity not in {"high", "moderate", "low"}:
                severity = "moderate"
            item["severity"] = severity

            how = item.get("how_to_improve", {})
            if not isinstance(how, dict):
                how = {}
            for key in ("short_term", "before_next_cycle", "clinical_options"):
                if key not in how or not isinstance(how.get(key), list):
                    how[key] = []
            item["how_to_improve"] = how

        return _normalize(parsed)
    except Exception:
        return fallback_explanation(data)


def generate_llm_explanation(data: dict) -> dict:
    try:
        serialized = json.dumps(data, sort_keys=True, default=str)
        return _cached_generate(serialized)
    except Exception:
        return fallback_explanation(data)
