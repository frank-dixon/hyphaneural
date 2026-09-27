from django.contrib import admin
from .models import Organism


@admin.register(Organism)
class OrganismAdmin(admin.ModelAdmin):
    list_display = ("common_name", "scientific_name", "slug", "is_public_genome")
    prepopulated_fields = {"slug": ("common_name",)}
