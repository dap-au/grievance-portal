-- ============================================================
-- GRIEVANCE PORTAL — FULL DATABASE SCHEMA
-- Run this file once to set up all tables
-- Command: psql -U postgres -d grievance_db -f schema.sql
-- ============================================================

-- Create database (run this separately if needed)
-- CREATE DATABASE grievance_db;

-- ── USERS TABLE ──────────────────────────────────────────────
-- Roles: student | dean | committee | registrar | faculty | vc
-- Campus: uppal | bhongir (null for shared roles: vc, registrar, faculty)
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(150) UNIQUE NOT NULL,
  password     VARCHAR(255) NOT NULL,
  role         VARCHAR(50) NOT NULL CHECK (role IN (
                 'student','dean','committee','registrar','faculty','vc'
               )),
  campus       VARCHAR(20) CHECK (campus IN ('uppal', 'bhongir')),
                                    -- dean/student: campus they belong to
                                    -- vc/registrar/faculty: NULL (shared role)
  school       VARCHAR(100),        -- for deans: which school they manage
  department   VARCHAR(100),        -- for dept-level: which department
  student_id   VARCHAR(50),         -- for students: enrollment number
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ── GRIEVANCES TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grievances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       VARCHAR(20) UNIQUE NOT NULL,  -- e.g. GR-2024-0001
  student_id      UUID NOT NULL REFERENCES users(id),
  
  -- Submission details
  title           VARCHAR(200) NOT NULL,
  description     TEXT NOT NULL,
  category        VARCHAR(50) NOT NULL CHECK (category IN (
                    'academic','ragging_harassment','financial',
                    'infrastructure','faculty_conduct','administrative','other'
                  )),
  is_confidential BOOLEAN DEFAULT FALSE,
  is_anonymous    BOOLEAN DEFAULT FALSE,
  
  -- Assignment
  assigned_to     UUID REFERENCES users(id),    -- current handler
  campus          VARCHAR(20) CHECK (campus IN ('uppal', 'bhongir')),
                                                 -- campus the grievance belongs to
  school          VARCHAR(100),                  -- which school involved
  department      VARCHAR(100),                  -- which dept involved
  
  -- Status flow
  -- submitted → assigned → in_progress → resolved
  -- → escalation_1 (committee, days 3-5) → escalation_2 (oversight, day 5+)
  -- → final_resolved | withdrawn
  -- SLA: Ragging = 24 hrs fast-track; others = 5 days (Dean 0-3, Committee 3-5)
  status          VARCHAR(50) DEFAULT 'submitted' CHECK (status IN (
                    'submitted','under_review','assigned','in_progress',
                    'resolved','escalation_1','escalation_2','escalation_3',
                    'final_resolved','withdrawn','fast_track'
                  )),
  
  -- Escalation tracking
  escalation_level  INTEGER DEFAULT 0,          -- 0=none, 1,2,3
  conflict_of_interest BOOLEAN DEFAULT FALSE,
  
  -- SLA tracking
  sla_deadline    TIMESTAMP,
  sla_breached    BOOLEAN DEFAULT FALSE,
  
  -- Resolution
  resolution_note TEXT,
  resolution_confidential BOOLEAN DEFAULT FALSE,  -- if TRUE: student cannot see resolution_note
  resolved_at     TIMESTAMP,

  -- Proof upload
  proof_file_name      VARCHAR(255),
  proof_original_name  VARCHAR(255),
  proof_mime_type      VARCHAR(100),
  proof_file_size      INTEGER,
  
  -- Withdrawal
  withdrawn_at    TIMESTAMP,
  withdrawal_reason TEXT,
  
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ── GRIEVANCE HISTORY TABLE ───────────────────────────────────
-- Every status change is logged here — full audit trail
CREATE TABLE IF NOT EXISTS grievance_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id  UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  changed_by    UUID REFERENCES users(id),
  action        VARCHAR(100) NOT NULL,   -- e.g. "Assigned to School Dean"
  old_status    VARCHAR(50),
  new_status    VARCHAR(50),
  note          TEXT,                    -- internal note (not visible to student)
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ── COMMENTS TABLE ────────────────────────────────────────────
-- Internal communication between handlers (not visible to student)
CREATE TABLE IF NOT EXISTS comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id  UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES users(id),
  message       TEXT NOT NULL,
  is_internal   BOOLEAN DEFAULT TRUE,   -- FALSE = visible to student
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ── NOTIFICATIONS TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  grievance_id  UUID REFERENCES grievances(id),
  message       TEXT NOT NULL,
  is_read       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ── AUTO UPDATE updated_at TRIGGER ───────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER grievances_updated_at
  BEFORE UPDATE ON grievances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── TICKET ID SEQUENCE ────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1;

-- No default login accounts are inserted.
-- Create users explicitly via registration flow (students) or manual admin onboarding.

-- ── INDEXES for performance ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_grievances_student    ON grievances(student_id);
CREATE INDEX IF NOT EXISTS idx_grievances_status     ON grievances(status);
CREATE INDEX IF NOT EXISTS idx_grievances_assigned   ON grievances(assigned_to);
CREATE INDEX IF NOT EXISTS idx_history_grievance     ON grievance_history(grievance_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id);