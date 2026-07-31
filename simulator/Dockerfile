FROM python:3.13-slim
WORKDIR /srv
COPY requirements.txt .
# --retries/--timeout: PyPI build network is flaky here; retry a mid-download drop.
RUN pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt
COPY app ./app
CMD ["python", "-m", "app.publish"]
