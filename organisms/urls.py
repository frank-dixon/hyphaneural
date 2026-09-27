from django.urls import path
from . import views

urlpatterns = [
    path("organisms/", views.api_organisms, name="api_organisms"),
    path("organisms/<slug:slug>/", views.api_organism_detail, name="api_organism_detail"),
    path("genes/<str:gene_id>/", views.api_gene_stub, name="api_gene_stub"),
]
