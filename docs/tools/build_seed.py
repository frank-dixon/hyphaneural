#!/usr/bin/env python3
"""Expand fungi catalog + embed into docs/index.html. Honest mock labels."""
from __future__ import annotations
import json, copy, re
from pathlib import Path

ROOT = Path("/workspace/hyphaneural/docs")
ORG_PATH = ROOT / "data" / "organisms.json"
GENE_PATH = ROOT / "data" / "genes.json"
INDEX = ROOT / "index.html"

# Core gene pool reused across fungi (families). Unique markers per clade.
CORE_POOL = [
    ("ACT1", "actin", "cytoskeleton", "I"),
    ("TEF1", "tef", "translation", "II"),
    ("TUB1", "tubulin", "cytoskeleton", "II"),
    ("CDC28", "cdk", "cell-cycle", "III"),
    ("PGK1", "pgk", "metabolism", "III"),
    ("TDH3", "gapdh", "metabolism", "IV"),
    ("ENO2", "eno", "metabolism", "IV"),
    ("PYK1", "pyk", "metabolism", "V"),
    ("ATP2", "atp", "respiration", "V"),
    ("COX1", "cox", "respiration", "mt"),
    ("HSP82", "hsp90", "stress", "VI"),
    ("SSA1", "hsp70", "stress", "VI"),
    ("RAD51", "rad51", "repair", "VII"),
    ("RPS5", "rps", "ribosome", "VII"),
    ("RPL25", "rpl", "ribosome", "VIII"),
    ("URA3", "ura", "marker", "VIII"),
    ("HIS3", "his", "marker", "IX"),
    ("ADE2", "ade", "marker", "IX"),
    ("LEU2", "leu", "marker", "X"),
    ("SIR2", "sirtuin", "chromatin", "X"),
]

# Extra unique / clade-flavored genes (may be stub)
UNIQUE_BY_CLUE = {
    "yeast": [("SUC2", "suc", "metabolism"), ("HO", "ho", "mating"), ("FLO11", "flo", "adhesion"), ("GAL1", "gal", "metabolism"), ("STE2", "ste2", "mating"), ("MFA1", "mfa", "mating")],
    "fission": [("CDC2", "cdk", "cell-cycle"), ("STE11", "ste11", "mating"), ("BYR1", "byr", "mating"), ("MAT1", "mat", "mating")],
    "mold": [("WC1", "wc", "clock"), ("WC2", "wc", "clock"), ("FRQ", "frq", "clock")],
    "aspergillus": [("STCA", "stc", "secondary"), ("BRLE", "brl", "development"), ("WETA", "wet", "development")],
    "candida": [("EFG1", "efg", "morphogenesis"), ("HWP1", "hwp", "adhesion"), ("ALS3", "als", "adhesion")],
    "mushroom": [("POX1", "pox", "decay"), ("CEL1", "cel", "decay"), ("HYD1", "hyd", "surface")],
    "pathogen": [("CAP59", "cap", "virulence"), ("LAC1", "lac", "virulence"), ("PLB1", "plb", "virulence")],
    "zygo": [("PKAR", "pka", "development"), ("CRGA", "crg", "development")],
    "industrial": [("XYN1", "xyn", "decay"), ("CBH1", "cbh", "decay")],
    "rust": [("AVR", "avr", "virulence"), ("RTP1", "rtp", "virulence")],
}

