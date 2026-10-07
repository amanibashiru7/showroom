from django.urls import path
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register("vehicles", views.VehicleViewSet, basename="vehicle")
router.register("categories", views.CategoryViewSet)
router.register("inquiries", views.InquiryViewSet, basename="inquiry")
router.register("images", views.ImageViewSet, basename="image")
router.register("comments", views.CommentViewSet, basename="comment")

urlpatterns = [
    path("auth/register/", views.RegisterView.as_view()),
    path("auth/login/", views.LoginView.as_view()),
    path("auth/logout/", views.logout_view),
    path("me/", views.MeView.as_view()),
    path("me/saved/", views.my_saved),
    path("me/inquiries/", views.my_inquiries),
    path("business/", views.BusinessView.as_view()),
    path("admin/stats/", views.admin_stats),
] + router.urls
