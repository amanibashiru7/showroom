from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from .models import Category, Vehicle

U = get_user_model()


class ApiTests(APITestCase):
    def setUp(self):
        self.cat = Category.objects.create(name="Cars", slug="cars", code="CAR")
        self.v = Vehicle.objects.create(category=self.cat, brand="Toyota", model="IST", year=2010, price=1000000)
        self.admin = U.objects.create_superuser("a", "a@x.com", "pw12345678")

    def test_public_browse_and_id(self):
        r = self.client.get("/api/vehicles/?q=toyota")
        self.assertEqual(r.json()["count"], 1)
        self.assertTrue(self.v.vehicle_id.startswith("AMN-CAR-"))

    def test_customer_cannot_use_admin(self):
        u = U.objects.create_user("c", "c@x.com", "pw12345678")
        self.client.force_login(u)
        self.assertEqual(self.client.post("/api/vehicles/", {}, format="json").status_code, 403)
        self.assertEqual(self.client.get("/api/inquiries/").status_code, 403)
        self.assertEqual(self.client.get("/api/admin/stats/").status_code, 403)

    def test_guest_cannot_like_but_can_inquire(self):
        self.assertIn(self.client.post(f"/api/vehicles/{self.v.vehicle_id}/like/").status_code, (401, 403))
        r = self.client.post("/api/inquiries/", {"vehicle": self.v.vehicle_id, "name": "A", "phone": "0700", "message": "hi"}, format="json")
        self.assertEqual(r.status_code, 201)

    def test_like_toggle_no_duplicates(self):
        u = U.objects.create_user("c", "c@x.com", "pw12345678")
        self.client.force_login(u)
        self.assertTrue(self.client.post(f"/api/vehicles/{self.v.vehicle_id}/like/").json()["active"])
        self.assertFalse(self.client.post(f"/api/vehicles/{self.v.vehicle_id}/like/").json()["active"])

    def test_admin_crud_and_soft_delete(self):
        self.client.force_login(self.admin)
        d = {"category": "cars", "brand": "Honda", "model": "Fit", "year": 2012, "price": 5000000}
        r = self.client.post("/api/vehicles/", d, format="json")
        self.assertEqual(r.status_code, 201)
        vid = r.json()["vehicle_id"]
        self.assertEqual(self.client.delete(f"/api/vehicles/{vid}/").status_code, 204)
        self.assertEqual(self.client.get(f"/api/vehicles/{vid}/").status_code, 404)
        self.assertTrue(Vehicle.objects.filter(vehicle_id=vid, is_deleted=True).exists())

    def test_register_weak_password_rejected(self):
        r = self.client.post("/api/auth/register/", {"name": "A", "email": "z@x.com", "password": "123"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_fake_image_rejected(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.client.force_login(self.admin)
        f = SimpleUploadedFile("evil.jpg", b"not an image", content_type="image/jpeg")
        r = self.client.post(f"/api/vehicles/{self.v.vehicle_id}/images/", {"images": f})
        self.assertEqual(r.status_code, 400)