FUNGI = [
    # existing-ish enriched
    dict(slug="bakers-yeast", common="Baker's yeast", sci="Saccharomyces cerevisiae", glow="#3d9e8f",
         clade="Ascomycota · Saccharomycotina", form="budding yeast", clue="yeast", default=True,
         blurb="The classic lab fungus. A compact genome where gene → trait stories are unusually readable.",
         overview={
             "why": "Century of genetics: knockouts, mating types, and sugar metabolism you can teach in one sitting.",
             "habitat": "Human-associated fermentations — bread, beer, wine — and every genetics classroom.",
             "genome_note": "Mock linear catalog (~12 Mb class). Public annotation culture; sequences here are simplified.",
             "teach": "Start here. Follow SUC2 (invertase) to watch DNA become an enzyme that splits table sugar.",
         }),
    dict(slug="schizosaccharomyces", common="Fission yeast", sci="Schizosaccharomyces pombe", glow="#4a9e8a",
         clade="Ascomycota · Taphrinomycotina", form="fission yeast", clue="fission",
         blurb="Cell-cycle genetics in a yeast that divides by fission — a different silhouette of the same story.",
         overview={
             "why": "Nobel-famous cell-cycle checkpoints. Divides by splitting in the middle, not budding.",
             "habitat": "Traditional African millet beer; now a model eukaryote.",
             "genome_note": "Mock linear catalog. Orthologs of CDK/actin share families with baker's yeast.",
             "teach": "Compare ACT1 and CDC2/CDC28 — same jobs, different evolutionary handwriting.",
         }),
    dict(slug="neurospora", common="Red bread mold", sci="Neurospora crassa", glow="#3d8f9e",
         clade="Ascomycota · Pezizomycotina", form="filamentous mold", clue="mold",
         blurb="A genetic workhorse for circadian rhythms and gene silencing. Threads of regulation made measurable.",
         overview={
             "why": "Beadle & Tatum's one-gene–one-enzyme fungus; now the clock genes WC-1 / FRQ.",
             "habitat": "Burned vegetation and bread — orange mycelium.",
             "genome_note": "Mock filamentous track. Clock genes labeled stub/simplified where not fully expanded.",
             "teach": "Open WC1 or FRQ for a circadian DNA→protein story (mock teaching path).",
         }),
    dict(slug="oyster-mushroom", common="Oyster mushroom", sci="Pleurotus ostreatus", glow="#c4784a",
         clade="Basidiomycota · Agaricales", form="mushroom", clue="mushroom",
         blurb="A wood-decay basidiomycete. Hyphal networks make structure visible at human scale.",
         overview={
             "why": "Edible mushroom whose lignin-decay enzymes are industrial and ecological stars.",
             "habitat": "Dead hardwoods; cultivated worldwide on straw and sawdust.",
             "genome_note": "Mock basidiomycete linear bins. Decay genes (POX/CEL) are mock / public-style labels.",
             "teach": "Switch Genome panel on to stack oyster vs yeast — shared actin, unique decay tips.",
         }),
    dict(slug="aspergillus-nidulans", common="A. nidulans", sci="Aspergillus nidulans", glow="#3d9e7a",
         clade="Ascomycota · Eurotiomycetes", form="mold", clue="aspergillus",
         blurb="Model ascomycete for secondary metabolism and developmental genetics.",
         overview={
             "why": "Textbook mold for conidiation genetics and metabolic gene clusters.",
             "habitat": "Soil; lab workhorse since the 1950s.",
             "genome_note": "Mock catalog. Secondary-metabolism loci (e.g. STCA) marked mock/simplified.",
             "teach": "BRLE / WETA sketch developmental switches — then drill into a conserved TEF strand.",
         }),
    dict(slug="candida-albicans", common="C. albicans", sci="Candida albicans", glow="#9e6b3d",
         clade="Ascomycota · Saccharomycotina", form="dimorphic yeast", clue="candida",
         blurb="Dimorphic yeast; morphology switches illuminate how genotype meets environment.",
         overview={
             "why": "Major human fungal pathogen — yeast ↔ hypha transitions are virulence theater.",
             "habitat": "Human microbiome opportunist.",
             "genome_note": "Mock pathogen track. Adhesins (HWP1, ALS3) are teaching stubs.",
             "teach": "EFG1 morphogenesis vs baker's yeast — same kingdom, different lifestyle.",
         }),
    # new fungi
    dict(slug="aspergillus-fumigatus", common="A. fumigatus", sci="Aspergillus fumigatus", glow="#2f8f7e",
         clade="Ascomycota · Eurotiomycetes", form="mold · pathogen", clue="aspergillus",
         blurb="Airborne mold pathogen — spores everywhere, disease in the immunocompromised.",
         overview={"why": "Leading cause of invasive aspergillosis.", "habitat": "Soil, compost, indoor air.",
                   "genome_note": "Mock / public-annotation style seed — not a clinical reference.",
                   "teach": "Compare stress HSP families with baker's yeast; virulence tips diverge."}),
    dict(slug="aspergillus-niger", common="A. niger", sci="Aspergillus niger", glow="#3a8a6e",
         clade="Ascomycota · Eurotiomycetes", form="industrial mold", clue="aspergillus",
         blurb="Citric-acid and enzyme factory mold — industry's favorite black Aspergillus.",
         overview={"why": "Industrial workhorse for acids and hydrolases.", "habitat": "Soil, fruit, fermenters.",
                   "genome_note": "Mock industrial catalog.", "teach": "Metabolism genes shared; secondary tips unique."}),
    dict(slug="cryptococcus-neoformans", common="C. neoformans", sci="Cryptococcus neoformans", glow="#6b9e8f",
         clade="Basidiomycota · Tremellomycetes", form="encapsulated yeast · pathogen", clue="pathogen",
         blurb="Basidiomycete yeast with a polysaccharide capsule — meningitis pathogen.",
         overview={"why": "Capsule and melanin are classic virulence teaching modules.", "habitat": "Bird guano, trees; opportunistic in humans.",
                   "genome_note": "Mock pathogen seed (CAP/LAC stubs).", "teach": "Stack with yeast in Genome panel — shared TEF, unique capsule genes."}),
    dict(slug="cryptococcus-gattii", common="C. gattii", sci="Cryptococcus gattii", glow="#5a9e88",
         clade="Basidiomycota · Tremellomycetes", form="encapsulated yeast · pathogen", clue="pathogen",
         blurb="Sister cryptococcal pathogen — often hits immunocompetent hosts.",
         overview={"why": "Contrasts with C. neoformans on host range.", "habitat": "Trees (e.m. eucalyptus), soil.",
                   "genome_note": "Mock sister-track to neoformans.", "teach": "Compare CAP/LAC stubs across Cryptococcus."}),
    dict(slug="candida-glabrata", common="C. glabrata", sci="Candida glabrata", glow="#8f7a3d",
         clade="Ascomycota · Saccharomycotina", form="yeast · pathogen", clue="yeast",
         blurb="Nakaseomyces pathogen yeast — closer to S. cerevisiae than to C. albicans.",
         overview={"why": "Shows pathogenicity evolving inside the baker's-yeast neighborhood.", "habitat": "Human-associated.",
                   "genome_note": "Mock; many orthologs map to S. cerevisiae families.", "teach": "Great Genome-panel neighbor to baker's yeast."}),
    dict(slug="candida-auris", common="C. auris", sci="Candida auris", glow="#a07840",
         clade="Ascomycota · Saccharomycotina", form="yeast · pathogen", clue="candida",
         blurb="Emerging multidrug-resistant yeast — hospital outbreak genetics.",
         overview={"why": "Public-health fungus of the decade.", "habitat": "Healthcare environments.",
                   "genome_note": "Mock teaching seed — not a resistance database.", "teach": "Stress and adhesin stubs vs C. albicans."}),
    dict(slug="komagataella-phaffii", common="Pichia (K. phaffii)", sci="Komagataella phaffii", glow="#3d9e98",
         clade="Ascomycota · Saccharomycotina", form="methylotrophic yeast", clue="yeast",
         blurb="Industrial protein-expression yeast (formerly Pichia pastoris).",
         overview={"why": "Workhorse for recombinant proteins.", "habitat": "Tree exudates; bioreactors.",
                   "genome_note": "Mock industrial yeast track.", "teach": "TEF/ACT conserved; expression lifestyle differs."}),
    dict(slug="kluyveromyces-lactis", common="K. lactis", sci="Kluyveromyces lactis", glow="#4a9e94",
         clade="Ascomycota · Saccharomycotina", form="dairy yeast", clue="yeast",
         blurb="Lactose-using yeast of dairy fermentations and biotech.",
         overview={"why": "Lactose metabolism contrast with baker's yeast.", "habitat": "Dairy, insects.",
                   "genome_note": "Mock; sugar story differs from SUC2.", "teach": "Compare sugar genes with S. cerevisiae."}),
    dict(slug="yarrowia-lipolytica", common="Y. lipolytica", sci="Yarrowia lipolytica", glow="#9e8f3d",
         clade="Ascomycota · Saccharomycotina", form="oleaginous yeast", clue="yeast",
         blurb="Oil-accumulating yeast — lipid metabolism teaching model.",
         overview={"why": "Oleaginous metabolic engineering star.", "habitat": "Lipid-rich niches, cheese.",
                   "genome_note": "Mock lipid-aware catalog.", "teach": "Respiration/metabolism shared; lipid tips diverge."}),
    dict(slug="ashbya-gossypii", common="A. gossypii", sci="Ashbya gossypii", glow="#3d8e9e",
         clade="Ascomycota · Saccharomycotina", form="filamentous yeast-relative", clue="yeast",
         blurb="Filamentous relative of baker's yeast — riboflavin overproducer.",
         overview={"why": "Near-yeast genome with hyphal morphology.", "habitat": "Cotton pathogen historically; industrial vitamin B2.",
                   "genome_note": "Mock; strong orthology to S. cerevisiae.", "teach": "Same families, different body plan."}),
    dict(slug="magnaporthe-oryzae", common="Rice blast fungus", sci="Magnaporthe oryzae", glow="#8f5a3d",
         clade="Ascomycota · Sordariomycetes", form="plant pathogen mold", clue="mold",
         blurb="Rice blast — one of the world's most destructive crop fungi.",
         overview={"why": "Appressorium infection genetics.", "habitat": "Rice and grasses.",
                   "genome_note": "Mock plant-pathogen seed.", "teach": "Stress/repair shared; infection tips unique stubs."}),
    dict(slug="fusarium-graminearum", common="F. graminearum", sci="Fusarium graminearum", glow="#9e4a3d",
         clade="Ascomycota · Sordariomycetes", form="plant pathogen mold", clue="mold",
         blurb="Head blight of wheat — mycotoxin-aware teaching mold.",
         overview={"why": "Fusarium head blight + DON toxin story.", "habitat": "Cereals.",
                   "genome_note": "Mock; secondary metabolism stubs.", "teach": "Stack with Neurospora — shared mold chassis."}),
    dict(slug="fusarium-oxysporum", common="F. oxysporum", sci="Fusarium oxysporum", glow="#8f4038",
         clade="Ascomycota · Sordariomycetes", form="plant pathogen mold", clue="mold",
         blurb="Soil wilt fungus with a huge, modular accessory genome.",
         overview={"why": "Lineage-specific chromosomes teach genome plasticity.", "habitat": "Soil, plant xylem.",
                   "genome_note": "Mock modular catalog.", "teach": "Core TEF/ACT vs unique virulence stubs."}),
    dict(slug="botrytis-cinerea", common="Gray mold", sci="Botrytis cinerea", glow="#6a7a8a",
         clade="Ascomycota · Leotiomycetes", form="necrotroph mold", clue="mold",
         blurb="Gray mold of fruits and vines — soft-rot generalist.",
         overview={"why": "Broad-host necrotroph genetics.", "habitat": "Grapes, strawberries, greenhouse crops.",
                   "genome_note": "Mock necrotroph seed.", "teach": "Decay enzymes rhyme with mushroom POX/CEL stubs."}),
    dict(slug="trichoderma-reesei", common="T. reesei", sci="Trichoderma reesei", glow="#3d9e5a",
         clade="Ascomycota · Sordariomycetes", form="industrial mold", clue="industrial",
         blurb="Cellulase super-producer — softens plant biomass for industry.",
         overview={"why": "Enzyme cocktail genetics for biofuels/textiles.", "habitat": "Soil; bioreactors.",
                   "genome_note": "Mock; CBH/XYN stubs labeled mock.", "teach": "Compare decay tips with oyster mushroom."}),
    dict(slug="penicillium-rubens", common="P. rubens", sci="Penicillium rubens", glow="#4a7a9e",
         clade="Ascomycota · Eurotiomycetes", form="mold", clue="aspergillus",
         blurb="Penicillin-producing mold (Fleming lineage, modern name).",
         overview={"why": "Antibiotic secondary metabolism icon.", "habitat": "Indoor/food molds; lab strains.",
                   "genome_note": "Mock secondary-metabolism seed.", "teach": "Secondary cluster stubs vs A. nidulans STCA."}),
    dict(slug="penicillium-roqueforti", common="P. roqueforti", sci="Penicillium roqueforti", glow="#3d6a9e",
         clade="Ascomycota · Eurotiomycetes", form="cheese mold", clue="aspergillus",
         blurb="Blue-cheese mold — flavor chemistry meets fungal genetics.",
         overview={"why": "Food-fungus secondary metabolites.", "habitat": "Cheese caves.",
                   "genome_note": "Mock food-mold catalog.", "teach": "Quiet Protomol food-fungus contrast to pathogens."}),
    dict(slug="ustilago-maydis", common="Corn smut", sci="Ustilago maydis", glow="#9e8a3d",
         clade="Basidiomycota · Ustilaginomycotina", form="smut fungus", clue="pathogen",
         blurb="Corn smut — dimorphic basidiomycete plant pathogen and huitlacoche.",
         overview={"why": "Mating-type and plant-tumor genetics.", "habitat": "Maize.",
                   "genome_note": "Mock smut track.", "teach": "Basidiomycete neighbor to Cryptococcus/mushrooms."}),
    dict(slug="coprinopsis-cinerea", common="Ink-cap mushroom", sci="Coprinopsis cinerea", glow="#c48a4a",
         clade="Basidiomycota · Agaricales", form="mushroom", clue="mushroom",
         blurb="Model mushroom for multicellular development and meiosis.",
         overview={"why": "Basidiomycete developmental genetics.", "habitat": "Dung, compost.",
                   "genome_note": "Mock mushroom development seed.", "teach": "Compare with oyster — shared mushroom form."}),
    dict(slug="agaricus-bisporus", common="Button mushroom", sci="Agaricus bisporus", glow="#b89a6a",
         clade="Basidiomycota · Agaricales", form="mushroom", clue="mushroom",
         blurb="The grocery-store button/portobello — cultivated basidiomycete.",
         overview={"why": "Most-eaten mushroom; breeding genetics.", "habitat": "Compost beds.",
                   "genome_note": "Mock cultivated-mushroom catalog.", "teach": "Genome panel: mushroom vs yeast scaffolding genes."}),
    dict(slug="laccaria-bicolor", common="L. bicolor", sci="Laccaria bicolor", glow="#6a9e7a",
         clade="Basidiomycota · Agaricales", form="ectomycorrhizal mushroom", clue="mushroom",
         blurb="Mycorrhizal mushroom that partners with tree roots.",
         overview={"why": "Symbiosis genetics — fungus + plant (plant not modeled here).", "habitat": "Forest soils.",
                   "genome_note": "Mock mycorrhizal seed — fungi only in this catalog.", "teach": "Shared actin; unique symbiosis stubs."}),
    dict(slug="phanerochaete-chrysosporium", common="White-rot fungus", sci="Phanerochaete chrysosporium", glow="#9e9e4a",
         clade="Basidiomycota · Polyporales", form="white-rot wood decay", clue="mushroom",
         blurb="Model white-rot — lignin-busting enzymatic firepower.",
         overview={"why": "Lignin peroxidase teaching fungus.", "habitat": "Dead wood.",
                   "genome_note": "Mock decay enzyme catalog.", "teach": "POX/CEL-style stubs vs oyster mushroom."}),
    dict(slug="mucor-circinelloides", common="M. circinelloides", sci="Mucor circinelloides", glow="#8f6a9e",
         clade="Mucoromycota · Mucorales", form="zygote fungus", clue="zygo",
         blurb="Early-diverging zygomycete — different fungal chassis.",
         overview={"why": "Deep fungal phylogeny contrast to asco/basidio.", "habitat": "Soil, soft fruit.",
                   "genome_note": "Mock early-diverging track.", "teach": "Conserved translation; divergent development stubs."}),
    dict(slug="rhizopus-oryzae", common="R. oryzae", sci="Rhizopus oryzae", glow="#7a5a9e",
         clade="Mucoromycota · Mucorales", form="zygote fungus", clue="zygo",
         blurb="Tempeh & mucormycosis fungus — fermentation and pathogen faces.",
         overview={"why": "Food + opportunistic pathogen duality.", "habitat": "Soil, fermented foods.",
                   "genome_note": "Mock Mucorales seed.", "teach": "Stack with Mucor — early-diverging pair."}),
    dict(slug="histoplasma-capsulatum", common="H. capsulatum", sci="Histoplasma capsulatum", glow="#9e7a5a",
         clade="Ascomycota · Eurotiomycetes", form="dimorphic pathogen", clue="pathogen",
         blurb="Histoplasmosis fungus — mold in soil, yeast in host.",
         overview={"why": "Thermally dimorphic pathogen teaching case.", "habitat": "Soil enriched with bird/bat droppings.",
                   "genome_note": "Mock dimorphic pathogen seed.", "teach": "Morphogenesis parallels Candida, different clade."}),
    dict(slug="coccidioides-immitis", common="Valley fever fungus", sci="Coccidioides immitis", glow="#9e6a4a",
         clade="Ascomycota · Eurotiomycetes", form="dimorphic pathogen", clue="pathogen",
         blurb="Valley fever — arid-soil spherule pathogen.",
         overview={"why": "Desert dust fungal disease genetics.", "habitat": "Arid soils of the Americas.",
                   "genome_note": "Mock; not a clinical atlas.", "teach": "Compare with Histoplasma dimorphism stubs."}),
    dict(slug="blastomyces-dermatitidis", common="B. dermatitidis", sci="Blastomyces dermatitidis", glow="#8f6a4a",
         clade="Ascomycota · Eurotiomycetes", form="dimorphic pathogen", clue="pathogen",
         blurb="Blastomycosis fungus — another thermal dimorph.",
         overview={"why": "North American dimorphic pathogen set.", "habitat": "Moist soil, wooded wetlands.",
                   "genome_note": "Mock pathogen seed.", "teach": "Trio with Histoplasma / Coccidioides."}),
    dict(slug="pneumocystis-jirovecii", common="P. jirovecii", sci="Pneumocystis jirovecii", glow="#5a8a9e",
         clade="Ascomycota · Taphrinomycotina", form="unculturable pathogen fungus", clue="fission",
         blurb="Pneumonia fungus of immunocompromised hosts — odd ascus relative.",
         overview={"why": "Unusual obligate pathogen near fission yeast clade.", "habitat": "Mammalian lungs.",
                   "genome_note": "Mock; many genes incomplete — labeled stub.", "teach": "Neighbor to S. pombe in the panel."}),
    dict(slug="batrachochytrium-dendrobatidis", common="Bd chytrid", sci="Batrachochytrium dendrobatidis", glow="#3d6a8f",
         clade="Chytridiomycota", form="chytrid pathogen", clue="pathogen",
         blurb="Amphibian-killing chytrid — deep-branching fungal pathogen.",
         overview={"why": "Global frog decline fungus; deep fungal tree.", "habitat": "Freshwater / amphibian skin.",
                   "genome_note": "Mock chytrid seed — fungi only.", "teach": "Zoom out phylogenetically vs mushrooms/yeasts."}),
    dict(slug="puccinia-graminis", common="Stem rust", sci="Puccinia graminis", glow="#9e3d3d",
         clade="Basidiomycota · Pucciniales", form="rust fungus", clue="rust",
         blurb="Wheat stem rust — classic obligate plant pathogen.",
         overview={"why": "Rust epidemics shaped plant pathology.", "habitat": "Wheat / barberry life cycle.",
                   "genome_note": "Mock rust catalog (AVR stubs).", "teach": "Basidiomycete pathogen vs mushroom decay."}),
]

ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","mt"]

