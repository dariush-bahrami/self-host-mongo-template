// ============================================================================
// First-boot initialization (runs ONCE, only when /data/db is empty).
// Executed by the official entrypoint via mongosh, already authenticated as
// the root user configured in MONGO_INITDB_ROOT_USERNAME / _PASSWORD.
//
// Creates:
//   1. A least-privilege application user (readWrite on MONGO_APP_DB).
//   2. A read-only monitoring user (clusterMonitor on admin) for healthchecks.
//
// Guards against placeholder passwords — refuses to start if any credential
// is still set to the default value.
// ============================================================================

(function () {
  const PLACEHOLDER = "CHANGE_ME_BEFORE_FIRST_BOOT";

  const appDb      = process.env.MONGO_APP_DB;
  const appUser    = process.env.MONGO_APP_USERNAME;
  const appPwd     = process.env.MONGO_APP_PASSWORD;
  const monUser    = process.env.MONGO_MONITOR_USERNAME;
  const monPwd     = process.env.MONGO_MONITOR_PASSWORD;
  const rootPwd    = process.env.MONGO_INITDB_ROOT_PASSWORD;

  // ── Placeholder guard ──────────────────────────────────────────────────────
  const placeholders = [
    ["MONGO_INITDB_ROOT_PASSWORD", rootPwd],
    ["MONGO_APP_PASSWORD",         appPwd],
    ["MONGO_MONITOR_PASSWORD",     monPwd],
  ];
  placeholders.forEach(function ([name, val]) {
    if (!val || val === PLACEHOLDER) {
      throw new Error(
        "[mongo-init] " + name + " is still set to the placeholder value. " +
        "Set a real password in .env before first boot."
      );
    }
  });

  if (!appDb || !appUser || !monUser) {
    throw new Error("[mongo-init] One or more required env vars are missing.");
  }

  // ── 1. Application user ────────────────────────────────────────────────────
  const target = db.getSiblingDB(appDb);
  const appExists = target.getUsers().users.some(function (u) {
    return u.user === appUser;
  });

  if (appExists) {
    print("[mongo-init] App user '" + appUser + "' already exists; skipping.");
  } else {
    target.createUser({
      user: appUser,
      pwd:  appPwd,
      roles: [{ role: "readWrite", db: appDb }],
    });
    print("[mongo-init] Created app user '" + appUser + "' on db '" + appDb + "'.");
  }

  // ── 2. Monitoring user (healthcheck) ───────────────────────────────────────
  // Scoped to the admin database with clusterMonitor only — no data access.
  const adminDb = db.getSiblingDB("admin");
  const monExists = adminDb.getUsers().users.some(function (u) {
    return u.user === monUser;
  });

  if (monExists) {
    print("[mongo-init] Monitor user '" + monUser + "' already exists; skipping.");
  } else {
    adminDb.createUser({
      user: monUser,
      pwd:  monPwd,
      roles: [{ role: "clusterMonitor", db: "admin" }],
    });
    print("[mongo-init] Created monitor user '" + monUser + "' on db 'admin'.");
  }
})();
