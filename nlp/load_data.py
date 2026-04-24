def load_abstracts(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    abstracts = content.split("---ABSTRACT---")

    data = []
    for i, text in enumerate(abstracts):
        text = text.strip()
        if text:
            data.append({
                "id": i,
                "text": text
            })

    return data


if __name__ == "__main__":
    file_path = "data/raw/dataset_ivf.txt"

    data = load_abstracts(file_path)

    print(f"\n✅ Loaded {len(data)} abstracts\n")

    # Show first 2 samples
    for item in data[:2]:
        print(f"ID: {item['id']}")
        print(item["text"][:300])
        print("-" * 50)