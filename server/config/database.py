from urllib.parse import parse_qs, unquote, urlparse

from django.core.exceptions import ImproperlyConfigured


def database_configuration(environ, base_dir):
    backend = environ.get('DJANGO_DB_BACKEND', 'postgresql')
    if backend == 'sqlite':
        return {'ENGINE': 'django.db.backends.sqlite3', 'NAME': base_dir / 'db.sqlite3'}
    if backend != 'postgresql':
        raise ImproperlyConfigured('DJANGO_DB_BACKEND must be postgresql or sqlite.')
    url = environ.get('DATABASE_URL', 'postgresql://knight_hacks:knight_hacks_dev@127.0.0.1:5432/knight_hacks')
    try:
        parsed = urlparse(url)
        if parsed.scheme not in {'postgres', 'postgresql'} or not parsed.hostname or not parsed.path.strip('/'):
            raise ValueError('Invalid PostgreSQL URL')
        query = parse_qs(parsed.query, strict_parsing=True)
        if set(query) - {'sslmode', 'connect_timeout'} or any(len(value) != 1 for value in query.values()):
            raise ValueError('Unsupported database option')
        options = {'connect_timeout': 5}
        if 'sslmode' in query:
            if query['sslmode'][0] not in {'disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'}:
                raise ValueError('Invalid sslmode')
            options['sslmode'] = query['sslmode'][0]
        if 'connect_timeout' in query:
            timeout = int(query['connect_timeout'][0])
            if not 1 <= timeout <= 60:
                raise ValueError('Invalid connect_timeout')
            options['connect_timeout'] = timeout
        return {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': unquote(parsed.path.lstrip('/')),
            'USER': unquote(parsed.username or ''), 'PASSWORD': unquote(parsed.password or ''),
            'HOST': parsed.hostname, 'PORT': str(parsed.port or 5432),
            'CONN_MAX_AGE': 60, 'CONN_HEALTH_CHECKS': True, 'OPTIONS': options,
        }
    except (ValueError, TypeError) as exc:
        # Do not include the URL in errors: it may contain deployment credentials.
        raise ImproperlyConfigured('Invalid DATABASE_URL. Use a PostgreSQL URL with optional sslmode/connect_timeout.') from exc
