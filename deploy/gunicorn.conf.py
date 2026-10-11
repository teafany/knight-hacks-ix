"""One model cache, with a second thread for health checks and busy responses."""

import os
from pathlib import Path

chdir = str(Path(__file__).resolve().parents[1] / 'server')
bind = '127.0.0.1:8000'
workers = 1
worker_class = 'gthread'
threads = 2
timeout = 180
graceful_timeout = 30
accesslog = '-'
errorlog = '-'
capture_output = True
raw_env = ['DJANGO_SETTINGS_MODULE=config.production']
# Prevent native ML libraries from allocating one thread per host core.
os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('MKL_NUM_THREADS', '2')
