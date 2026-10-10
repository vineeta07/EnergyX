# Python AI service (inference, OR-Tools, training jobs, assistant)
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 curl && rm -rf /var/lib/apt/lists/*
COPY ai-service/requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu  && pip install --no-cache-dir -r requirements.txt
COPY ai-service/ ./
# Pretrained waste image classifier (weights are not committed to git)
RUN M=ml/models/pretrained/waste-classification-v2 && mkdir -p $M  && for f in config.json metadata.json model.weights.h5; do       curl -sfL -o $M/$f https://huggingface.co/Darshan764/waste-classification-v2/resolve/main/$f; done
ENV KERAS_BACKEND=torch
EXPOSE 8000
RUN useradd -m app && chown -R app /app
USER app
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
