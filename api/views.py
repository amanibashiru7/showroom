from django.contrib.auth import authenticate, login, logout
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mass_mail
from django.conf import settings
from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import mixins, status, viewsets, serializers
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import *
from .serializers import *
from .utils import process_image, validate_video


def as_api_error(e):
    return serializers.ValidationError(e.messages if isinstance(e, DjangoValidationError) else str(e))


# ---------- Frontend shell (SEO meta + PWA files) ----------
@ensure_csrf_cookie
def shell(request, vid=None):
    biz = BusinessProfile.get()
    ctx = {"biz": biz, "title": f"{biz.name} | Used Vehicles in Dar es Salaam", "description": biz.tagline,
           "image": "", "url": request.build_absolute_uri()}
    if vid:
        v = Vehicle.objects.filter(vehicle_id=vid, is_deleted=False).first()
        if v:
            imgs = list(v.images.all())
            ctx.update(title=f"{v.title} - TZS {int(v.price):,} | {biz.name}",
                       description=(v.description or f"{v.title} for sale in {biz.address}")[:160],
                       image=request.build_absolute_uri(imgs[0].image.url) if imgs else "")
    return render(request, "index.html", ctx)


def static_file(name, ctype):
    def view(request):
        return FileResponse(open(settings.BASE_DIR / "frontend" / name, "rb"), content_type=ctype)
    return view


# ---------- Auth ----------
class RegisterView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.save()
        login(request, user)
        return Response(MeSerializer(user).data, status=201)


class LoginView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        user = authenticate(request, username=str(request.data.get("email", "")).lower(), password=request.data.get("password", ""))
        if not user:
            return Response({"detail": "Wrong email or password."}, status=400)
        login(request, user)
        return Response(MeSerializer(user).data)


@api_view(["POST"])
def logout_view(request):
    logout(request)
    return Response(status=204)


class MeView(APIView):
    def get(self, request):
        if not request.user.is_authenticated:
            return Response(None)
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        if not request.user.is_authenticated:
            return Response({"detail": "Please log in."}, status=401)
        s = MeSerializer(request.user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)


# ---------- Vehicles ----------
class Pagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 100


ORDERINGS = {"-created_at", "created_at", "price", "-price", "-year", "year", "-likes_count"}


