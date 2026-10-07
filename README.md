# Used Vehicles Digital Showroom (Version 1)

Django + Django REST Framework backend, vanilla HTML/CSS/JS PWA frontend. PostgreSQL in production, SQLite for quick local start.

## 1. Requirements
Python 3.10+ and VS Code. (PostgreSQL optional locally.)

## 2. Quick start (local, SQLite)
```bash
python -m venv .venv
# Windows:  .venv\Scripts\activate        Mac/Linux:  source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # Windows: copy .env.example .env
python manage.py migrate
python manage.py seed_demo      # categories, business profile, 16 demo vehicles, demo admin
python manage.py runserver
```
Open http://127.0.0.1:8000

**Owner login (demo):** email `admin@example.com`, password = `SEED_ADMIN_PASSWORD` in `.env` (default `ChangeMe123!`). Log in at `/account`; staff users are sent to `/admin` (Owner dashboard). **Change the password** (via `/django-admin/`) or create your own owner with `python manage.py createsuperuser` using your email as the username.

## 3. Environment variables (`.env`)
See `.env.example`: secret key, debug flag, DB_* (PostgreSQL), EMAIL_* (SMTP), SITE_URL, SEED_ADMIN_PASSWORD. Never commit `.env`.

## 4. PostgreSQL
```sql
CREATE DATABASE showroom; CREATE USER showroom_user WITH PASSWORD 'strong-password';
GRANT ALL PRIVILEGES ON DATABASE showroom TO showroom_user;
ALTER DATABASE showroom OWNER TO showroom_user;
```
Fill DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT in `.env`, then `python manage.py migrate`.

## 5. Email
Default prints emails in the terminal. For Gmail/SMTP set `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` plus EMAIL_HOST/USER/PASSWORD (use an app password). Emails go only to customers who enabled alerts; the owner chooses per vehicle ("Email subscribers" checkbox when adding).

## 6. PWA
`/manifest.webmanifest`, `/sw.js`, icons in `frontend/icons`. Installable on HTTPS (or localhost). Replace icons with your logo (192x192 and 512x512 PNG). The browser decides when to show its install prompt; an "Install app" button appears when it allows.

## 7. Tests
`python manage.py test api`

## 8. Project structure
```
config/     settings, root urls
api/        models, serializers, views (REST API), urls, tests, seed_demo command
frontend/   index.html shell, css/, js/ (app.js public site, admin.js owner dashboard, i18n.js EN/SW), sw.js, manifest
media/      uploaded photos/videos (created automatically)
```
Languages: add/edit texts in `frontend/js/i18n.js` (EN/SW toggle in the header).

## 9. Production notes
Set `DJANGO_DEBUG=0`, a long random `DJANGO_SECRET_KEY`, your domain in `ALLOWED_HOSTS`, `SITE_URL=https://yourdomain`. Serve with `gunicorn config.wsgi` behind Nginx/Caddy with HTTPS; run `python manage.py collectstatic`; serve `/media/` from Nginx (or object storage). Back up the database and `media/`.

## Not in V1 (by design)
Payments, delivery tracking, multiple branches, staff roles, native apps, analytics, push, AI. Extension points: `BusinessProfile` -> add `Location`; `is_staff` -> add roles; `Activity` -> richer logs.
