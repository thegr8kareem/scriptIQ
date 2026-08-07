# ScriptIQ Dataset Architecture & Pipeline Documentation

ScriptIQ uses a structured dataset pipeline for training, fine-tuning, and evaluating AI semantic sentence transformers and TF-IDF similarity algorithms.

---

## 1. Public Dataset Sources & Recommendations

For comprehensive model fine-tuning and academic integrity benchmark evaluations, ScriptIQ recommends leveraging the following open datasets:

1. **PAN Plagiarism Corpus (Webis Group)**:
   - *Use Case*: Text alignment, direct copying, and near-duplicate document detection.
   - *Url*: [https://pan.webis.de/data.html](https://pan.webis.de/data.html)
2. **IMSDb & OpenSubtitles Screenplay Dataset**:
   - *Use Case*: Screenplay formatting, scene heading extraction (`INT./EXT.`), dialogue density, and act structure parsing.
3. **Microsoft Research Paraphrase Corpus (MSRPC) / Wiki-Auto**:
   - *Use Case*: Evaluation of semantic paraphrase detection algorithms (detecting rewritten text sharing identical semantics without keyword overlap).

---

## 2. Dataset Schema Definition (`dataset/schema.json`)

Each dataset pair item follows the schema defined below:

```json
{
  "id": "pair-001",
  "title_a": "Script Alpha",
  "title_b": "Script Beta",
  "script_a": "INT. BANK VAULT...",
  "script_b": "INT. BANK VAULT...",
  "category": "direct_copy | paraphrased_copy | scene_restructure | original_different",
  "expected_similarity": 0.85,
  "is_plagiarism": true,
  "metadata": {
    "genre": "Thriller",
    "source": "ScriptIQ Benchmark"
  }
}
```

---

## 3. Data Preprocessing & Validation Pipeline

The preprocessing script `dataset/prepare_dataset.js` automates the following steps:
1. **Schema Validation**: Validates all JSON items for required fields, non-empty script strings, and similarity score range `[0.0, 1.0]`.
2. **Text Normalization**: Converts text to lowercase, strips punctuation, normalizes spacing, and extracts term frequency profiles.
3. **Jaccard & Overlap Metrics**: Calculates n-gram overlap and vocabulary sizes.
4. **Dataset Splitting**: Exports processed samples into `dataset/processed/train.json` and `dataset/processed/test.json` for model training and benchmark verification.

---

## 4. Running the Pipeline

To run dataset processing and generate output splits:

```bash
node dataset/prepare_dataset.js
```

Outputs will be saved in `dataset/processed/`.
