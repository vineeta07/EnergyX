# Python AI service (inference, OR-Tools, training jobs, assistant)
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY ai-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt xgboost
COPY ai-service/ ./
# On Linux the XGBoost backend works; LightGBM remains the default for parity with local dev.
ENV ENERGY_BACKEND=lightgbm
EXPOSE 8000
RUN useradd -m app && chown -R app /app
USER app
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
