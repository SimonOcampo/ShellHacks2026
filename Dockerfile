FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv==0.12.19
COPY pyproject.toml uv.lock ./
COPY backend ./backend
COPY packages ./packages
COPY data ./data
COPY config ./config
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["sh", "-c", "uvicorn odd_scout.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
