import mysql from 'mysql2/promise';

async function run() {
  const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3307,
    user: 'provenue',
    password: '7d02bCRZOsep3ALkjFX1vmig',
    database: 'provenueai'
  });
  
  try {
    try { await pool.query("ALTER TABLE users ADD COLUMN phone VARCHAR(30) DEFAULT NULL AFTER email"); } catch(e) {}
    try { await pool.query("ALTER TABLE users ADD COLUMN status ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active' AFTER role"); } catch(e) {}
    try { await pool.query("ALTER TABLE users MODIFY COLUMN role ENUM('sme','site','admin') NOT NULL DEFAULT 'sme'"); } catch(e) {}
    
    await pool.query(`CREATE TABLE IF NOT EXISTS site_properties (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        area_size VARCHAR(100) DEFAULT NULL COMMENT 'e.g. 80-150 sqm',
        rent_price VARCHAR(100) DEFAULT NULL COMMENT 'monthly rent in THB',
        previous_usage TEXT DEFAULT NULL,
        websites JSON DEFAULT NULL COMMENT 'array of listing URLs',
        location JSON DEFAULT NULL COMMENT '{lat,lng,label}',
        notes TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);

    // ── Owner Onboarding & E-Contract ─────────────────────────────────────────
    await pool.query(`CREATE TABLE IF NOT EXISTS property_owners (
        id              VARCHAR(36)   PRIMARY KEY,
        owner_name      VARCHAR(120)  NOT NULL,
        phone           VARCHAR(30)   NOT NULL,
        email           VARCHAR(190)  DEFAULT NULL,
        address         TEXT          NOT NULL,
        area_size       VARCHAR(60)   DEFAULT NULL COMMENT 'e.g. 120 sqm',
        rent_price      INT           DEFAULT NULL COMMENT 'asking price THB/month',
        previous_usage  VARCHAR(60)   DEFAULT NULL COMMENT 'retail|warehouse|residential|vacant|food_bev|office|other',
        floor_count     TINYINT       DEFAULT 1,
        parking         TINYINT(1)    DEFAULT 0,
        photos          JSON          DEFAULT NULL COMMENT 'array of image URL strings',
        lat             DOUBLE        DEFAULT NULL,
        lng             DOUBLE        DEFAULT NULL,
        notes           TEXT          DEFAULT NULL,
        status          ENUM('draft','contract_sent','confirmed','denied','listed') NOT NULL DEFAULT 'draft',
        created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS contracts (
        id               VARCHAR(36)   PRIMARY KEY,
        owner_id         VARCHAR(36)   NOT NULL,
        commission_pct   DECIMAL(5,2)  NOT NULL DEFAULT 10.00,
        duration_months  INT           NOT NULL DEFAULT 12,
        start_date       DATE          DEFAULT NULL,
        custom_clauses   MEDIUMTEXT    DEFAULT NULL,
        pdf_ref          TEXT          DEFAULT NULL COMMENT 'base64 data-url or future S3 key',
        signature_token  VARCHAR(64)   NOT NULL UNIQUE,
        signature_status ENUM('pending','signed','rejected') NOT NULL DEFAULT 'pending',
        signed_at        TIMESTAMP     DEFAULT NULL,
        version          INT           NOT NULL DEFAULT 1,
        created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES property_owners(id) ON DELETE CASCADE
    )`);
    
    console.log('Migration OK');
  } catch (err) {
    console.error('Migration failed:', err);
  }
  process.exit(0);
}
run();