class VehicleViewSet(viewsets.ModelViewSet):
    serializer_class = VehicleSerializer
    pagination_class = Pagination
    lookup_field = "vehicle_id"
    lookup_value_regex = "[^/]+"
    throttle_scope = "comment"

    def get_throttles(self):
        return [ScopedRateThrottle()] if self.action == "comments" and self.request.method == "POST" else []

    def get_permissions(self):
        a = self.action
        if a in ("list", "retrieve", "related") or (a == "comments" and self.request.method == "GET"):
            return [AllowAny()]
        if a in ("like", "save", "comments"):
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = (Vehicle.objects.filter(is_deleted=False).select_related("category", "video").prefetch_related("images")
              .annotate(likes_count=Count("likes", distinct=True), comments_count=Count("comments", distinct=True)))
        p = self.request.query_params
        if p.get("category") and p["category"] != "all":
            qs = qs.filter(category__slug=p["category"])
        if p.get("q"):
            for word in p["q"].split():
                qs = qs.filter(Q(brand__icontains=word) | Q(model__icontains=word) | Q(vehicle_id__icontains=word)
                               | Q(category__name__icontains=word) | Q(color__icontains=word) | Q(description__icontains=word))
        for f in ("brand", "model", "condition", "status"):
            if p.get(f):
                qs = qs.filter(**{f"{f}__iexact": p[f]})
        for key, lookup in (("year_min", "year__gte"), ("year_max", "year__lte"), ("price_min", "price__gte"), ("price_max", "price__lte")):
            if p.get(key, "").isdigit():
                qs = qs.filter(**{lookup: int(p[key])})
        if p.get("featured") == "1":
            qs = qs.filter(featured=True)
        if p.get("available") == "1":
            qs = qs.filter(status="AVAILABLE")
        if p.get("ids"):
            qs = qs.filter(vehicle_id__in=p["ids"].split(",")[:20])
        o = p.get("ordering", "-created_at")
        return qs.order_by(o if o in ORDERINGS else "-created_at", "-id")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        u = self.request.user
        if u.is_authenticated:
            ctx["liked"] = set(Like.objects.filter(user=u).values_list("vehicle_id", flat=True))
            ctx["saved"] = set(SavedVehicle.objects.filter(user=u).values_list("vehicle_id", flat=True))
        return ctx

    def perform_create(self, s):
        v = s.save()
        log(self.request.user, "Vehicle added", v.vehicle_id)

    def perform_update(self, s):
        old = s.instance.status
        v = s.save()
        log(self.request.user, "Vehicle marked sold" if v.status == "SOLD" and old != "SOLD" else "Vehicle updated", v.vehicle_id)

    def perform_destroy(self, v):  # soft delete
        v.is_deleted = True
        v.save(update_fields=["is_deleted"])
        log(self.request.user, "Vehicle deleted", v.vehicle_id)

    @action(detail=True)
    def related(self, request, vehicle_id=None):
        v = self.get_object()
        qs = self.get_queryset().filter(category=v.category).exclude(pk=v.pk)
        qs = qs.filter(Q(brand__iexact=v.brand) | Q(status="AVAILABLE")).order_by("-created_at")[:6]
        return Response(self.get_serializer(qs, many=True).data)

    def _toggle(self, request, model):
        v = self.get_object()
        obj, created = model.objects.get_or_create(user=request.user, vehicle=v)
        if not created:
            obj.delete()
        return Response({"active": created, "count": v.likes.count() if model is Like else v.saves.count()})

    @action(detail=True, methods=["post"])
    def like(self, request, vehicle_id=None):
        return self._toggle(request, Like)

    @action(detail=True, methods=["post"])
    def save(self, request, vehicle_id=None):
        return self._toggle(request, SavedVehicle)

    @action(detail=True, methods=["get", "post"])
    def comments(self, request, vehicle_id=None):
        v = self.get_object()
        if request.method == "POST":
            s = CommentSerializer(data=request.data, context={"request": request})
            s.is_valid(raise_exception=True)
            s.save(user=request.user, vehicle=v)
            return Response(s.data, status=201)
        return Response(CommentSerializer(v.comments.select_related("user"), many=True, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def images(self, request, vehicle_id=None):
        v = self.get_object()
        files = request.FILES.getlist("images")
        if not files:
            raise serializers.ValidationError("Choose at least one image.")
        out, errors = [], []
        # Count straight from the database (v.images is prefetched and would stay stale inside this loop)
        next_pos = VehicleImage.objects.filter(vehicle=v).count()
        has_cover = VehicleImage.objects.filter(vehicle=v, is_cover=True).exists()
        for f in files:  # one bad file must not block the others
            try:
                processed = process_image(f)
            except DjangoValidationError as e:
                errors.append(f"{f.name}: {' '.join(e.messages)}")
                continue
            out.append(VehicleImage.objects.create(vehicle=v, image=processed, position=next_pos, is_cover=not has_cover))
            next_pos += 1
            has_cover = True
        if not out:
            raise serializers.ValidationError(errors)
        return Response({"images": VehicleImageSerializer(out, many=True).data, "errors": errors}, status=201)

    @action(detail=True, methods=["post"], url_path="images/reorder")
    def reorder(self, request, vehicle_id=None):
        v = self.get_object()
        for pos, pk in enumerate(request.data.get("order", [])):
            v.images.filter(pk=pk).update(position=pos)
        return Response({"ok": True})

    @action(detail=True, methods=["post"])
    def video(self, request, vehicle_id=None):
        v = self.get_object()
        f = request.FILES.get("video")
        if not f:
            raise serializers.ValidationError("Choose a video file.")
        try:
            validate_video(f)
        except DjangoValidationError as e:
            raise as_api_error(e)
        VehicleVideo.objects.update_or_create(vehicle=v, defaults={"file": f})
        return Response({"ok": True}, status=201)

    @video.mapping.delete
    def remove_video(self, request, vehicle_id=None):
        VehicleVideo.objects.filter(vehicle=self.get_object()).delete()
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def notify(self, request, vehicle_id=None):
        """Email opted-in customers about this vehicle."""
        v = self.get_object()
        users = U_with_alerts()
        link = f"{settings.SITE_URL}/vehicles/{v.vehicle_id}"
        biz = BusinessProfile.get()
        msgs = [(f"New arrival: {v.title}", f"Hello {u.first_name},\n\n{v.title} - TZS {int(v.price):,}\n{link}\n\n"
                 f"You get this because you enabled email alerts. Turn them off any time in your account.\n{biz.name}",
                 settings.DEFAULT_FROM_EMAIL, [u.email]) for u in users]
        send_mass_mail(msgs, fail_silently=True)
        log(request.user, "Notification sent", f"{v.vehicle_id} to {len(msgs)} users")
        return Response({"sent": len(msgs)})


def U_with_alerts():
    from django.contrib.auth import get_user_model
    return get_user_model().objects.filter(profile__email_notifications=True, is_active=True).exclude(email="")


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    pagination_class = None


# ---------- Inquiries / Comments ----------
class InquiryViewSet(viewsets.ModelViewSet):
    serializer_class = InquirySerializer
    http_method_names = ["get", "post", "patch"]
    pagination_class = Pagination

    def get_permissions(self):
        return [AllowAny()] if self.action == "create" else [IsAdminUser()]

    def get_throttles(self):
        if self.action == "create":
            self.throttle_scope = "inquiry"
            return [ScopedRateThrottle()]
        return []

    def get_queryset(self):
        qs = Inquiry.objects.select_related("vehicle")
        s = self.request.query_params.get("status")
        return qs.filter(status=s) if s else qs

    def perform_create(self, s):
        s.save(user=self.request.user if self.request.user.is_authenticated else None)

    def partial_update(self, request, *a, **kw):
        obj = self.get_object()
        st = request.data.get("status")
        if st not in Inquiry.Status.values:
            raise serializers.ValidationError("Invalid status.")
        obj.status = st
        obj.save(update_fields=["status"])
        log(request.user, "Inquiry status changed", f"{obj.vehicle.vehicle_id} -> {st}")
        return Response(self.get_serializer(obj).data)


class CommentViewSet(viewsets.ReadOnlyModelViewSet):
    """Admin: list all comments. Delete: admin or the comment's owner."""
    serializer_class = CommentSerializer
    permission_classes = [IsAdminUser]
    queryset = Comment.objects.select_related("user", "vehicle")
    pagination_class = Pagination

    @action(detail=True, methods=["delete"], permission_classes=[IsAuthenticated], url_path="remove")
    def remove(self, request, pk=None):
        c = Comment.objects.filter(pk=pk).first()
        if not c or not (request.user.is_staff or c.user_id == request.user.id):
            raise serializers.ValidationError("Not allowed.") if c else Http404
        c.delete()
        return Response(status=204)


# ---------- Customer account lists ----------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_saved(request):
    ids = list(SavedVehicle.objects.filter(user=request.user).values_list("vehicle_id", flat=True))
    qs = Vehicle.objects.filter(pk__in=ids, is_deleted=False).select_related("category", "video").prefetch_related("images")
    return Response(VehicleSerializer(qs, many=True, context={"saved": set(ids), "liked": set(Like.objects.filter(user=request.user).values_list("vehicle_id", flat=True))}).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_inquiries(request):
    qs = Inquiry.objects.filter(user=request.user).select_related("vehicle")
    return Response(InquirySerializer(qs, many=True).data)


# ---------- Business / admin ----------
class BusinessView(APIView):
    def get_permissions(self):
        return [AllowAny()] if self.request.method == "GET" else [IsAdminUser()]

    def get(self, request):
        return Response(BusinessSerializer(BusinessProfile.get()).data)

    def patch(self, request):
        b = BusinessProfile.get()
        data = request.data.copy()
        logo = request.FILES.get("logo")
        if logo:
            try:
                data["logo"] = process_image(logo)
            except DjangoValidationError as e:
                raise as_api_error(e)
        else:
            data.pop("logo", None)
        s = BusinessSerializer(b, data=data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_stats(request):
    v = Vehicle.objects.filter(is_deleted=False)
    act = [{"action": a.action, "detail": a.detail, "at": a.created_at} for a in Activity.objects.all()[:10]]
    return Response({"total": v.count(), "available": v.filter(status="AVAILABLE").count(),
                     "reserved": v.filter(status="RESERVED").count(), "sold": v.filter(status="SOLD").count(),
                     "inquiries": Inquiry.objects.count(), "new_inquiries": Inquiry.objects.filter(status="NEW").count(),
                     "activity": act})


class ImageViewSet(viewsets.GenericViewSet, mixins.DestroyModelMixin):
    queryset = VehicleImage.objects.all()
    permission_classes = [IsAdminUser]

    def perform_destroy(self, img):
        v, was_cover = img.vehicle, img.is_cover
        img.image.delete(save=False)
        img.delete()
        if was_cover and v.images.exists():
            first = v.images.first()
            first.is_cover = True
            first.save(update_fields=["is_cover"])

    @action(detail=True, methods=["post"])
    def cover(self, request, pk=None):
        img = self.get_object()
        img.vehicle.images.update(is_cover=False)
        img.is_cover = True
        img.save(update_fields=["is_cover"])
        return Response({"ok": True})