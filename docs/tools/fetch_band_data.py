#!/usr/bin/env python3
"""Build-time fetch: real fungal gene bands (UniProt + Ensembl Fungi). Never invents."""
from __future__ import annotations
import json, time, urllib.error, urllib.parse, urllib.request, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "bands.json"
PROG = Path("/tmp/band_fetch_progress.json")
UA = "HyphaneuralBandFetch/1.3 (frank-dixon.github.io/hyphaneural; educational)"

YEAST_GENES = [
    "ACT1", "TEF1", "TUB1", "CDC28", "PGK1", "TDH3", "ENO2", "PYK1",
    "ATP2", "HSP82", "SSA1", "RAD51", "RPS5", "RPL25", "URA3", "HIS3",
    "ADE2", "LEU2", "SIR2", "SUC2", "HO", "FLO11", "GAL1", "STE2", "MFA1",
]

ORTHO_TARGETS = [
    {"key": "schizosaccharomyces", "ensembl_species": "schizosaccharomyces_pombe", "taxon": 4896,
     "label": "Schizosaccharomyces pombe", "common": "Fission yeast"},
    {"key": "candida-albicans", "ensembl_species": "candida_albicans", "taxon": 5476,
     "label": "Candida albicans", "common": "C. albicans"},
    {"key": "neurospora", "ensembl_species": "neurospora_crassa", "taxon": 5141,
     "label": "Neurospora crassa", "common": "Red bread mold"},
    {"key": "aspergillus-nidulans", "ensembl_species": "aspergillus_nidulans", "taxon": 162425,
     "label": "Aspergillus nidulans", "common": "A. nidulans"},
]

def log(msg):
    print(msg, flush=True)

def http_json(url, headers=None, retries=3):
    h = {"User-Agent": UA, "Accept": "application/json"}
    if headers: h.update(headers)
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=h)
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 404): return None
            if e.code in (429, 503): time.sleep(1.5 + attempt)
            else: time.sleep(0.6)
        except Exception as e:
            last = e
            time.sleep(0.6 + attempt)
    log(f"  FAIL {url} {last}")
    return None

def uniprot_yeast(gene):
    q = f"gene_exact:{gene} AND organism_id:559292 AND reviewed:true"
    url = "https://rest.uniprot.org/uniprotkb/search?" + urllib.parse.urlencode({
        "query": q, "fields": "accession,gene_names,length,protein_name,xref_sgd",
        "format": "json", "size": "1"})
    data = http_json(url)
    if not data or not data.get("results"): return None
    r = data["results"][0]
    acc = r.get("primaryAccession")
    length = (r.get("sequence") or {}).get("length")
    genes = r.get("genes") or []
    primary = locus = None
    if genes:
        g0 = genes[0]
        primary = (g0.get("geneName") or {}).get("value")
        ol = g0.get("orderedLocusNames") or []
        if ol: locus = ol[0].get("value")
    sgd = None
    for x in r.get("uniProtKBCrossReferences") or []:
        if x.get("database") == "SGD":
            sgd = x.get("id"); break
    pname = None
    rn = (r.get("proteinDescription") or {}).get("recommendedName") or {}
    if rn.get("fullName"): pname = rn["fullName"].get("value")
    synonyms = []
    if genes:
        for s in (genes[0].get("synonyms") or []):
            if s.get("value"): synonyms.append(s["value"])
    return {
        "uniprot": acc, "length_aa": length, "gene_primary": primary or gene,
        "gene_synonyms": synonyms,
        "locus_tag": locus, "sgd_id": sgd, "protein_name": pname,
        "organism": "Saccharomyces cerevisiae (S288c)", "taxon_id": 559292,
        "urls": {
            "uniprot": f"https://www.uniprot.org/uniprotkb/{acc}" if acc else None,
            "sgd": f"https://www.yeastgenome.org/locus/{sgd}" if sgd else f"https://www.yeastgenome.org/locus/{gene}",
        },
    }

def ensembl_from_payload(data):
    if not data or not data.get("id"): return None
    return {
        "ensembl_id": data.get("id"), "display_name": data.get("display_name"),
        "chromosome": data.get("seq_region_name"), "start": data.get("start"),
        "end": data.get("end"), "strand": data.get("strand"),
        "biotype": data.get("biotype"), "assembly": data.get("assembly_name"),
        "description": data.get("description"),
        "urls": {"ensembl": "https://fungi.ensembl.org/Saccharomyces_cerevisiae/Gene/Summary?g="
                 + urllib.parse.quote(str(data.get("id")))},
    }

