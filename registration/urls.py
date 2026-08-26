from django.urls import path

from . import views

app_name = "registration"

urlpatterns = [
    path("", views.IndexView.as_view(), name="index"),
    path("api/register/", views.RegisterView.as_view(), name="register"),
    path("api/teams/", views.TeamListView.as_view(), name="teams"),
    path(
        "api/teams/<int:pk>/verify-pin/",
        views.TeamVerifyPinView.as_view(),
        name="verify_pin",
    ),
    path(
        "api/teams/<int:pk>/update/",
        views.TeamUpdateView.as_view(),
        name="update_team",
    ),
    path(
        "api/teams/<int:pk>/delete/",
        views.TeamDeleteView.as_view(),
        name="delete_team",
    ),
]
