import json
from django.contrib.auth import authenticate, login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_http_methods

from .models import Organism

# Stub gene central dogma steps — structure ready for real annotation APIs
GENE_STUBS = {
    "ACT1": {
        "id": "ACT1",
        "name": "Actin",
        "role": "Cytoskeleton filament; shared across fungi",
        "steps": [
            {"stage": "DNA", "label": "ACT1 locus", "seq_hint": "ATGTGTGAC…"},
            {"stage": "RNA", "label": "actin mRNA", "seq_hint": "AUGUGUGAC…"},
            {"stage": "Protein", "label": "actin monomer", "seq_hint": "MCDD…"},
        ],
    },
    "EF1A": {
        "id": "EF1A",
        "name": "Elongation factor 1-α",
        "role": "Translation machinery; highly conserved",
        "steps": [
            {"stage": "DNA", "label": "EF1A locus", "seq_hint": "ATGGGTAAA…"},
            {"stage": "RNA", "label": "EF1A mRNA", "seq_hint": "AUGGGUAAA…"},
            {"stage": "Protein", "label": "EF-1α", "seq_hint": "MGKE…"},
        ],
    },
    "PSI": {
        "id": "PSI",
        "name": "Public annotation marker (stub)",
        "role": "Placeholder for public-genome annotation only — no cultivation content",
        "steps": [
            {"stage": "DNA", "label": "annotated locus", "seq_hint": "public…"},
            {"stage": "RNA", "label": "transcript stub", "seq_hint": "public…"},
            {"stage": "Protein", "label": "product stub", "seq_hint": "…"},
        ],
    },
}


def login_view(request):
    if request.user.is_authenticated:
        return redirect("map")
    error = None
    if request.method == "POST":
        user = authenticate(
            request,
            username=request.POST.get("username", ""),
            password=request.POST.get("password", ""),
        )
        if user:
            login(request, user)
            return redirect("map")
        error = "Invalid credentials"
    return render(request, "login.html", {"error": error})


def signup_view(request):
    if request.user.is_authenticated:
        return redirect("map")
    form = UserCreationForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        login(request, user)
        return redirect("map")
    return render(request, "signup.html", {"form": form})


@login_required
def map_view(request):
    return render(request, "map.html")


@require_GET
@login_required
def api_organisms(request):
    data = [o.to_dict() for o in Organism.objects.all()]
    return JsonResponse({"organisms": data, "source": "db+mock"})


@require_GET
@login_required
def api_organism_detail(request, slug):
    try:
        org = Organism.objects.get(slug=slug)
    except Organism.DoesNotExist:
        return JsonResponse({"error": "not found"}, status=404)
    return JsonResponse(org.to_dict())


@require_GET
@login_required
def api_gene_stub(request, gene_id):
    gene = GENE_STUBS.get(gene_id.upper()) or {
        "id": gene_id,
        "name": gene_id,
        "role": "Stub gene — wire to NCBI / Ensembl Fungi later",
        "steps": [
            {"stage": "DNA", "label": f"{gene_id} locus", "seq_hint": "…"},
            {"stage": "RNA", "label": "transcript", "seq_hint": "…"},
            {"stage": "Protein", "label": "product", "seq_hint": "…"},
        ],
    }
    return JsonResponse(gene)
