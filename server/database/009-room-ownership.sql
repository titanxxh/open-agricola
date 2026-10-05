CREATE TABLE app_instances (
  instance_id TEXT PRIMARY KEY,
  internal_url TEXT NOT NULL,
  generation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('starting','ready','draining','stopped')),
  room_capacity BIGINT NOT NULL CHECK (room_capacity > 0),
  lease_until BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX app_instances_available ON app_instances(status, lease_until);
CREATE TABLE room_ownership (
  room_id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES app_instances(instance_id),
  epoch BIGINT NOT NULL CHECK (epoch > 0),
  lease_until BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved','active','retired')),
  development BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX room_ownership_instance ON room_ownership(instance_id, status, lease_until);
CREATE TABLE room_allocations (
  actor_id TEXT NOT NULL,
  allocation_id TEXT NOT NULL,
  room_id TEXT NOT NULL UNIQUE REFERENCES room_ownership(room_id),
  scope_id TEXT,
  command_id TEXT,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY (actor_id, allocation_id)
);