def ensembl_lookup_candidates(symbols, locus_tag=None):
    """Try symbol lookup, then Ensembl gene id / locus (no invented ids)."""
    tried = []
    for sym in symbols:
        if not sym or sym in tried: continue
        tried.append(sym)
        url = ("https://rest.ensembl.org/lookup/symbol/saccharomyces_cerevisiae/"
               + urllib.parse.quote(sym) + "?content-type=application/json")
        data = http_json(url, headers={"Content-Type": "application/json"})
        hit = ensembl_from_payload(data)
        if hit:
            hit["resolved_via"] = "symbol:" + sym
            return hit
        time.sleep(0.12)
        # xrefs/symbol can resolve aliases Ensembl symbol lookup rejects
        xref = http_json(
            "https://rest.ensembl.org/xrefs/symbol/saccharomyces_cerevisiae/"
            + urllib.parse.quote(sym) + "?content-type=application/json",
            headers={"Content-Type": "application/json"})
        time.sleep(0.12)
        if xref:
            for row in xref:
                if row.get("type") == "gene" and row.get("id"):
                    data = http_json(
                        "https://rest.ensembl.org/lookup/id/"
                        + urllib.parse.quote(row["id"]) + "?content-type=application/json",
                        headers={"Content-Type": "application/json"})
                    hit = ensembl_from_payload(data)
                    if hit:
                        hit["resolved_via"] = "xref:" + sym + "→" + row["id"]
                        return hit
    if locus_tag:
        data = http_json(
            "https://rest.ensembl.org/lookup/id/"
            + urllib.parse.quote(locus_tag) + "?content-type=application/json",
            headers={"Content-Type": "application/json"})
        hit = ensembl_from_payload(data)
        if hit:
            hit["resolved_via"] = "locus:" + locus_tag
            return hit
    return None

def ensembl_orthologs(symbol_candidates):
    """Orthologues via homology/symbol (Fungi REST; homology/id returns 404 here)."""
    # Pick first symbol Ensembl Compara accepts (usually display_name or teaching symbol).
    working = None
    for sym in symbol_candidates:
        if not sym: continue
        probe = ("https://rest.ensembl.org/homology/symbol/saccharomyces_cerevisiae/"
                 + urllib.parse.quote(sym) + "?"
                 + urllib.parse.urlencode({
                     "content-type": "application/json", "type": "orthologues",
                     "format": "condensed", "target_taxon": str(ORTHO_TARGETS[0]["taxon"])}))
        data = http_json(probe, headers={"Content-Type": "application/json"})
        time.sleep(0.15)
        if data and data.get("data") is not None:
            working = sym
            break
    out = {}
    if not working:
        for t in ORTHO_TARGETS:
            out[t["key"]] = None
        return out
    for t in ORTHO_TARGETS:
        url = ("https://rest.ensembl.org/homology/symbol/saccharomyces_cerevisiae/"
               + urllib.parse.quote(working) + "?"
               + urllib.parse.urlencode({
                   "content-type": "application/json", "type": "orthologues",
                   "format": "condensed", "target_taxon": str(t["taxon"])}))
        data = http_json(url, headers={"Content-Type": "application/json"})
        time.sleep(0.2)
        hit = None
        if data and data.get("data"):
            for block in data["data"]:
                for h in block.get("homologies") or []:
                    if h.get("id"):
                        hit = {
                            "id": h["id"], "protein_id": h.get("protein_id"),
                            "species": h.get("species"), "type": h.get("type"),
                            "taxonomy_level": h.get("taxonomy_level"),
                            "label": t["label"], "common": t["common"],
                            "urls": {
                                "ensembl_rest": "https://rest.ensembl.org/lookup/id/"
                                + urllib.parse.quote(h["id"]) + "?content-type=application/json"
                            },
                        }
                        break
                if hit: break
        out[t["key"]] = hit
    return out

def genomic_length_bp(ens):
    if ens.get("start") is None or ens.get("end") is None: return None
    return abs(int(ens["end"]) - int(ens["start"])) + 1

