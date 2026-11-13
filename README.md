# MedTrace

A local demo for tracing pharmaceutical batches as they move between locations and identifying stock affected by a recall.

## Run locally

Start Docker Desktop in Linux container mode. From the repository root:

```powershell
docker compose up --build --wait
Invoke-RestMethod http://127.0.0.1:5173/api/health
```

Open [MedTrace](http://127.0.0.1:5173) and look for **Database connected**. The health endpoint returns `{"status":"ok","database":"up"}` after a successful PostgreSQL query.

Run `docker compose down` to stop the stack and retain the database volume. The first build downloads packages and images. The running stack uses local services.

## Architecture

The browser talks to the React/TypeScript app on localhost. Vite forwards `/api` to NestJS over the Compose network. NestJS connects to PostgreSQL on the same network. Only the web port is published. The database credentials in Compose are for the local demo.

PostgreSQL will hold the batch records, location-level stock, movement history, and recall status. The first pairing step is registering a batch with initial stock at one location. Transfers and recalls follow once we can record and retrieve that first receipt.

Later, an optional AWS Emulator integration can exercise S3 for recall-report exports and SQS for recall notifications. Verify the operations each integration needs against the emulator release before wiring it in. Local Kubernetes can run the same application services after the Compose workflow is stable.