def build_linear(slug, clue, rng_offset=0):
    slots = []
    # take most of core
    core = CORE_POOL[:]
    for i, (gid, fam, cat, chr_) in enumerate(core):
        slots.append({"id": gid if gid in ("ACT1","TEF1","TUB1","CDC28","PGK1","TDH3","ENO2","PYK1","ATP2","COX1","HSP82","SSA1","RAD51","RPS5","RPL25","URA3","HIS3","ADE2","LEU2","SIR2") else gid,
                      "chr": chr_, "pos": 0.1 + (i % 3) * 0.28, "category": cat, "family": fam})
    # unique extras
    extras = UNIQUE_BY_CLUE.get(clue, [])
    # also sprinkle yeast uniques lightly for yeast-like
    for j, (gid, fam, cat) in enumerate(extras):
        slots.append({"id": gid, "chr": ROMAN[(j + 3) % len(ROMAN)], "pos": 0.2 + (j % 4) * 0.2,
                      "category": cat, "family": fam})
    # Deduplicate by id keeping first
    seen=set(); out=[]
    for s in slots:
        if s["id"] in seen: continue
        seen.add(s["id"]); out.append(s)
    return out

def ensure_gene(genes, gid, fam, name=None, role=None, orgs=None, stub=True):
    if gid in genes:
        if orgs:
            cur = set(genes[gid].get("organisms") or [])
            cur.update(orgs)
            genes[gid]["organisms"] = sorted(cur)
        if fam and not genes[gid].get("family"):
            genes[gid]["family"] = fam
        return
    nm = name or gid
    genes[gid] = {
        "id": gid,
        "name": nm,
        "role": role or f"{nm} — mock / simplified fungal annotation for teaching.",
        "organisms": sorted(orgs or []),
        "phenotype": "Mock teaching phenotype — not a full literature claim.",
        "family": fam,
        "family_detail": {
            "plain_english": f"The {fam} family is a recurring fungal toolkit piece. Orthologs share a job; tips record lineage.",
            "why_it_matters": "Family view lets you compare the same job across mushrooms, yeasts, and molds.",
            "conservation": "Core often teal-stable; tips ember-diverge in the compare view.",
        },
        "steps": [
            {"stage": "DNA", "label": f"{gid} locus",
             "plain_english": f"A stretch of DNA encoding {nm}. This is the recipe layer — still Quiet Protomol teaching, mock sequence.",
             "seq_hint": "ATG… (mock / simplified)"},
            {"stage": "mRNA", "label": f"{gid} transcript",
             "plain_english": "The cell copies DNA into messenger RNA — a working draft. DNA stays put; mRNA carries the message.",
             "seq_hint": "AUG… (mock / simplified)"},
            {"stage": "Protein", "label": f"{nm} product",
             "plain_english": f"Ribosomes build the {nm} product. Sequence tips drift across fungi; the job often remains.",
             "seq_hint": "M… (mock / simplified)"},
        ],
        "stub": stub,
        "annotated": not stub,
    }

