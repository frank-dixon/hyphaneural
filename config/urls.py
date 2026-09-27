from django.contrib import admin
from django.urls import include, path
from django.contrib.auth import views as auth_views
from organisms import views as org_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("login/", org_views.login_view, name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("signup/", org_views.signup_view, name="signup"),
    path("", org_views.map_view, name="map"),
    path("api/", include("organisms.urls")),
]
