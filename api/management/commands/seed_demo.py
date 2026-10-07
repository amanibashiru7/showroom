import os
import random
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from PIL import Image, ImageDraw

from api.models import *


CATS = [
    ("Cars", "cars", "CAR"),
    ("Motorcycles", "motorcycles", "MOT"),
    ("Bajaji", "bajaji", "BAJ"),
    ("Guta", "guta", "GUT"),
]

DEMO = [
    ("cars", "Toyota", "IST", 2010, 14500000, 1300, 98000, "Petrol", "Automatic", "Silver"),
    ("cars", "Toyota", "Corolla", 2012, 18900000, 1500, 87000, "Petrol", "Automatic", "White"),
    ("cars", "Toyota", "Harrier", 2011, 32000000, 2400, 110000, "Petrol", "Automatic", "Black"),
    ("cars", "Nissan", "Note", 2013, 15800000, 1200, 72000, "Petrol", "Automatic", "Blue"),
    ("cars", "Suzuki", "Escudo", 2009, 21000000, 2000, 130000, "Petrol", "Manual", "Grey"),
    ("cars", "Honda", "Fit", 2012, 13900000, 1300, 90000, "Petrol", "Automatic", "Red"),

    ("motorcycles", "Boxer", "BM150", 2021, 2900000, 150, 18000, "Petrol", "Manual", "Black"),
    ("motorcycles", "TVS", "HLX 125", 2020, 2300000, 125, 24000, "Petrol", "Manual", "Red"),
    ("motorcycles", "Honda", "CG 125", 2019, 2100000, 125, 31000, "Petrol", "Manual", "Blue"),
    ("motorcycles", "Haojue", "HJ150", 2022, 3200000, 150, 9000, "Petrol", "Manual", "White"),

    ("bajaji", "Bajaj", "RE Auto", 2018, 8500000, 200, 40000, "Petrol", "Manual", "Yellow"),
    ("bajaji", "TVS", "King", 2019, 9200000, 200, 35000, "Petrol", "Manual", "Green"),
    ("bajaji", "Piaggio", "Ape City", 2017, 7600000, 200, 52000, "Diesel", "Manual", "Blue"),

    ("guta", "Piaggio", "Ape Truck", 2018, 9800000, 400, 45000, "Diesel", "Manual", "White"),
    ("guta", "Bajaj", "Maxima Cargo", 2019, 10500000, 400, 38000, "Diesel", "Manual", "Red"),
    ("guta", "TVS", "King Cargo", 2020, 11200000, 400, 27000, "Petrol", "Manual", "Grey"),
]

PALETTE = {
    "Silver": (150, 160, 170),
    "White": (200, 205, 210),
    "Black": (40, 42, 48),
    "Blue": (40, 90, 160),
    "Grey": (100, 105, 112),
    "Red": (170, 40, 45),
    "Yellow": (200, 160, 30),
    "Green": (40, 120, 80),
}


def placeholder(label, color, shade):
    w, h = 1200, 900

    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)

    for y in range(h):
        k = y / h
        d.line(
            [(0, y), (w, y)],
            fill=tuple(
                int(c * (1 - 0.5 * k) + shade * k * 0.3)
                for c in color
            ),
        )

    d.rounded_rectangle(
        [250, 420, 950, 640],
        60,
        fill=(15, 20, 30)
    )

    d.ellipse([320, 590, 460, 730], fill=(0, 0, 0))
    d.ellipse([740, 590, 880, 730], fill=(0, 0, 0))

    d.text(
        (60, 60),
        label + "  (demo photo)",
        fill=(255, 255, 255)
    )

    buf = BytesIO()
    img.save(buf, "JPEG", quality=80)

    return ContentFile(buf.getvalue())


class Command(BaseCommand):
    help = "Create categories, business profile, demo vehicles and a demo admin user."

    def handle(self, *a, **kw):

        # Create categories
        for i, (n, s, c) in enumerate(CATS):
            Category.objects.get_or_create(
                slug=s,
                defaults={
                    "name": n,
                    "code": c,
                    "order": i
                }
            )

        # Create business profile
        BusinessProfile.get()

        # Get User model
        U = get_user_model()

        # Create or update admin account
        admin, created = U.objects.get_or_create(
            username="admin@gmail.com",
            defaults={
                "email": "admin@gmail.com",
                "first_name": "Owner",
            }
        )

        # Password comes from Render Environment Variable
        admin.set_password(
            os.environ.get(
                "SEED_ADMIN_PASSWORD",
                "jamali123@#"
            )
        )

        admin.is_staff = True
        admin.is_superuser = True
        admin.is_active = True
        admin.save()

        self.stdout.write(
            self.style.SUCCESS(
                "Admin ready: admin@gmail.com"
            )
        )

        # Don't create demo vehicles if they already exist
        if Vehicle.objects.exists():
            return self.stdout.write(
                "Vehicles already exist - skipping demo vehicles."
            )

        random.seed(4)

        # Create demo vehicles
        for i, (
            cat,
            brand,
            model,
            year,
            price,
            cc,
            km,
            fuel,
            tr,
            color
        ) in enumerate(DEMO):

            v = Vehicle.objects.create(
                category=Category.objects.get(slug=cat),
                brand=brand,
                model=model,
                year=year,
                price=price,
                engine_cc=cc,
                mileage=km,
                fuel_type=fuel,
                transmission=tr,
                color=color,
                condition=random.choice([
                    "Used - Good",
                    "Used - Excellent",
                    "Used - Fair"
                ]),
                featured=i % 5 == 0,
                status=random.choice([
                    "AVAILABLE"
                ] * 5 + [
                    "RESERVED",
                    "SOLD"
                ]),
                description=(
                    f"{brand} {model} {year} in {color.lower()}. "
                    "Inspected and ready for a new owner at our Mabibo showroom. "
                    "Visit us or message us on WhatsApp."
                )
            )

            # Create demo vehicle images
            for p in range(random.randint(1, 3)):

                VehicleImage.objects.create(
                    vehicle=v,
                    position=p,
                    is_cover=p == 0,
                    image=ContentFile(
                        placeholder(
                            f"{brand} {model}",
                            PALETTE[color],
                            p * 60
                        ).read(),
                        name=f"{v.vehicle_id}-{p}.jpg"
                    )
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(DEMO)} demo vehicles."
            )
        )
