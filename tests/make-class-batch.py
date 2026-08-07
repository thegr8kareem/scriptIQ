"""Build a realistic test archive: 50 submissions in nested folders, plus the
macOS/Windows noise a real zipped folder carries.

The 46 filler essays each get their OWN subject vocabulary. An earlier version
slot-filled one template from a small topic pool, which made the fillers more
similar to each other than the planted plagiarism cluster was — TF-IDF flagged
them, correctly, and the demo looked broken. Distinct vocabulary per essay is
what makes the planted cluster stand out.
"""
import zipfile
from pathlib import Path

out = Path("samples/class-batch.zip")
samples = Path("samples")

original = (samples / "essay-original.txt").read_text(encoding="utf-8")
paraphrase = (samples / "essay-paraphrased.txt").read_text(encoding="utf-8")
partial = (samples / "essay-partial-copy.txt").read_text(encoding="utf-8")
unrelated = (samples / "essay-unrelated.txt").read_text(encoding="utf-8")

# (surname, title, six subject-specific terms found in no other essay)
SUBJECTS = [
    ("Owusu", "Cassava Processing Cooperatives", "cassava gari tuber peeling fermentation cooperative"),
    ("Frimpong", "Coastal Erosion at Keta", "erosion groyne shoreline sediment lagoon seawall"),
    ("Antwi", "Teacher Retention in Upper West", "retention posting allowance staffing attrition classroom"),
    ("Adjei", "Bauxite Mining and Water Quality", "bauxite turbidity effluent tailings borehole contamination"),
    ("Nkrumah", "Trotro Fare Regulation", "trotro fare conductor route congestion terminal"),
    ("Bediako", "Shea Butter Export Chains", "shea nut butter cosmetic exporter grading"),
    ("Ofori", "Malaria Net Distribution", "malaria mosquito bednet insecticide clinic prophylaxis"),
    ("Quaye", "Tilapia Aquaculture on the Volta", "tilapia cage fingerling aquaculture feed harvest"),
    ("Amoah", "Solar Mini-Grids in Rural Districts", "solar photovoltaic minigrid inverter battery kilowatt"),
    ("Tetteh", "Kente Weaving as Heritage Industry", "kente loom weaver thread heritage motif"),
    ("Yeboah", "Groundwater Depletion in Bolgatanga", "groundwater aquifer recharge drawdown irrigation pump"),
    ("Sarpong", "Plastic Waste Collection Schemes", "plastic sachet recycling landfill collection incentive"),
    ("Agyeman", "Timber Certification and Logging", "timber logging concession certification sawmill deforestation"),
    ("Baffour", "Street Vending Bylaws in Accra", "vending hawker bylaw pavement eviction licence"),
    ("Nyarko", "Poultry Feed Import Dependence", "poultry feed maize soybean broiler hatchery"),
    ("Kyei", "University Library Digitisation", "library catalogue digitisation archive repository scanner"),
    ("Boakye", "Cement Pricing and Housing Costs", "cement clinker housing masonry contractor tonne"),
    ("Ansah", "Snail Farming as Supplementary Income", "snail shell heliciculture pen humidity forage"),
    ("Donkor", "Flood Drains in Kumasi", "flood drain culvert silt runoff embankment"),
    ("Appiah", "Radio Journalism in Local Languages", "radio broadcast presenter frequency listener phonein"),
    ("Asare", "Beekeeping and Pollination Services", "beekeeping hive apiary pollination honey swarm"),
    ("Larbi", "Rice Import Substitution Policy", "rice paddy milling husk tariff substitution"),
    ("Amponsah", "Vocational Training Uptake", "apprenticeship vocational welding tailoring certification workshop"),
    ("Gyasi", "Charcoal Production and Woodland Loss", "charcoal kiln woodland savanna firewood briquette"),
    ("Twum", "Sanitation Levies and Public Toilets", "sanitation latrine sewage levy toilet septic"),
    ("Duah", "Palm Oil Smallholder Yields", "palm oil kernel plantation smallholder mill"),
    ("Acheampong", "Football Academies and Youth Migration", "football academy scout youth transfer stadium"),
    ("Opoku", "Textile Smuggling and Local Mills", "textile smuggling wax print mill fabric"),
    ("Mireku", "Hospital Waiting Times in Tamale", "hospital triage waiting ward nurse referral"),
    ("Wiafe", "Community Forest Management", "forest reserve canopy seedling agroforestry patrol"),
    ("Buabeng", "Salt Mining at Songor", "salt brine evaporation pan lagoon iodisation"),
    ("Danquah", "Land Title Registration Delays", "land title registration surveyor deed litigation"),
    ("Kusi", "Cocoa Pod Husk as Fertiliser", "husk compost fertiliser nutrient potassium mulch"),
    ("Manu", "Motorcycle Taxi Safety", "motorcycle helmet okada rider accident licence"),
    ("Ntim", "School Feeding Programme Nutrition", "feeding caterer nutrition menu enrolment portion"),
    ("Obeng", "Mangrove Restoration in the Delta", "mangrove seedling delta salinity restoration crab"),
    ("Prempeh", "Informal Savings Groups (Susu)", "susu collector contribution rotating deposit trust"),
    ("Safo", "Air Quality near Agbogbloshie", "particulate smelter scrap emission respiratory monitor"),
    ("Tuffour", "Irrigation Schemes in the Afram Plains", "irrigation canal sprinkler weir dam plot"),
    ("Ampofo", "Pharmacy Regulation and Counterfeits", "pharmacy counterfeit dispensing prescription regulator batch"),
    ("Osafo", "Tourism at Cape Coast Castle", "tourism castle heritage visitor guide itinerary"),
    ("Boadi", "Sand Winning and Farmland Loss", "sand winning excavation topsoil quarry farmland"),
    ("Aidoo", "Nurse Emigration and Staffing Gaps", "nurse emigration recruitment roster vacancy diaspora"),
    ("Fosu", "Onion Storage and Post-Harvest Loss", "onion storage spoilage crate ventilation postharvest"),
    ("Nti", "Municipal Revenue Collection", "revenue rateable assessment collector arrears municipal"),
    ("Agyapong", "Sign Language Access in Courts", "interpreter sign deaf courtroom testimony accessibility"),
]

