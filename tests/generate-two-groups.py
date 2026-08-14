import zipfile
from pathlib import Path

# Paths to the output zip files
samples_dir = Path("samples")
samples_dir.mkdir(parents=True, exist_ok=True)
group_a_zip = samples_dir / "group_a.zip"
group_b_zip = samples_dir / "group_b.zip"

# Similar pairs (Pair 1-5)
# Original (will go to Group A) and Paraphrased/Copied (will go to Group B)
SIMILAR_PAIRS = [
    # Pair 1: Artificial Intelligence
    {
        "a_index": "STU001",
        "a_content": (
            "Student Index: STU001\n\n"
            "In recent years, artificial intelligence has emerged as a crucial driver of business innovation. "
            "Companies across the globe are integrating machine learning algorithms into their daily operations "
            "to automate routine tasks, analyze customer data, and predict market trends. This technological shift "
            "has not only improved efficiency but also created new avenues for product development. However, the "
            "adoption of AI is not without its hurdles, particularly regarding data privacy and job displacement."
        ),
        "b_index": "STU021",
        "b_content": (
            "Student Index: STU021\n\n"
            "In recent years, artificial intelligence has emerged as a key driver of business innovation. "
            "Companies across the world are integrating machine learning algorithms into their daily operations "
            "to automate routine tasks, analyze customer data, and forecast market trends. This technical shift "
            "has not only improved efficiency but also created new avenues for product development. However, the "
            "adoption of artificial intelligence is not without its hurdles, especially regarding data privacy and job displacement."
        )
    },
    # Pair 2: Ecotourism
    {
        "a_index": "STU005",
        "a_content": (
            "Student Index: STU005\n\n"
            "Ecotourism is gaining popularity as travelers seek sustainable experiences that minimize environmental impact. "
            "By focusing on conservation, education, and traveler responsibility, ecotourism projects aim to protect "
            "natural habitats while supporting local communities. Local guides play a vital role in educating tourists "
            "about biodiversity and preservation. The challenge is balancing tourist influx with ecological preservation "
            "to prevent degradation of the ecosystems."
        ),
        "b_index": "STU025",
        "b_content": (
            "Student Index: STU025\n\n"
            "Ecotourism is gaining popularity as tourists seek sustainable experiences that minimize environmental impact. "
            "By focusing on conservation, education, and visitor responsibility, ecotourism projects aim to protect "
            "natural habitats while supporting local communities. Local guides play a crucial role in educating tourists "
            "about biodiversity and preservation. The challenge is balancing tourist influx with ecological preservation "
            "to prevent degradation of the ecosystems."
        )
    },
    # Pair 3: Online Learning
    {
        "a_index": "STU010",
        "a_content": (
            "Student Index: STU010\n\n"
            "Online learning platforms have democratized education, making knowledge accessible to anyone with an "
            "internet connection. Students can learn at their own pace, choose from diverse courses, and balance "
            "studies with employment. Despite these benefits, virtual classrooms face high attrition rates due to "
            "a lack of face-to-face interaction and self-discipline challenges. Educators must find interactive "
            "methods to maintain student engagement in digital environments."
        ),
        "b_index": "STU030",
        "b_content": (
            "Student Index: STU030\n\n"
            "Online learning platforms have democratized education, making knowledge accessible to anyone with an "
            "internet connection. Students can study at their own pace, choose from diverse courses, and balance "
            "studies with employment. Despite these benefits, virtual classrooms face high attrition rates due to "
            "a lack of face-to-face interaction and self-discipline challenges. Teachers must find interactive "
            "methods to maintain student engagement in digital environments."
        )
    },
    # Pair 4: Urban Agriculture
    {
        "a_index": "STU015",
        "a_content": (
            "Student Index: STU015\n\n"
            "Urban agriculture is key to building resilient food systems in growing cities. By utilizing rooftops, "
            "vacant lots, and community gardens, city dwellers can produce fresh vegetables and fruits locally. "
            "This reduces the carbon footprint associated with long-distance food transport and improves nutrition "
            "in underserved neighborhoods. Yet, urban farmers must overcome challenges like high land costs, "
            "limited water access, and soil contamination."
        ),
        "b_index": "STU035",
        "b_content": (
            "Student Index: STU035\n\n"
            "Urban agriculture is key to building resilient food systems in growing cities. By utilizing rooftops, "
            "empty lots, and community gardens, city residents can produce fresh vegetables and fruits locally. "
            "This reduces the carbon footprint associated with long-distance food transport and improves nutrition "
            "in underserved neighborhoods. Yet, urban farmers must overcome challenges like high land costs, "
            "limited water access, and soil contamination."
        )
    },
    # Pair 5: Microfinance
    {
        "a_index": "STU020",
        "a_content": (
            "Student Index: STU020\n\n"
            "Microfinance institutions provide critical financial services to low-income individuals who lack access "
            "to conventional banking. By offering small loans, savings accounts, and financial literacy training, "
            "these organizations help entrepreneurs start small businesses and escape poverty. While successful in "
            "many regions, microfinance faces criticism regarding high interest rates and the risk of over-indebtedness "
            "among borrowers, requiring careful regulatory oversight."
        ),
        "b_index": "STU040",
        "b_content": (
            "Student Index: STU040\n\n"
            "Microfinance institutions provide critical financial services to low-income individuals who lack access "
            "to conventional banking. By offering small loans, savings accounts, and financial literacy training, "
            "these organizations help entrepreneurs start small businesses and escape poverty. While successful in "
            "many regions, microfinance faces criticism regarding high interest rates and the risk of over-indebtedness "
            "among borrowers, requiring careful regulatory oversight."
        )
    }
]

