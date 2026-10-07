from django.contrib.auth import get_user_model, password_validation
from rest_framework import serializers
from .models import *

U = get_user_model()


class CategorySerializer(serializers.ModelSerializer):
    count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "count"]

    def get_count(self, o):
        return o.vehicles.filter(is_deleted=False).exclude(status="SOLD").count()


class VehicleImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleImage
        fields = ["id", "image", "position", "is_cover"]


class VehicleSerializer(serializers.ModelSerializer):
    vehicle_id = serializers.CharField(required=False, allow_blank=True, max_length=20)
    category = serializers.SlugRelatedField(slug_field="slug", queryset=Category.objects.all())
    category_name = serializers.CharField(source="category.name", read_only=True)
    title = serializers.CharField(read_only=True)
    cover = serializers.SerializerMethodField()
    images = VehicleImageSerializer(many=True, read_only=True)
    video = serializers.SerializerMethodField()
    likes_count = serializers.SerializerMethodField()
    comments_count = serializers.SerializerMethodField()
    liked = serializers.SerializerMethodField()
    saved = serializers.SerializerMethodField()

    class Meta:
        model = Vehicle
        fields = ["id", "vehicle_id", "title", "category", "category_name", "brand", "model", "year", "price",
                  "condition", "status", "featured", "mileage", "engine_cc", "fuel_type", "transmission", "color",
                  "extra_specs", "description", "created_at", "cover", "images", "video", "likes_count",
                  "comments_count", "liked", "saved"]
        read_only_fields = ["id", "created_at"]

    def validate_vehicle_id(self, v):
        v = v.strip().upper()
        if v and Vehicle.objects.filter(vehicle_id=v).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("This vehicle ID is already used.")
        return v

    def validate_year(self, v):
        if not 1960 <= v <= 2100:
            raise serializers.ValidationError("Enter a valid year.")
        return v

    def validate_price(self, v):
        if v <= 0:
            raise serializers.ValidationError("Price must be greater than zero.")
        return v

    def get_cover(self, o):
        imgs = list(o.images.all())
        c = next((i for i in imgs if i.is_cover), imgs[0] if imgs else None)
        return c.image.url if c else None

    def get_video(self, o):
        v = getattr(o, "video", None)
        return v.file.url if v else None

    def get_likes_count(self, o):
        return getattr(o, "likes_count", None) if hasattr(o, "likes_count") else o.likes.count()

    def get_comments_count(self, o):
        return getattr(o, "comments_count") if hasattr(o, "comments_count") else o.comments.count()

    def get_liked(self, o):
        return o.id in self.context.get("liked", ())

    def get_saved(self, o):
        return o.id in self.context.get("saved", ())


class CommentSerializer(serializers.ModelSerializer):
    user = serializers.CharField(source="user.first_name", read_only=True)
    vehicle_id = serializers.CharField(source="vehicle.vehicle_id", read_only=True)
    mine = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ["id", "user", "text", "created_at", "vehicle_id", "mine"]

    def get_mine(self, o):
        r = self.context.get("request")
        return bool(r and r.user.is_authenticated and r.user_id == o.user_id)

    def validate_text(self, v):
        v = v.strip()
        if len(v) < 2:
            raise serializers.ValidationError("Comment is too short.")
        return v


class InquirySerializer(serializers.ModelSerializer):
    vehicle = serializers.SlugRelatedField(slug_field="vehicle_id", queryset=Vehicle.objects.filter(is_deleted=False))
    vehicle_title = serializers.CharField(source="vehicle.title", read_only=True)

    class Meta:
        model = Inquiry
        fields = ["id", "vehicle", "vehicle_title", "name", "phone", "message", "status", "created_at"]
        read_only_fields = ["status", "created_at"]


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ["phone", "email_notifications", "marketing_emails"]


class MeSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer()
    name = serializers.CharField(source="first_name")

    class Meta:
        model = U
        fields = ["id", "name", "email", "is_staff", "profile"]
        read_only_fields = ["email", "is_staff"]

    def update(self, inst, data):
        p = data.pop("profile", {})
        inst.first_name = data.get("first_name", inst.first_name)
        inst.save()
        for k, v in p.items():
            setattr(inst.profile, k, v)
        inst.profile.save()
        return inst


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=60)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, v):
        v = v.lower()
        if U.objects.filter(username=v).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return v

    def validate(self, d):
        password_validation.validate_password(d["password"], U(username=d["email"], first_name=d["name"]))
        return d

    def create(self, d):
        return U.objects.create_user(username=d["email"], email=d["email"], password=d["password"], first_name=d["name"])


class BusinessSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessProfile
        exclude = ["id"]