# Load existing genes as base
genes = json.loads(GENE_PATH.read_text())

# Enrich existing genes with family_detail + richer steps where thin
FAMILY_TEACH = {
    "actin": ("Cytoskeleton actin family", "Shape, division, and hyphal tip growth scaffolding across fungi.", "Extremely conserved — best multi-organism compare strand."),
    "tef": ("Translation elongation (EF-1α)", "Protein synthesis is non-negotiable; TEF strands stay mostly teal.", "Great conserved core for compare mode."),
    "tubulin": ("Microtubule tubulin", "Spindle and transport rails inside fungal cells.", "Conserved core, mild tip drift."),
    "cdk": ("Cyclin-dependent kinase", "Cell-cycle engine — baker's CDC28 vs fission CDC2.", "Classic yeast genetics module."),
    "suc": ("Invertase / sugar split", "SUC2-style sucrose cleavage — yeast sugar story.", "Often yeast-enriched."),
}

for gid, g in list(genes.items()):
    fam = g.get("family") or gid.lower()
    g.setdefault("family", fam)
    title, why, cons = FAMILY_TEACH.get(fam, (f"{fam} family", "Recurring fungal gene family.", "Core shared, tips diverge."))
    g["family_detail"] = {
        "title": title,
        "plain_english": why,
        "why_it_matters": why,
        "conservation": cons,
    }
    # enrich step plain_english if short
    for s in g.get("steps") or []:
        if len(s.get("plain_english") or "") < 60:
            s["plain_english"] = (s.get("plain_english") or "") + " This is teaching-layer detail — mock / simplified sequence hints only."

