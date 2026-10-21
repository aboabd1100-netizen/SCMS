FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SCMS_ENV=production
WORKDIR /app
COPY requirements-production.lock ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 scms
# Copy only runtime source, never local credentials, database files or demo fixtures.
COPY app ./app
COPY migrations ./migrations
COPY SC ./SC
COPY run.py gunicorn.conf.py ./
RUN find SC -type f \( -name '*.md' -o -name '*.txt' \) -delete
USER scms
CMD ["gunicorn", "--config", "gunicorn.conf.py", "run:app"]
