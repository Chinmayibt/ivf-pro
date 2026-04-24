import json
import re


# ---------- LOAD FILE ----------
def load_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# ---------- NORMALIZE TEXT ----------
def normalize_text(text):
    # unify all dashed separators
    text = re.sub(r"-{5,}", "<<<SPLIT>>>", text)

    # fix cases like "12.\nAbstract"
    text = re.sub(r"(\d+)\.\s*\n\s*Abstract", r"\1.Abstract", text, flags=re.IGNORECASE)

    # fix cases like "51Abstract"
    text = re.sub(r"(\d+)\s*Abstract", r"\1.Abstract", text, flags=re.IGNORECASE)

    return text


# ---------- EXTRACT ABSTRACTS ----------
def extract_abstracts(text):
    parts = text.split("<<<SPLIT>>>")

    abstracts = []
    aid = 0

    for part in parts:
        part = part.strip()

        # Must contain numbered abstract
        if re.match(r"^\d+\.?Abstract", part, re.IGNORECASE):
            cleaned = re.sub(r"^\d+\.?\s*Abstract[:\s]*", "", part, flags=re.IGNORECASE).strip()

            if len(cleaned) > 100:
                abstracts.append({
                    "id": aid,
                    "text": cleaned
                })
                aid += 1

    return abstracts


# ---------- EXTRACT PATIENT CASES ----------
def extract_patient_cases(text):
    parts = text.split("---ABSTRACT---")

    cases = []
    cid = 0

    for part in parts:
        part = part.strip()

        if not part:
            continue

        # skip main paper content accidentally included
        if len(part) > 500:
            continue

        cases.append({
            "id": cid,
            "text": part
        })
        cid += 1

    return cases


# ---------- MAIN ----------
def main():
    print("📂 Loading dataset...")
    text = load_text("data/raw/dataset_ivf.txt")

    print("⚙️ Normalizing text...")
    text = normalize_text(text)

    print("🧠 Extracting abstracts...")
    abstracts = extract_abstracts(text)

    print("🧬 Extracting patient cases...")
    patient_cases = extract_patient_cases(text)

    # Save files
    with open("data/processed/abstracts.json", "w", encoding="utf-8") as f:
        json.dump(abstracts, f, indent=2)

    with open("data/processed/patient_cases.json", "w", encoding="utf-8") as f:
        json.dump(patient_cases, f, indent=2)

    print("\n📊 FINAL COUNTS:")
    print(f"✅ Abstracts: {len(abstracts)} (expected ~51)")
    print(f"🧬 Patient cases: {len(patient_cases)} (expected ~20)")

    print("\n💾 Files saved:")
    print("→ abstracts.json")
    print("→ patient_cases.json")
    print("\n🎉 Done!")


if __name__ == "__main__":
    main()