def main():
    log("Fetching real fungal band records (UniProt + Ensembl Fungi)…")
    bands, skipped = [], []
    for i, gene in enumerate(YEAST_GENES):
        log(f"[{i+1}/{len(YEAST_GENES)}] {gene}")
        PROG.write_text(json.dumps({"i": i+1, "gene": gene, "n": len(YEAST_GENES)}))
        up = uniprot_yeast(gene)
        time.sleep(0.12)
        if not up or not up.get("uniprot"):
            skipped.append({"gene": gene, "reason": "no UniProt Swiss-Prot hit for S. cerevisiae S288c"})
            log("  skip — no UniProt"); continue
        candidates = [gene, up.get("gene_primary")] + list(up.get("gene_synonyms") or [])
        ens = ensembl_lookup_candidates(candidates, locus_tag=up.get("locus_tag"))
        time.sleep(0.15)
        if not ens or not ens.get("ensembl_id"):
            skipped.append({"gene": gene, "reason": "no Ensembl Fungi lookup for teaching symbol, UniProt primary/synonyms, or locus tag"})
            log("  skip — no Ensembl"); continue
        log(f"  ensembl via {ens.get('resolved_via')}")
        ortho_syms = [
            ens.get("display_name"), gene, up.get("gene_primary"),
        ] + list(up.get("gene_synonyms") or [])
        orthos = ensembl_orthologs(ortho_syms)
        n_ortho = sum(1 for v in orthos.values() if v)
        band = {
            "gene_id": gene,
            "sources": {"uniprot": up, "ensembl": ens, "orthologs": orthos},
            "chromosome": ens.get("chromosome"),
            "genomic_start": ens.get("start"), "genomic_end": ens.get("end"),
            "genomic_length_bp": genomic_length_bp(ens),
            "protein_length_aa": up.get("length_aa"),
            "locus_tag": up.get("locus_tag") or ens.get("ensembl_id"),
            "protein_name": up.get("protein_name"),
            "uniprot_accession": up.get("uniprot"),
            "sgd_id": up.get("sgd_id"), "ensembl_id": ens.get("ensembl_id"),
            "ortholog_count": n_ortho,
            "ortholog_targets_checked": len(ORTHO_TARGETS),
            "citations": [
                {"source": "UniProtKB/Swiss-Prot", "id": up["uniprot"],
                 "url": up["urls"]["uniprot"],
                 "field": "protein length (aa), accession, protein name"},
                {"source": "Ensembl Fungi", "id": ens["ensembl_id"],
                 "url": ens["urls"]["ensembl"],
                 "field": "chromosome, genomic start/end, locus id"},
            ] + ([{"source": "SGD", "id": up["sgd_id"], "url": up["urls"]["sgd"],
                   "field": "yeast gene curation cross-reference"}] if up.get("sgd_id") else []),
        }
        bands.append(band)
        log(f"  OK {up['uniprot']} chr{ens.get('chromosome')} "
            f"{ens.get('start')}-{ens.get('end')} len={up.get('length_aa')}aa orthos={n_ortho}/{len(ORTHO_TARGETS)}")

    CHR_ORDER = {c: i for i, c in enumerate(
        ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","Mito","MT"], 1)}
    bands.sort(key=lambda b: (CHR_ORDER.get(str(b.get("chromosome") or ""), 50),
                              b.get("genomic_start") or 0, b["gene_id"]))

    payload = {
        "version": 1,
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "organism": {
            "slug": "bakers-yeast",
            "scientific_name": "Saccharomyces cerevisiae",
            "strain": "S288c / ATCC 204508",
            "taxon_id": 559292,
            "assembly": "R64-1-1",
            "citations": [{
                "source": "NCBI Taxonomy", "id": "559292",
                "url": "https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=559292",
                "field": "organism taxon"},
                {"source": "Ensembl Fungi", "id": "saccharomyces_cerevisiae",
                 "url": "https://fungi.ensembl.org/Saccharomyces_cerevisiae/Info/Index",
                 "field": "genome assembly R64-1-1"}],
        },
        "apis": [
            {"name": "UniProtKB REST", "url": "https://rest.uniprot.org/",
             "used_for": "Swiss-Prot accession, protein length (aa), protein name, SGD xref"},
            {"name": "Ensembl Fungi REST", "url": "https://rest.ensembl.org/",
             "used_for": "chromosome, genomic coordinates, locus id, orthologue condensed homology"},
            {"name": "SGD (via UniProt xref)", "url": "https://www.yeastgenome.org/",
             "used_for": "yeast gene identifiers cross-referenced from UniProt"},
        ],
        "band_encoding": {
            "position": "Ensembl chromosome order, then genomic start (bp)",
            "intensity_height": "UniProt protein length (amino acids) — taller band = longer protein",
            "color": "Teal when Ensembl Compara reports ≥1 ortholog among checked fungi; pale when unique in that check set",
            "label": "Gene symbol + UniProt accession shown on select / hover",
        },
        "ortholog_targets": ORTHO_TARGETS,
        "bands": bands,
        "skipped": skipped,
        "notes": [
            "Only genes with both UniProt Swiss-Prot and Ensembl Fungi hits are included.",
            "Ortholog gaps mean Ensembl returned no orthologue for that target taxon.",
            "Teaching prose may use plain language; band metrics and IDs are API-backed.",
        ],
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    PROG.write_text(json.dumps({"done": True, "bands": len(bands), "skipped": len(skipped)}))
    log(f"Wrote {OUT} — {len(bands)} bands, {len(skipped)} skipped")

if __name__ == "__main__":
    main()