organisms = []
for i, f in enumerate(FUNGI, start=1):
    linear = build_linear(f["slug"], f["clue"], i)
    gene_ids = [s["id"] for s in linear]
    # register genes + org membership
    for s in linear:
        ensure_gene(genes, s["id"], s["family"], orgs=[f["slug"]], stub=s["id"] not in ("SUC2","ACT1","HO","TEF1","EF1A","CDC28","CDC2") and genes.get(s["id"],{}).get("stub", True))
        if s["id"] in genes:
            # keep curated non-stub if already annotated
            pass
    shared = [s["id"] for s in linear if s["family"] in ("actin","tef","tubulin","cdk","gapdh","pgk","eno","pyk","atp","cox","hsp70","hsp90","rad51","rps","rpl")]
    unique = [s["id"] for s in linear if s["id"] not in shared]
    organisms.append({
        "id": i,
        "slug": f["slug"],
        "common_name": f["common"],
        "scientific_name": f["sci"],
        "short_blurb": f["blurb"],
        "note": "Fungi only · mock / public-annotation style seed",
        "glow": f["glow"],
        "clade": f["clade"],
        "form": f["form"],
        "overview": f["overview"],
        "genes": gene_ids,
        "shared_genes": shared,
        "unique_genes": unique,
        "genome_source": "mock-public",
        "is_public_genome": True,
        "default": bool(f.get("default")),
        "linear": linear,
    })

