import zipfile
from pathlib import Path
import re

# Load the zips
group_a_zip = Path("samples/group_a.zip")
group_b_zip = Path("samples/group_b.zip")

print("--- VERIFYING GROUP A ZIP ---")
with zipfile.ZipFile(group_a_zip) as z:
    names = sorted(z.namelist())
    print(f"Total files in Group A: {len(names)}")
    for name in names[:3] + ["..."] + names[-3:]:
        if name == "...":
            print("  ...")
            continue
        print(f"  File: {name}")
        content = z.read(name).decode("utf-8")
        first_line = content.splitlines()[0] if content else "EMPTY"
        print(f"    First line: {first_line}")

print("\n--- VERIFYING GROUP B ZIP ---")
with zipfile.ZipFile(group_b_zip) as z:
    names = sorted(z.namelist())
    print(f"Total files in Group B: {len(names)}")
    for name in names[:3] + ["..."] + names[-3:]:
        if name == "...":
            print("  ...")
            continue
        print(f"  File: {name}")
        content = z.read(name).decode("utf-8")
        first_line = content.splitlines()[0] if content else "EMPTY"
        print(f"    First line: {first_line}")

# Verify similarities
print("\n--- SIMILARITY CHECK BETWEEN PAIRS ---")
pairs_to_check = [
    ("submissions/STU001.txt", "submissions/STU021.txt"),
    ("submissions/STU005.txt", "submissions/STU025.txt"),
    ("submissions/STU010.txt", "submissions/STU030.txt"),
    ("submissions/STU015.txt", "submissions/STU035.txt"),
    ("submissions/STU020.txt", "submissions/STU040.txt"),
]

def clean_text(text):
    # simple tokenization for quick Jaccard similarity comparison
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s]', '', text)
    return set(text.split())

with zipfile.ZipFile(group_a_zip) as za, zipfile.ZipFile(group_b_zip) as zb:
    for file_a, file_b in pairs_to_check:
        content_a = za.read(file_a).decode("utf-8")
        content_b = zb.read(file_b).decode("utf-8")
        
        words_a = clean_text(content_a)
        words_b = clean_text(content_b)
        
        intersection = words_a.intersection(words_b)
        union = words_a.union(words_b)
        jaccard = len(intersection) / len(union) if union else 0
        
        print(f"Similarity between {file_a} and {file_b}: {jaccard:.2%} ({len(intersection)} shared words out of {len(union)})")

    # Check a non-similar pair to verify they don't overlap much
    content_a_filler = za.read("submissions/STU002.txt").decode("utf-8")
    content_b_filler = zb.read("submissions/STU022.txt").decode("utf-8")
    words_a_filler = clean_text(content_a_filler)
    words_b_filler = clean_text(content_b_filler)
    jaccard_filler = len(words_a_filler.intersection(words_b_filler)) / len(words_a_filler.union(words_b_filler))
    print(f"Similarity between filler STU002 and STU022: {jaccard_filler:.2%} (should be low)")