# 30 unique topics for filler essays
FILLER_TOPICS = [
    ("Organic Farming", "organic compost pesticide soil harvest vegetables crop yield manure natural"),
    ("Hydroelectric Power", "hydro turbine generator grid reservoir megawatt electricity current river dam"),
    ("Telemedicine", "telemedicine satellite consultation doctor diagnostic rural clinic health network signal"),
    ("Electric Vehicles", "electric battery charging fleet emission hybrid transit motor plug vehicle transport"),
    ("Ocean Plastic Pollution", "marine plastic beach clean-up harbor microplastics waste shoreline fish ocean"),
    ("Herbal Medicine", "herbal traditional healer efficacy clinical plant remedy therapy forest extract nature"),
    ("Cyber Security", "cybersecurity phishing password encryption firewalls threat hacker network authentication data"),
    ("Cocoa Yields", "cocoa fertilizer pod soil yield plantation bean harvest farmer crop agriculture"),
    ("Public Libraries", "library internet literacy community computers resource archive books educational learning"),
    ("Urban Planning", "drainage flood concrete planning sewage rainfall infrastructure channel pipe city civil"),
    ("Indigenous Languages", "language bilingual curriculum primary teaching heritage dialect tongue school speaking education"),
    ("Waste-to-Energy", "waste biofuel incineration methane landfill energy biogas power gas trash reuse"),
    ("Mobile Farming Apps", "mobile weather price farmer market broker digital software trade forecast SMS"),
    ("Fish Farming", "aquaculture fish pond feed fingerlings water cage harvest species net breeding"),
    ("Eco-Friendly Packaging", "packaging biodegradable paper carton single-use eco wrapping container compostable reusable"),
    ("Solar Water Pumps", "pump solar irrigation well dry-season vegetables borehole groundwater panels sun tech"),
    ("Youth Sports Academy", "academy football athlete coaching scholarship training scout pitch league talent matches"),
    ("Coastal Tourism", "hotel tourism beach waste recycling compost resort cost marine visitor sand guest"),
    ("Women's Cooperatives", "savings women loan cooperative interest capital microloan lending union empowerment trust"),
    ("Traffic Management", "traffic congestion bypass signals highway peak-hours route lane transit vehicle driver"),
    ("Virtual Reality Design", "virtual architecture 3D rendering blueprint design modeling simulation head-mounted space software"),
    ("Galamsey Regulation", "galamsey mining river mercury enforcement environment alluvial gold miner policing pollution"),
    ("Traditional Drumming", "drum dance tourism festival heritage workshop rhythm instrument craft culture performance"),
    ("Bird Conservation", "bird wetland migratory habitat conservation sanctuary species marsh watcher nesting binoculars"),
    ("Vocational Skills", "vocational skill tailor welder training workshop apprentice metalwork sewing mechanic career"),
    ("Public Parks", "park urban green recreation physical health trees bench playground path exercise grass"),
    ("Food Safety", "hygiene food market vendor contamination inspection sanitation bacteria health temperature control"),
    ("Salt Production", "salt evaporation crystallizer brine iodized bag ocean coastal lagoon pans dry harvest"),
    ("Solar Street Lights", "street-light solar battery safety night illumination pole road pathway crime security"),
    ("Local Spare Parts", "spare part foundry metal machine local lathe gear casting tool fabricate auto")
]

