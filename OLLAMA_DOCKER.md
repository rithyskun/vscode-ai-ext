# Running Ollama with Docker Compose

## Quick Start

1. Start Ollama container:
```bash
docker-compose up -d
```

2. Pull the model:
```bash
docker exec -it ollama ollama pull qwen2.5-coder:7b
```

3. Verify it's running:
```bash
curl http://localhost:11434/api/tags
```

4. Update `providers.json`:
```json
{
  "defaultProvider": "ollama",
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "model": "qwen2.5-coder:7b",
      "enabled": true
    }
  }
}
```

## Available Models

- `qwen2.5-coder:7b` - Recommended for coding (7B parameters)
- `qwen2.5-coder:1.5b` - Faster, smaller model (1.5B parameters)
- `llama3.2` - General purpose model
- `mistral` - General purpose model

To pull a different model:
```bash
docker exec -it ollama ollama pull <model-name>
```

## GPU Support

If you have an NVIDIA GPU, uncomment the GPU section in `docker-compose.yml` and install nvidia-docker2.

## Stopping the Container

```bash
docker-compose down
```

## View Logs

```bash
docker-compose logs -f ollama
```
