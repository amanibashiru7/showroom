from django.core.management.base import BaseCommand
from api.models import Vehicle, VehicleImage


class Command(BaseCommand):
    help = "Fix photo order and cover for vehicles uploaded before the multi-upload fix (keeps every photo)."

    def handle(self, *a, **kw):
        fixed = 0
        for v in Vehicle.objects.all():
            imgs = list(VehicleImage.objects.filter(vehicle=v).order_by("id"))
            if not imgs:
                continue
            covers = [i for i in imgs if i.is_cover]
            keep = covers[0] if len(covers) == 1 else imgs[0]  # keep a single deliberate cover, else the first photo
            for pos, im in enumerate(imgs):
                want_cover = im.pk == keep.pk
                if im.position != pos or im.is_cover != want_cover:
                    VehicleImage.objects.filter(pk=im.pk).update(position=pos, is_cover=want_cover)
                    fixed += 1
        self.stdout.write(self.style.SUCCESS(f"Repaired {fixed} photo record(s)."))
        