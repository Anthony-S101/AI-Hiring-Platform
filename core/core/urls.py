"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from interviews import views
from django.views.generic import TemplateView


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/create-session/', views.create_session),
    path('api/submit-answer/<uuid:session_id>/', views.submit_answer),
    path('api/submit-test/<str:session_id>/', views.submit_test, name='submit-test'),
    path('api/submit-code/<uuid:session_id>/', views.submit_code, name='submit-code'),
    path('', TemplateView.as_view(template_name='index.html'), name='react-app'),
]


