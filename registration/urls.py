from django.urls import path

from . import views

app_name = "registration"

urlpatterns = [
    path("", views.IndexView.as_view(), name="index"),
    path("api/register/", views.RegisterView.as_view(), name="register"),
]
