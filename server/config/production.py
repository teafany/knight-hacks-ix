"""Settings for the Gunicorn service behind a local reverse proxy."""

import os

from django.core.exceptions import ImproperlyConfigured

os.environ.setdefault('DJANGO_DEBUG', 'false')

from .settings import *  # noqa: E402,F403

if DEBUG:
    raise ImproperlyConfigured('Production requires DJANGO_DEBUG=false.')

MIDDLEWARE = [
    MIDDLEWARE[0],
    'whitenoise.middleware.WhiteNoiseMiddleware',
    *MIDDLEWARE[1:],
]
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get('DJANGO_CORS_ALLOWED_ORIGINS', 'http://localhost:5173').split(',')
    if origin.strip()
]
# Nginx must overwrite this header; Gunicorn listens only on loopback.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = os.environ.get('DJANGO_SECURE_SSL_REDIRECT', 'false').lower() in {'true', '1', 'yes'}
SECURE_HSTS_SECONDS = int(os.environ.get('DJANGO_SECURE_HSTS_SECONDS', '0'))
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
