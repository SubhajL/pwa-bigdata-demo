# PWA demo API image.
#
# The build context is the REPOSITORY ROOT, not `api/` (see infra/docker-compose.yml).
# Until slice S6 the context was `api/`, which meant `ml/` was not merely uncopied but
# unreachable: the API could not have served the model however the Dockerfile was written.
#
# Layers are ordered so the expensive steps survive a source edit: dependencies, then the
# model package, then the trained artifact, and only then the application code.
FROM python:3.13-slim
WORKDIR /srv

COPY api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# The model package lands at /srv/pwa_ml, i.e. directly importable as `pwa_ml` because
# WORKDIR is on sys.path. `app.features` and `app.model` import it by that name.
COPY ml/pwa_ml ./pwa_ml

# Train INTO the image. `pwa_ml.datasets.build_corpus` generates its lifecycles from a
# fixed seed with no file or network I/O, so this is deterministic and reproducible: a
# fresh clone yields a demo with a model, with no separate training step and no bind mount
# that a judge's machine might not have. Writes /srv/artifacts/{model.pkl,model_card.json}.
RUN python -m pwa_ml

COPY api/app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