# Ensure curated genes keep rich content & organisms lists updated from membership
for o in organisms:
    for gid in o["genes"]:
        if gid in genes:
            cur=set(genes[gid].get("organisms") or [])
            cur.add(o["slug"])
            genes[gid]["organisms"]=sorted(cur)

# Alias EF1A if present
if "EF1A" in genes and "TEF1" in genes:
    genes["EF1A"].setdefault("family", "tef")
    genes["EF1A"].setdefault("alias_of", "TEF1")

out_org = {
    "organisms": organisms,
    "source": "static-seed",
    "default_organism": "bakers-yeast",
    "compare_defaults": {"a": "bakers-yeast", "b": "schizosaccharomyces", "gene": "ACT1"},
    "panel_defaults": {"selected": ["bakers-yeast", "schizosaccharomyces", "oyster-mushroom"], "reference": "bakers-yeast", "filter": "all"},
    "lod_levels": [
        {"id": "organism", "label": "Organism", "zoom": 0.75, "plain": "Overview of one fungus — habitat, clade, why it teaches."},
        {"id": "family", "label": "Gene / family", "zoom": 1.35, "plain": "What this gene family does across fungi."},
        {"id": "central-dogma", "label": "DNA → mRNA → protein", "zoom": 1.95, "plain": "Stepped story inside one locus."},
    ],
}

