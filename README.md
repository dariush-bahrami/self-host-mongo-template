# MongoDB — Self-Hosted Docker Deployment

Production-grade single-node MongoDB running in Docker Compose. Authentication enabled, least-privilege users, bind-mount data storage, resource caps, and log rotation out of the box.

---

## Project Structure

```
.
├── docker-compose.yml       # Service definition (no hardcoded values)
├── .env                     # Secrets & tunables — git-ignored, keep 0600
├── .env.example             # Safe template to commit; copy to .env
├── .gitignore
├── init/
│   └── mongo-init.js        # First-boot user provisioning script
├── data/                    # MongoDB data files (created on first boot)
└── config/                  # MongoDB config files (created on first boot)
```

---

## First-Time Setup

### 1. Configure environment

```bash
cp .env.example .env
chmod 600 .env
```

Open `.env` and set **all three passwords** before continuing:

```env
MONGO_INITDB_ROOT_PASSWORD=<strong-password>
MONGO_APP_PASSWORD=<strong-password>
MONGO_MONITOR_PASSWORD=<strong-password>
```

The init script will refuse to start if it detects the placeholder value `CHANGE_ME_BEFORE_FIRST_BOOT`.

### 2. Create data directories

```bash
mkdir -p data config
chown -R 999:999 data config    # 999 = mongodb UID inside the container
```

Data lives next to the compose file by default (`./data`, `./config`). To store it elsewhere on the server, change `MONGO_DATA_PATH` and `MONGO_CONFIG_PATH` in `.env` — no other edits needed.

### 3. Start

```bash
docker compose up -d
```

### 4. Verify

```bash
docker compose ps        # mongodb should show "healthy"
docker compose logs -f   # watch startup logs
```

---

## Users

Three users are created automatically on first boot:

| User | Database | Role | Purpose |
|------|----------|------|---------|
| `admin` (root) | `admin` | `root` | Administration only — never use for apps |
| `appuser` | `appdb` | `readWrite` | Application connections |
| `monitor` | `admin` | `clusterMonitor` | Healthcheck only — no data access |

User names and the app database name are all configurable in `.env`.

---

## Connection Strings

Replace the placeholders in angle brackets with your actual values from `.env`.

### Application user (use this in your services)

```
mongodb://<MONGO_APP_USERNAME>:<MONGO_APP_PASSWORD>@<host>:<MONGO_PORT>/<MONGO_APP_DB>?authSource=<MONGO_APP_DB>
```

Default with `.env` values:

```
mongodb://appuser:<password>@127.0.0.1:27017/appdb?authSource=appdb
```

### Admin / root (administration only)

```
mongodb://<MONGO_INITDB_ROOT_USERNAME>:<MONGO_INITDB_ROOT_PASSWORD>@<host>:<MONGO_PORT>/admin?authSource=admin
```

Default:

```
mongodb://admin:<password>@127.0.0.1:27017/admin?authSource=admin
```

### mongosh (interactive shell)

```bash
# As app user
mongosh "mongodb://appuser:<password>@127.0.0.1:27017/appdb?authSource=appdb"

# As admin
mongosh "mongodb://admin:<password>@127.0.0.1:27017/admin?authSource=admin"
```

### From another Docker container on the same host

Other containers in the same Compose project can reach MongoDB over the internal `mongo_net` network using the container hostname instead of `127.0.0.1`:

```
mongodb://appuser:<password>@mongodb:27017/appdb?authSource=appdb
```

Add the service to the same network in its compose file:

```yaml
networks:
  - mongodb_mongo_net

networks:
  mongodb_mongo_net:
    external: true
```

### Python (pymongo)

```python
from pymongo import MongoClient

client = MongoClient(
    "mongodb://appuser:<password>@127.0.0.1:27017/appdb",
    authSource="appdb"
)
db = client["appdb"]
```

### Node.js (mongoose)

```javascript
await mongoose.connect(
  "mongodb://appuser:<password>@127.0.0.1:27017/appdb?authSource=appdb"
);
```

### Node.js (native driver)

```javascript
const { MongoClient } = require("mongodb");
const client = new MongoClient(
  "mongodb://appuser:<password>@127.0.0.1:27017/appdb?authSource=appdb"
);
```

---

## Common Operations

```bash
# Stop
docker compose down

# Stop and delete all data (destructive!)
docker compose down -v

# Upgrade MongoDB version
# 1. Edit MONGO_IMAGE in .env
# 2. docker compose pull
# 3. docker compose up -d

# Open an admin shell
docker exec -it mongodb mongosh \
  --username admin --password --authenticationDatabase admin

# View logs
docker compose logs -f mongodb

# Check health
docker inspect --format='{{.State.Health.Status}}' mongodb
```

---

## Configuration Reference

All tunables live in `.env`. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_IMAGE` | `mongo:8.3` | Image tag — pin to a minor version |
| `MONGO_DATA_PATH` | `./data` | Host path for database files |
| `MONGO_CONFIG_PATH` | `./config` | Host path for config files |
| `MONGO_BIND_HOST` | `127.0.0.1` | Host interface to expose the port on |
| `MONGO_PORT` | `27017` | Host port |
| `MONGO_WIREDTIGER_CACHE_GB` | `1` | WiredTiger cache (≈50% of container RAM) |
| `MEM_LIMIT` | `2g` | Hard memory cap |
| `CPU_LIMIT` | `2` | Hard CPU cap |

---

## Security Notes

- `.env` contains credentials — keep it `chmod 600` and never commit it.
- MongoDB is bound to `127.0.0.1` by default and is not reachable from the network.
- To expose externally, set `MONGO_BIND_HOST=0.0.0.0` — only do this behind a firewall or VPN.
- The `monitor` user used by the healthcheck has no data access (`clusterMonitor` role only).
- The `no-new-privileges` security option prevents privilege escalation inside the container.
