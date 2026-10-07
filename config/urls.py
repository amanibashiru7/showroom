from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from api import views

urlpatterns = [
    path("django-admin/", admin.site.urls),  # raw database admin (owner/dev only)
    path("api/", include("api.urls")),
    path("sw.js", views.static_file("sw.js", "application/javascript")),
    path("manifest.webmanifest", views.static_file("manifest.webmanifest", "application/manifest+json")),
    path("vehicles/<str:vid>", views.shell),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT) + [
    re_path(r"^(?!static/|media/|api/|django-admin/).*$", views.shell),
]
