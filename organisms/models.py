from django.db import models


class Organism(models.Model):
    slug = models.SlugField(unique=True)
    common_name = models.CharField(max_length=120)
    scientific_name = models.CharField(max_length=160)
    short_blurb = models.TextField()
    note = models.TextField(blank=True)
    map_x = models.FloatField()
    map_y = models.FloatField()
    glow = models.CharField(max_length=20, default="#3d9e8f")
    shared_genes = models.JSONField(default=list)
    unique_genes = models.JSONField(default=list)
    genome_source = models.CharField(max_length=80, blank=True, default="mock")
    is_public_genome = models.BooleanField(default=True)

    class Meta:
        ordering = ["common_name"]

    def __str__(self):
        return self.common_name

    def to_dict(self):
        return {
            "id": self.id,
            "slug": self.slug,
            "common_name": self.common_name,
            "scientific_name": self.scientific_name,
            "short_blurb": self.short_blurb,
            "note": self.note,
            "x": self.map_x,
            "y": self.map_y,
            "glow": self.glow,
            "shared_genes": self.shared_genes,
            "unique_genes": self.unique_genes,
            "genome_source": self.genome_source,
            "is_public_genome": self.is_public_genome,
        }
