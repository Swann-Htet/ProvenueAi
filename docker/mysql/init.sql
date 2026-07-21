-- ProvenueAI — MySQL initialisation script
-- Runs automatically when the MySQL container is first created.

CREATE DATABASE IF NOT EXISTS provenueai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE provenueai;

-- ── Core document store tables (JSON blob per row) ────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id         VARCHAR(36) PRIMARY KEY,
  data       JSON        NOT NULL,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  id         VARCHAR(36) PRIMARY KEY,
  data       JSON        NOT NULL,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id         VARCHAR(36) PRIMARY KEY,
  data       JSON        NOT NULL,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interviews (
  id         VARCHAR(36) PRIMARY KEY,
  data       JSON        NOT NULL,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS datasets (
  id         VARCHAR(36) PRIMARY KEY,
  data       JSON        NOT NULL,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id         VARCHAR(36) PRIMARY KEY,
  data       JSON        NOT NULL,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id         VARCHAR(36) PRIMARY KEY,
  data       JSON        NOT NULL,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- ── Structured user table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)  PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  phone         VARCHAR(30)  DEFAULT NULL,
  password_hash VARCHAR(120) NOT NULL,
  role          ENUM('sme','site','admin') NOT NULL DEFAULT 'sme',
  status        ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── Site properties (admin-curated listings) ──────────────────────────────
CREATE TABLE IF NOT EXISTS site_properties (
  id             VARCHAR(36)  PRIMARY KEY,
  user_id        VARCHAR(36)  NOT NULL,
  area_size      VARCHAR(100) DEFAULT NULL COMMENT 'e.g. 80-150 sqm',
  rent_price     VARCHAR(100) DEFAULT NULL COMMENT 'monthly rent in THB',
  previous_usage TEXT         DEFAULT NULL,
  websites       JSON         DEFAULT NULL COMMENT 'array of listing URLs',
  location       JSON         DEFAULT NULL COMMENT '{lat,lng,label}',
  notes          TEXT         DEFAULT NULL,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Property owners & e-contracts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_owners (
  id             VARCHAR(36)  PRIMARY KEY,
  owner_name     VARCHAR(120) NOT NULL,
  phone          VARCHAR(30)  NOT NULL,
  email          VARCHAR(190) DEFAULT NULL,
  address        TEXT         NOT NULL,
  area_size      VARCHAR(60)  DEFAULT NULL,
  rent_price     INT          DEFAULT NULL COMMENT 'asking price THB/month',
  previous_usage VARCHAR(60)  DEFAULT NULL,
  floor_count    TINYINT      DEFAULT 1,
  parking        TINYINT(1)   DEFAULT 0,
  photos         JSON         DEFAULT NULL,
  lat            DOUBLE       DEFAULT NULL,
  lng            DOUBLE       DEFAULT NULL,
  notes          TEXT         DEFAULT NULL,
  status         ENUM('draft','contract_sent','confirmed','denied','listed') NOT NULL DEFAULT 'draft',
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contracts (
  id               VARCHAR(36)   PRIMARY KEY,
  owner_id         VARCHAR(36)   NOT NULL,
  commission_pct   DECIMAL(5,2)  NOT NULL DEFAULT 10.00,
  duration_months  INT           NOT NULL DEFAULT 12,
  start_date       DATE          DEFAULT NULL,
  custom_clauses   MEDIUMTEXT    DEFAULT NULL,
  pdf_ref          TEXT          DEFAULT NULL,
  signature_token  VARCHAR(64)   NOT NULL UNIQUE,
  signature_status ENUM('pending','signed','rejected') NOT NULL DEFAULT 'pending',
  signed_at        TIMESTAMP     DEFAULT NULL,
  version          INT           NOT NULL DEFAULT 1,
  created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES property_owners(id) ON DELETE CASCADE
);
