from django.contrib import admin
from . import models

for m in (models.Category, models.Vehicle, models.Inquiry, models.Comment, models.BusinessProfile, models.Activity, models.Profile):
    admin.site.register(m)