ORG_PATH.write_text(json.dumps(out_org, indent=2) + "\n")
GENE_PATH.write_text(json.dumps(genes, indent=2) + "\n")
print(f"Wrote {len(organisms)} organisms, {len(genes)} genes")

# Embed into index.html
html = INDEX.read_text()
# Replace window.HYPHA_ORG = {...};
# and window.HYPHA_GENES = {...};
org_js = "window.HYPHA_ORG = " + json.dumps(out_org, indent=2) + ";\n"
gene_js = "window.HYPHA_GENES = " + json.dumps(genes, indent=2) + ";\n"

def replace_assign(src, name, new_stmt):
    # find window.NAME = ... matching braces
    token = f"window.{name} ="
    start = src.find(token)
    if start < 0:
        raise SystemExit(f"missing {token}")
    i = src.find("{", start)
    depth = 0
    j = i
    while j < len(src):
        c = src[j]
        if c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                j += 1
                break
        j += 1
    # skip trailing ; and whitespace/newlines
    end = j
    if end < len(src) and src[end] == ";":
        end += 1
    if end < len(src) and src[end] == "\n":
        end += 1
    return src[:start] + new_stmt + src[end:]

html = replace_assign(html, "HYPHA_ORG", org_js)
html = replace_assign(html, "HYPHA_GENES", gene_js)

# bump cache bust
html = re.sub(r'\?v=[^"]+', '?v=bg3', html)
# ensure script tags have v=
for f in ["css/hyphaneural.css", "js/canvas.js", "js/gene-follow.js", "js/panel.js", "js/app.js"]:
    html = re.sub(rf'(href|src)="{re.escape(f)}"(\?v=[^"]*)?', rf'\1="{f}?v=bg3"', html)

INDEX.write_text(html)
print("Embedded into index.html, cache v=bg3")
print("Organism slugs:")
for o in organisms:
    print(" -", o["slug"], o["scientific_name"])