# Document structure template for unique filler essays
FILLER_TEMPLATE = """Student Index: {student_id}

Topic: {topic}

This research paper explores the dynamics of {t0} in modern communities, focusing on the integration of {t1}.
According to field research, using {t2} offers significant advantages.
However, we must consider the role of {t3} and its overall cost.
Successful implementation of {t4} could serve as a catalyst for future development in this sector.
Ultimately, planning should prioritize {t5} to ensure long-term stability and success.
"""

def generate_filler_content(student_id, topic, terms):
    t = terms.split()
    return FILLER_TEMPLATE.format(
        student_id=student_id,
        topic=topic,
        t0=t[0],
        t1=t[1],
        t2=t[2],
        t3=t[3],
        t4=t[4],
        t5=t[5]
    )

# Build files list for Group A (STU001 - STU020)
group_a_files = {}
# Build files list for Group B (STU021 - STU040)
group_b_files = {}

# Keep track of which filler topic we are on
filler_idx = 0

# Generate Group A files
# 5 similar pairs go to specific indices
similar_indices_a = {p["a_index"]: p["a_content"] for p in SIMILAR_PAIRS}
for i in range(1, 21):
    student_id = f"STU{i:03d}"
    if student_id in similar_indices_a:
        group_a_files[f"{student_id}.txt"] = similar_indices_a[student_id]
    else:
        topic, terms = FILLER_TOPICS[filler_idx]
        filler_idx += 1
        group_a_files[f"{student_id}.txt"] = generate_filler_content(student_id, topic, terms)

# Generate Group B files
similar_indices_b = {p["b_index"]: p["b_content"] for p in SIMILAR_PAIRS}
for i in range(21, 41):
    student_id = f"STU{i:03d}"
    if student_id in similar_indices_b:
        group_b_files[f"{student_id}.txt"] = similar_indices_b[student_id]
    else:
        topic, terms = FILLER_TOPICS[filler_idx]
        filler_idx += 1
        group_b_files[f"{student_id}.txt"] = generate_filler_content(student_id, topic, terms)

# Write Group A Zip
with zipfile.ZipFile(group_a_zip, "w", zipfile.ZIP_DEFLATED) as z:
    for filename, content in group_a_files.items():
        # Place inside a 'submissions/' directory structure as expected by ScriptIQ
        z.writestr(f"submissions/{filename}", content)

# Write Group B Zip
with zipfile.ZipFile(group_b_zip, "w", zipfile.ZIP_DEFLATED) as z:
    for filename, content in group_b_files.items():
        # Place inside a 'submissions/' directory structure as expected by ScriptIQ
        z.writestr(f"submissions/{filename}", content)

print(f"Group A Zip written to {group_a_zip} with {len(group_a_files)} files.")
print(f"Group B Zip written to {group_b_zip} with {len(group_b_files)} files.")