assert len(SUBJECTS) == 46, len(SUBJECTS)

FRAME = """{title}

This study investigates {t0} and its relationship to {t1} in the Ghanaian
context, combining interviews with secondary records.

Field observation showed that {t2} remains the binding constraint. Where
{t3} was available, respondents reported steadier output; where it was not,
they fell back on {t4} despite the additional cost.

The evidence points to {t5} as the practical lever for improvement. Policy
should prioritise it before broader structural reform is attempted.
"""

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    # Noise a real zipped folder carries — all of it must be ignored.
    z.writestr("__MACOSX/._submissions", b"\x00\x05\x16\x07mac resource fork")
    z.writestr("submissions/.DS_Store", b"\x00\x00\x00\x01Bud1")
    z.writestr("submissions/Thumbs.db", b"thumbnail cache")
    z.writestr("submissions/rubric.xlsx", b"not a document we parse")
    z.writestr("submissions/notes/", b"")  # directory entry

    # Four submissions that drive the demo: a copying cluster of three
    # plus one genuinely independent essay.
    z.writestr("submissions/2024_ECON301_Mensah_A.txt", original)
    z.writestr("submissions/2024_ECON301_Osei_K.txt", paraphrase)
    z.writestr("submissions/2024_ECON301_Boateng_A.txt", partial)
    z.writestr("submissions/2024_ECON301_Darko_Y.txt", unrelated)

    # 46 genuinely independent essays, nested one folder deeper.
    for i, (surname, title, terms) in enumerate(SUBJECTS):
        t = terms.split()
        body = FRAME.format(title=title, **{f"t{k}": t[k] for k in range(6)})
        z.writestr(f"submissions/section-b/2024_ECON301_{surname}_{i:02d}.txt", body)

print(f"wrote {out} ({out.stat().st_size:,} bytes)")
with zipfile.ZipFile(out) as z:
    names = z.namelist()
    print(f"  {len(names)} entries, {sum(n.endswith('.txt') for n in names)} .txt submissions")
