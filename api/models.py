from django.conf import settings
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils.text import slugify

User = settings.AUTH_USER_MODEL


class Category(models.Model):
    name = models.CharField(max_length=50)
    slug = models.SlugField(unique=True)
    code = models.CharField(max_length=3, help_text="Used in vehicle IDs e.g. MOT")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Vehicle(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE"
        RESERVED = "RESERVED"
        SOLD = "SOLD"

    vehicle_id = models.CharField(max_length=20, unique=True, blank=True)  # e.g. AMN-MOT-0024
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="vehicles")
    brand = models.CharField(max_length=60, db_index=True)
    model = models.CharField(max_length=80, db_index=True)
    year = models.PositiveSmallIntegerField(db_index=True)
    price = models.DecimalField(max_digits=12, decimal_places=0, db_index=True, help_text="TZS")
    condition = models.CharField(max_length=30, default="Used - Good")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.AVAILABLE, db_index=True)
    featured = models.BooleanField(default=False)
    # Optional specs - only filled when relevant for the vehicle type
    mileage = models.PositiveIntegerField(null=True, blank=True, help_text="km")
    engine_cc = models.PositiveIntegerField(null=True, blank=True)
    fuel_type = models.CharField(max_length=20, blank=True)
    transmission = models.CharField(max_length=20, blank=True)
    color = models.CharField(max_length=30, blank=True)
    extra_specs = models.JSONField(default=dict, blank=True, help_text="Any other type-specific specs")
    description = models.TextField(blank=True)
    is_deleted = models.BooleanField(default=False)  # soft delete
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def title(self):
        return f"{self.brand} {self.model} {self.year}"

    def save(self, *a, **kw):
        if not self.vehicle_id:
            n = (Vehicle.objects.order_by("-id").values_list("id", flat=True).first() or 0) + 1
            self.vehicle_id = f"AMN-{self.category.code}-{n:04d}"
        super().save(*a, **kw)

    def __str__(self):
        return f"{self.vehicle_id} {self.title}"


class VehicleImage(models.Model):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="vehicles/%Y/%m/")
    position = models.PositiveSmallIntegerField(default=0)
    is_cover = models.BooleanField(default=False)

    class Meta:
        ordering = ["position", "id"]


class VehicleVideo(models.Model):
    vehicle = models.OneToOneField(Vehicle, on_delete=models.CASCADE, related_name="video")
    file = models.FileField(upload_to="videos/%Y/%m/")


class Like(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="likes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "vehicle"], name="unique_like")]


class SavedVehicle(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="saves")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "vehicle"], name="unique_save")]
        ordering = ["-created_at"]


class Comment(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="comments")
    text = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Inquiry(models.Model):
    class Status(models.TextChoices):
        NEW = "NEW"
        CONTACTED = "CONTACTED"
        CLOSED = "CLOSED"

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="inquiries")
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=30)
    message = models.TextField(max_length=1000)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.NEW, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "inquiries"


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    phone = models.CharField(max_length=30, blank=True)
    email_notifications = models.BooleanField(default=False)  # new-vehicle alerts
    marketing_emails = models.BooleanField(default=False)  # offers / news


@receiver(post_save, sender=User)
def create_profile(sender, instance, created, **kw):
    if created:
        Profile.objects.create(user=instance)


class BusinessProfile(models.Model):
    """Single row today. Add a `Location` model later for multiple branches."""
    name = models.CharField(max_length=100, default="Amani Motors")
    tagline = models.CharField(max_length=200, default="Quality used vehicles you can trust")
    logo = models.ImageField(upload_to="brand/", blank=True)
    phone = models.CharField(max_length=30, default="+255700000000")
    whatsapp = models.CharField(max_length=30, default="255700000000", help_text="Digits only, with country code")
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=200, default="Mabibo, Dar es Salaam, Tanzania")
    opening_hours = models.CharField(max_length=200, default="Mon-Sat 8:00 - 18:00")
    about = models.TextField(default="We sell carefully inspected used cars, motorcycles, bajaji and guta in Dar es Salaam.")
    instagram = models.URLField(blank=True)
    facebook = models.URLField(blank=True)
    tiktok = models.URLField(blank=True)

    @classmethod
    def get(cls):
        return cls.objects.first() or cls.objects.create()


class Activity(models.Model):
    """Basic audit trail; extend later into full activity logs."""
    user = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=40)
    detail = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "activities"


def log(user, action, detail=""):
    Activity.objects.create(user=user if getattr(user, "is_authenticated", False) else None, action=action, detail=detail)
