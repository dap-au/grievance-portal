// backend/controllers/grievanceController.js

const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const {
  sendNotification,
  sendSubmissionConfirmationEmail,
  sendStatusUpdateEmail,
  sendResponseUpdateEmail,
  sendResolutionEmail,
  sendHighPriorityGrievanceAlert,
} = require('../utils/notifications');

const buildProofUrl = (req, fileName) => {
  if (!fileName) return null;
  return `${req.protocol}://${req.get('host')}/uploads/proofs/${fileName}`;
};

const mapGrievanceProof = (req, grievance) => ({
  ...grievance,
  proof_url: buildProofUrl(req, grievance.proof_file_name),
});

const getPortalUser = async (authUser) => {
  const result = await pool.query(
    `INSERT INTO users (name, email, password, role, school, department, student_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       role = EXCLUDED.role,
       school = EXCLUDED.school,
       department = EXCLUDED.department,
       student_id = EXCLUDED.student_id,
       is_active = TRUE
     RETURNING id, name, email, role, school, department, student_id`,
    [
      authUser.name,
      authUser.email,
      'auth-managed',
      authUser.role,
      authUser.school || null,
      authUser.department || null,
      authUser.student_id || null,
    ]
  );

  return result.rows[0];
};

// ── SLA TIMELINES ─────────────────────────────────────────────
// Ragging/Harassment: 24 hours (fast track, immediate committee action)
// All other cases: 5 days total, fully owned by Dean + Committee:
//   Days 0-3: Campus Dean handles / investigates
//   Days 3-5: Committee takes over (escalation_1)
//   Day 5+  : VC / Registrar oversight (escalation_2 — SLA breach)
const SLA = {
  ragging_harassment: 1,   // 24 hours fast track
  dean_phase:         3,   // Days 0-3: campus dean
  committee_phase:    2,   // Days 3-5: committee (total = 5 days)
  total_span:         5,   // Absolute 5-day limit
};

const getSLADeadline = (daysFromNow) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
};

// Determine who should handle based on elapsed time since assignment
const getAutoEscalationLevel = (assignedAt) => {
  if (!assignedAt) return 0;
  const now = new Date();
  const diffMs = now - new Date(assignedAt);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays >= 5) return 'oversight';    // Day 5+: VC/Registrar oversight
  if (diffDays >= 3) return 'committee';    // Days 3-5: committee
  return 'dean';                            // Days 0-3: campus dean
};

// ── GENERATE TICKET ID (per campus) ─────────────────────────
const generateTicketId = async (campus) => {
  const year = new Date().getFullYear();
  const campusKey = campus === 'bhongir' ? 'bhongir' : 'uppal';
  const seqName   = `ticket_seq_${campusKey}`;
  const prefix    = campus === 'bhongir' ? 'BNG' : 'UPL';
  // Ensure the per-campus sequence exists (idempotent)
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS ${seqName} START 1`);
  const res = await pool.query(`SELECT nextval('${seqName}') AS seq`);
  const seq = String(res.rows[0].seq).padStart(4, '0');
  return `GR-${prefix}-${year}-${seq}`;
};

// ── LOG HISTORY ───────────────────────────────────────────────
const logHistory = async (grievanceId, userId, action, oldStatus, newStatus, note = null) => {
  await pool.query(
    `INSERT INTO grievance_history (grievance_id, changed_by, action, old_status, new_status, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [grievanceId, userId, action, oldStatus, newStatus, note]
  );
};

// ── SUBMIT GRIEVANCE (student) ────────────────────────────────
const submitGrievance = async (req, res) => {
  const { title, description, category, is_confidential, is_anonymous, school, department } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'Proof file is required' });
  }

  if (!title || !description || !category) {
    return res.status(400).json({ message: 'Title, description and category are required' });
  }

  try {
    const portalUser = await getPortalUser(req.user);
    const ticket_id = await generateTicketId(req.user.campus);
    let status = 'submitted';
    let sla_deadline = null;

    // Ragging/harassment: 24-hour SLA (fast track)
    if (category === 'ragging_harassment') {
      status = 'fast_track';
      sla_deadline = getSLADeadline(SLA.ragging_harassment);
    } else {
      // Other cases: 5-day SLA (Dean Days 0-3, Committee Days 3-5)
      sla_deadline = getSLADeadline(SLA.total_span);
    }

    const proofFileName = req.file.filename;
    const proofOriginalName = req.file.originalname;
    const proofMimeType = req.file.mimetype;
    const proofFileSize = req.file.size;

    // Student's campus — drives routing to the correct campus dean
    const studentCampus = req.user.campus || null;

    const result = await pool.query(
      `INSERT INTO grievances
         (ticket_id, student_id, title, description, category,
          is_confidential, is_anonymous, campus, school, department,
          status, sla_deadline, proof_file_name, proof_original_name, proof_mime_type, proof_file_size)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [ticket_id, portalUser.id, title, description, category,
       is_confidential || false, is_anonymous || false,
       studentCampus, school || null, department || null, status, sla_deadline,
       proofFileName, proofOriginalName, proofMimeType, proofFileSize]
    );

    const g = result.rows[0];
    await logHistory(g.id, portalUser.id, 'Grievance submitted', null, status);

    // Find and notify the campus dean (if campus is known)
    let campusDean = null;
    if (studentCampus) {
      const deanResult = await pool.query(
        `SELECT id FROM users WHERE role = 'dean' AND campus = $1 AND is_active = TRUE LIMIT 1`,
        [studentCampus]
      );
      campusDean = deanResult.rows[0] || null;
    }

    if (campusDean) {
      await sendNotification(campusDean.id, g.id,
        `New grievance ${ticket_id} submitted on ${studentCampus} campus — ${category}`);
    } else {
      // Fallback: notify any active dean
      await sendNotification(null, g.id, `New grievance submitted: ${ticket_id} — ${category}`);
    }

    await sendSubmissionConfirmationEmail(portalUser.id, g);

    if (category === 'ragging_harassment') {
      await sendHighPriorityGrievanceAlert(g);
    }

    res.status(201).json({ message: 'Grievance submitted successfully', grievance: mapGrievanceProof(req, g) });
  } catch (err) {
    console.error('Submit grievance error:', err.message);
    if (req.file) {
      const cleanupPath = path.join(__dirname, '..', 'uploads', 'proofs', req.file.filename);
      try {
        fs.unlinkSync(cleanupPath);
      } catch (cleanupError) {
        console.warn('Failed to clean up uploaded proof after submission error:', cleanupError.message);
      }
    }
    res.status(500).json({ message: 'Server error submitting grievance' });
  }
};

// ── GET MY GRIEVANCES (student) ───────────────────────────────
const getMyGrievances = async (req, res) => {
  try {
    const portalUser = await getPortalUser(req.user);
    const result = await pool.query(
      `SELECT g.id, g.ticket_id, g.title, g.category, g.status,
              g.sla_deadline, g.created_at, g.resolved_at,
              g.school, g.department, g.resolution_note,
              g.is_confidential, g.escalation_level,
              g.proof_file_name, g.proof_original_name, g.proof_mime_type, g.proof_file_size,
              u.name AS assigned_to_name
       FROM grievances g
       LEFT JOIN users u ON g.assigned_to = u.id
       WHERE g.student_id = $1
       ORDER BY g.created_at DESC`,
      [portalUser.id]
    );
    res.json(result.rows.map(row => mapGrievanceProof(req, row)));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET GRIEVANCE DETAIL (student sees public info only) ───────
const getGrievanceById = async (req, res) => {
  try {
    const { id } = req.params;
    const portalUser = req.user.role === 'student' ? await getPortalUser(req.user) : null;
    const result = await pool.query(
      `SELECT g.*, u.name AS assigned_to_name
       FROM grievances g
       LEFT JOIN users u ON g.assigned_to = u.id
       WHERE g.id = $1`, [id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Grievance not found' });

    const g = result.rows[0];

    // Students can only see their own
    if (req.user.role === 'student' && g.student_id !== portalUser.id)
      return res.status(403).json({ message: 'Access denied' });

    // Confidential grievances remain restricted for unsupported roles
    const isAdminViewer = ['dean', 'committee', 'faculty', 'registrar', 'vc'].includes(req.user.role);
    if (g.is_confidential && req.user.role !== 'student' && !isAdminViewer) {
      return res.status(403).json({
        message: 'This is a confidential grievance. Details are restricted.'
      });
    }

    const grievance = mapGrievanceProof(req, g);

    // If student views a resolved grievance where resolution is confidential:
    // hide the resolution note and flag it
    if (req.user.role === 'student' && grievance.resolution_confidential) {
      grievance.resolution_note = null;
      grievance.resolution_hidden = true;
    }

    // Fetch public history (no internal notes for students)
    const history = await pool.query(
      `SELECT gh.action, gh.new_status, gh.created_at,
              CASE WHEN $2 = 'student' THEN NULL ELSE gh.note END AS note,
              u.name AS changed_by_name
       FROM grievance_history gh
       LEFT JOIN users u ON gh.changed_by = u.id
       WHERE gh.grievance_id = $1
       ORDER BY gh.created_at ASC`,
      [id, req.user.role]
    );

    // Public comments only for student
    const comments = await pool.query(
      `SELECT c.message, c.created_at, u.name AS author
       FROM comments c
       JOIN users u ON c.author_id = u.id
       WHERE c.grievance_id = $1
         AND ($2 = 'student' AND c.is_internal = FALSE OR $2 != 'student')
       ORDER BY c.created_at ASC`,
      [id, req.user.role]
    );

    res.json({ grievance, history: history.rows, comments: comments.rows });
  } catch (err) {
    console.error('Get grievance error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── WITHDRAW GRIEVANCE (student only) ─────────────────────────
const withdrawGrievance = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) return res.status(400).json({ message: 'Withdrawal reason is required' });

  try {
    const portalUser = await getPortalUser(req.user);
    const g = await pool.query('SELECT * FROM grievances WHERE id = $1', [id]);
    if (g.rows.length === 0) return res.status(404).json({ message: 'Not found' });

    const grievance = g.rows[0];
    if (grievance.student_id !== portalUser.id)
      return res.status(403).json({ message: 'Not your grievance' });

    if (['resolved', 'final_resolved', 'withdrawn'].includes(grievance.status))
      return res.status(400).json({ message: 'Cannot withdraw a resolved or already withdrawn grievance' });

    await pool.query(
      `UPDATE grievances SET status='withdrawn', withdrawn_at=NOW(),
       withdrawal_reason=$1 WHERE id=$2`,
      [reason, id]
    );

    await logHistory(id, portalUser.id, 'Grievance withdrawn by student', grievance.status, 'withdrawn', reason);
    res.json({ message: 'Grievance withdrawn successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET ALL GRIEVANCES (admin/handlers only) ──────────────────
const getAllGrievances = async (req, res) => {
  const { status, category, school, sla_breached, escalation_level, assigned_to } = req.query;
  const role = req.user.role;

  try {
    let query = `
      SELECT g.id, g.ticket_id, g.title, g.category, g.status,
             g.campus, g.school, g.department, g.is_confidential,
             g.sla_deadline, g.sla_breached, g.escalation_level,
            g.proof_file_name, g.proof_original_name, g.proof_mime_type, g.proof_file_size,
             g.created_at, g.updated_at,
             u.name AS student_name,
             a.name AS assigned_to_name
      FROM grievances g
      LEFT JOIN users u ON g.student_id = u.id
      LEFT JOIN users a ON g.assigned_to = a.id
      WHERE 1=1`;

    const params = [];
    let i = 1;

    // Vice Chancellor has read-only access (can see all campuses)
    if (role === 'vc') {
      // VC sees all grievances from both campuses
    } else if (role === 'dean') {
      // Dean sees all grievances from their campus
      query += ` AND g.campus = $${i++}`;
      params.push(req.user.campus || 'uppal');
    } else if (role === 'committee') {
      // Committee members see only cases assigned to them
      const committeePortalUser = await getPortalUser(req.user);
      query += ` AND g.assigned_to = $${i++}`;
      params.push(committeePortalUser.id);
    } else if (role === 'faculty') {
      // Faculty (Director level) sees their department's grievances across campuses
      query += ` AND g.department = $${i++}`;
      params.push(req.user.department || 'default');
    } else if (role === 'registrar') {
      // Registrar can see all — oversight role
    }

    // Apply query filters
    if (status) { 
      query += ` AND g.status = $${i++}`; 
      params.push(status); 
    }
    if (category) { 
      query += ` AND g.category = $${i++}`; 
      params.push(category); 
    }
    if (school) { 
      query += ` AND g.school = $${i++}`; 
      params.push(school); 
    }
    // Note: assigned_to=me uses the caller's portal UUID (safe UUID lookup)
    if (assigned_to === 'me') {
      const callerPortalUser = await getPortalUser(req.user);
      query += ` AND g.assigned_to = $${i++}`;
      params.push(callerPortalUser.id);
    }
    if (sla_breached === 'true') {
      query += ` AND g.sla_breached = TRUE`;
    }
    if (escalation_level) {
      query += ` AND g.escalation_level = $${i++}`;
      params.push(parseInt(escalation_level));
    }

    query += ' ORDER BY g.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows.map(row => mapGrievanceProof(req, row)));
  } catch (err) {
    console.error('Get all grievances error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ASSIGN GRIEVANCE (dean) & AUTO-ESCALATION WORKFLOW ─────
const assignGrievance = async (req, res) => {
  const { id } = req.params;
  const { assigned_to, assignee_email, school, department, conflict_of_interest, note } = req.body;

  try {
    const g = await pool.query('SELECT * FROM grievances WHERE id = $1', [id]);
    if (g.rows.length === 0) return res.status(404).json({ message: 'Not found' });

    const grievance = g.rows[0];

    // Resolve assignee: direct portal UUID or look up by email (committee member email from dean dashboard)
    let resolvedAssigneeId = assigned_to;
    if (!resolvedAssigneeId && assignee_email) {
      const emailLookup = await pool.query(
        `SELECT id FROM users WHERE email = $1 AND is_active = TRUE LIMIT 1`,
        [String(assignee_email).toLowerCase()]
      );
      if (emailLookup.rows.length === 0) {
        return res.status(404).json({
          message: 'Committee member not found in portal. They must log in at least once before being assigned.'
        });
      }
      resolvedAssigneeId = emailLookup.rows[0].id;
    }
    if (!resolvedAssigneeId) {
      return res.status(400).json({ message: 'assigned_to or assignee_email is required' });
    }

    // Only non-ragging cases follow the 5-day escalation workflow
    // Ragging/harassment cases stay with handler or escalate directly if needed
    const isRaggingCase = grievance.category === 'ragging_harassment';
    const sla_deadline = isRaggingCase 
      ? getSLADeadline(SLA.ragging_harassment)
      : getSLADeadline(SLA.total_span);

    const deanPortalUser = await getPortalUser(req.user);

    await pool.query(
      `UPDATE grievances SET
         assigned_to=$1, school=$2, department=$3,
         conflict_of_interest=$4, status='assigned',
         sla_deadline=$5, escalation_level=0, updated_at=NOW()
       WHERE id=$6`,
      [resolvedAssigneeId, school || grievance.school, department || grievance.department,
       conflict_of_interest || false, sla_deadline, id]
    );

    await logHistory(id, deanPortalUser.id, 'Grievance assigned to handler', grievance.status, 'assigned', note);

    await sendStatusUpdateEmail(grievance.student_id, grievance, {
      previousStatus: grievance.status,
      newStatus: 'assigned',
      headline: 'Your grievance has been assigned',
    });

    // Notify assignee
    const assignee = await pool.query('SELECT * FROM users WHERE id = $1', [resolvedAssigneeId]);
    if (assignee.rows.length > 0) {
      const roles = assignee.rows[0].role === 'dean' ? 'Dean' : 
                    assignee.rows[0].role === 'faculty' ? 'Director' :
                    assignee.rows[0].role === 'registrar' ? 'Registrar' : 'Staff';
      await sendNotification(resolvedAssigneeId, id,
        `New grievance ${grievance.ticket_id} assigned to you. ${isRaggingCase ? 'URGENT: 24-hour SLA' : '5-day escalation workflow initiated'}`);
    }

    res.json({ message: 'Grievance assigned successfully' });
  } catch (err) {
    console.error('Assign error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── RESOLVE GRIEVANCE ─────────────────────────────────────────
const resolveGrievance = async (req, res) => {
  const { id } = req.params;
  const { resolution_note, resolution_confidential, comment } = req.body;

  if (!resolution_note)
    return res.status(400).json({ message: 'Resolution note is required' });

  try {
    const g = await pool.query('SELECT * FROM grievances WHERE id = $1', [id]);
    if (g.rows.length === 0) return res.status(404).json({ message: 'Not found' });

    const grievance = g.rows[0];

    // Authorization: dean, committee (campus-scoped) or escalated authority
    const isAssigned = grievance.assigned_to === req.user.id;
    const canResolveAsHandler = ['dean', 'committee', 'faculty'].includes(req.user.role) && isAssigned;
    const canResolveAsEscalated = ['faculty', 'registrar'].includes(req.user.role);
    // Dean/committee can always resolve their campus grievances even if not personally assigned
    const isCampusHandler = ['dean', 'committee'].includes(req.user.role) &&
      grievance.campus === req.user.campus;

    if (!canResolveAsHandler && !canResolveAsEscalated && !isCampusHandler) {
      return res.status(403).json({
        message: 'Only the assigned handler or campus authority can resolve this case'
      });
    }

    const resolverPortalUser = await getPortalUser(req.user);

    const isFinal = grievance.escalation_level >= 2;
    const isConfidential = resolution_confidential === true || resolution_confidential === 'true';

    // Approval routing:
    // - academic grievances → pending_director_approval (Director must approve)
    // - all others          → pending_approval (Registrar must approve)
    // - if escalation_level >= 2 (registrar already handling) → resolve directly
    let newStatus;
    if (isFinal) {
      newStatus = 'final_resolved';
    } else if (grievance.category === 'academic') {
      newStatus = 'pending_director_approval';
    } else {
      newStatus = 'pending_approval';
    }

    await pool.query(
      `UPDATE grievances SET status=$1, resolution_note=$2, resolution_confidential=$3, resolved_at=NOW() WHERE id=$4`,
      [newStatus, resolution_note, isConfidential, id]
    );

    await logHistory(id, resolverPortalUser.id,
      isFinal ? 'Grievance resolved' : `Grievance pending approval (${newStatus})`,
      grievance.status, newStatus,
      isConfidential ? '(confidential resolution)' : resolution_note);

    // Optional internal comment at resolution time
    if (comment && String(comment).trim()) {
      await pool.query(
        `INSERT INTO comments (grievance_id, author_id, message, is_internal) VALUES ($1, $2, $3, TRUE)`,
        [id, resolverPortalUser.id, String(comment).trim()]
      );
    }

    // Notify student only when truly resolved; for pending approval just send update
    if (isFinal) {
      await sendResolutionEmail(grievance.student_id, grievance,
        isConfidential ? 'Your grievance has been resolved. The resolution details are confidential.' : resolution_note);
    } else {
      await sendStatusUpdateEmail(grievance.student_id, grievance, {
        previousStatus: grievance.status,
        newStatus,
        headline: 'Your grievance is under final review',
      });
    }

    res.json({ message: isFinal ? 'Grievance resolved successfully' : 'Grievance submitted for approval' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ESCALATE GRIEVANCE (TIME-BASED AUTO-ESCALATION) ──────────
const escalateGrievance = async (req, res) => {
  const { id } = req.params;
  const { manual_escalation, note } = req.body;

  try {
    const g = await pool.query('SELECT * FROM grievances WHERE id = $1', [id]);
    if (g.rows.length === 0) return res.status(404).json({ message: 'Not found' });

    const grievance = g.rows[0];
    const escalatorPortalUser = await getPortalUser(req.user);

    // Ragging/harassment cases skip to escalation_1 directly if needed
    if (grievance.category === 'ragging_harassment') {
      const nextLevel = 1;
      const newStatus = `escalation_${nextLevel}`;
      
      const assignQuery = await pool.query(
        "SELECT id FROM users WHERE role='registrar' LIMIT 1"
      );
      const newAssignee = assignQuery?.rows[0]?.id || null;

      await pool.query(
        `UPDATE grievances SET
           status=$1, escalation_level=$2, assigned_to=$3, updated_at=NOW()
         WHERE id=$4`,
        [newStatus, nextLevel, newAssignee, id]
      );

      await logHistory(id, escalatorPortalUser.id,
        `URGENT: Ragging case escalated to Registrar`, grievance.status, newStatus, note);

      if (newAssignee) {
        await sendNotification(newAssignee, id,
          `URGENT: Ragging/Harassment case ${grievance.ticket_id} escalated to you`);
      }

      return res.json({ message: 'Ragging case escalated to Registrar (Level 1)' });
    }

    // TIME-BASED AUTO-ESCALATION for non-ragging cases
    // Days 0-3: Campus Dean (no escalation needed)
    // Days 3-5: AUTO-ESCALATE to Committee (escalation_1) — still within 5-day window
    // Day 5+  : AUTO-ESCALATE to Oversight/Registrar (escalation_2) — SLA breached
    
    if (!grievance.updated_at) {
      return res.status(400).json({ message: 'Case not yet assigned' });
    }

    const now = new Date();
    const assignedTime = new Date(grievance.updated_at);
    const hoursPassed = (now - assignedTime) / (1000 * 60 * 60);
    const daysPassed = hoursPassed / 24;

    let targetRole = null;
    let nextLevel = 0;
    let newStatus = null;
    let escalationLabel = '';

    if (daysPassed >= 5 && grievance.escalation_level < 2) {
      // Day 5+: SLA breached — escalate to Registrar for final oversight
      nextLevel = 2;
      targetRole = 'registrar';
      newStatus = 'escalation_2';
      escalationLabel = 'Registrar (SLA breached)';
    } else if (daysPassed >= 3 && grievance.escalation_level < 1) {
      // Days 3-5: Escalate to committee (represented by another dean or faculty on same campus)
      nextLevel = 1;
      targetRole = 'dean';
      newStatus = 'escalation_1';
      escalationLabel = 'Grievance Committee';
    } else if (grievance.escalation_level >= 2) {
      return res.status(400).json({ message: 'Case is already at maximum escalation level (Registrar oversight)' });
    } else if (grievance.escalation_level >= 1 && daysPassed < 5) {
      return res.status(400).json({
        message: `Case is with the committee. Registrar oversight triggers after day 5 (currently day ${daysPassed.toFixed(1)}).`
      });
    } else {
      return res.status(400).json({
        message: `Only day ${daysPassed.toFixed(1)} elapsed. Committee escalation begins after day 3.`
      });
    }

    // For committee escalation (escalation_1), find another dean on same campus
    // For registrar oversight (escalation_2), find the registrar
    let newAssignee = null;
    if (targetRole === 'dean') {
      const campusResult = await pool.query(
        `SELECT id FROM users WHERE role='dean' AND campus=$1 AND is_active=TRUE AND id != $2 LIMIT 1`,
        [grievance.campus || 'uppal', grievance.assigned_to]
      );
      newAssignee = campusResult.rows[0]?.id || null;
      // Fallback: any dean if no other campus dean found
      if (!newAssignee) {
        const fallback = await pool.query(
          `SELECT id FROM users WHERE role='dean' AND is_active=TRUE LIMIT 1`
        );
        newAssignee = fallback.rows[0]?.id || null;
      }
    } else {
      const assignQuery = await pool.query(
        `SELECT id FROM users WHERE role=$1 AND is_active=TRUE LIMIT 1`,
        [targetRole]
      );
      newAssignee = assignQuery.rows[0]?.id || null;
    }

    await pool.query(
      `UPDATE grievances SET
         status=$1, escalation_level=$2, assigned_to=$3, updated_at=NOW()
       WHERE id=$4`,
      [newStatus, nextLevel, newAssignee, id]
    );

    await logHistory(id, escalatorPortalUser.id,
      `Escalated to ${escalationLabel} (Day ${daysPassed.toFixed(1)})`,
      grievance.status, newStatus, note);

    await sendStatusUpdateEmail(grievance.student_id, grievance, {
      previousStatus: grievance.status,
      newStatus,
      headline: 'Your grievance has been escalated',
    });

    if (newAssignee) {
      await sendNotification(newAssignee, id,
        `Grievance ${grievance.ticket_id} escalated to ${escalationLabel} (Day ${daysPassed.toFixed(1)} elapsed)`);
    }

    res.json({
      message: `Escalated to ${escalationLabel}`,
      new_status: newStatus,
      days_elapsed: parseFloat(daysPassed.toFixed(1)),
    });
  } catch (err) {
    console.error('Escalate error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ADD COMMENT ───────────────────────────────────────────────
const addComment = async (req, res) => {
  const { id } = req.params;
  const { message, is_internal } = req.body;

  if (!message) return res.status(400).json({ message: 'Message is required' });

  try {
    const commenterPortalUser = await getPortalUser(req.user);
    await pool.query(
      `INSERT INTO comments (grievance_id, author_id, message, is_internal)
       VALUES ($1, $2, $3, $4)`,
      [id, commenterPortalUser.id, message, is_internal !== false]
    );

    const grievanceResult = await pool.query('SELECT id, ticket_id, student_id FROM grievances WHERE id = $1', [id]);
    const grievance = grievanceResult.rows[0];
    if (grievance) {
      await sendResponseUpdateEmail(grievance.student_id, grievance, is_internal === false ? message : null);
    }

    res.status(201).json({ message: 'Comment added' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getProof = async (req, res) => {
  try {
    const { id } = req.params;
    const portalUser = req.user.role === 'student' ? await getPortalUser(req.user) : null;

    const result = await pool.query(
      `SELECT id, student_id, proof_file_name, proof_original_name, proof_mime_type
       FROM grievances WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Grievance not found' });
    }

    const grievance = result.rows[0];
    const canViewAsStudent = req.user.role === 'student' && grievance.student_id === portalUser.id;
    const canViewAsHandler = ['dean', 'committee', 'faculty', 'registrar', 'vc'].includes(req.user.role);

    if (!canViewAsStudent && !canViewAsHandler) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!grievance.proof_file_name) {
      return res.status(404).json({ message: 'Proof not found' });
    }

    res.json({
      file_name: grievance.proof_original_name,
      mime_type: grievance.proof_mime_type,
      url: `${req.protocol}://${req.get('host')}/uploads/proofs/${grievance.proof_file_name}`,
    });
  } catch (err) {
    console.error('Get proof error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── DASHBOARD STATS (oversight roles) ─────────────────────────
const getDashboardStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='submitted')         AS submitted,
        COUNT(*) FILTER (WHERE status IN ('assigned','in_progress')) AS in_progress,
        COUNT(*) FILTER (WHERE status IN ('resolved','final_resolved')) AS resolved,
        COUNT(*) FILTER (WHERE status LIKE 'escalation_%') AS escalated,
        COUNT(*) FILTER (WHERE status='withdrawn')         AS withdrawn,
        COUNT(*) FILTER (WHERE sla_breached=TRUE)          AS sla_breached,
        COUNT(*) FILTER (WHERE category='ragging_harassment') AS ragging,
        COUNT(*)                                            AS total
      FROM grievances
      WHERE status != 'withdrawn'
    `);

    const byCategory = await pool.query(`
      SELECT category, COUNT(*) AS count
      FROM grievances GROUP BY category ORDER BY count DESC
    `);

    const bySchool = await pool.query(`
      SELECT school, COUNT(*) AS count
      FROM grievances WHERE school IS NOT NULL
      GROUP BY school ORDER BY count DESC
    `);

    const recentBreaches = await pool.query(`
      SELECT ticket_id, title, category, status, sla_deadline
      FROM grievances
      WHERE sla_breached=TRUE AND status NOT IN ('resolved','final_resolved','withdrawn')
      ORDER BY sla_deadline ASC LIMIT 10
    `);

    res.json({
      summary: stats.rows[0],
      byCategory: byCategory.rows,
      bySchool: bySchool.rows,
      recentBreaches: recentBreaches.rows
    });
  } catch (err) {
    console.error('Dashboard stats error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ADVANCED ANALYTICS DASHBOARD (Chart.js payload) ──────────
const getAnalyticsDashboard = async (req, res) => {
  try {
    const monthlyTrend = await pool.query(`
      WITH months AS (
        SELECT date_trunc('month', CURRENT_DATE) - (INTERVAL '1 month' * gs.n) AS month_start
        FROM generate_series(11, 0, -1) AS gs(n)
      )
      SELECT
        to_char(m.month_start, 'Mon') AS month,
        COALESCE(s.submissions, 0) AS submissions,
        COALESCE(r.resolutions, 0) AS resolutions
      FROM months m
      LEFT JOIN (
        SELECT date_trunc('month', created_at) AS month_start, COUNT(*) AS submissions
        FROM grievances
        GROUP BY 1
      ) s ON s.month_start = m.month_start
      LEFT JOIN (
        SELECT date_trunc('month', resolved_at) AS month_start, COUNT(*) AS resolutions
        FROM grievances
        WHERE resolved_at IS NOT NULL
        GROUP BY 1
      ) r ON r.month_start = m.month_start
      ORDER BY m.month_start ASC
    `);

    const byCategory = await pool.query(`
      SELECT category AS label, COUNT(*)::int AS value
      FROM grievances
      GROUP BY category
      ORDER BY value DESC
    `);

    const statusDistribution = await pool.query(`
      SELECT status AS label, COUNT(*)::int AS value
      FROM grievances
      GROUP BY status
      ORDER BY value DESC
    `);

    // Derived priority model because grievances table has no explicit priority column.
    const priorityBreakdown = await pool.query(`
      SELECT
        priority AS label,
        COUNT(*)::int AS value
      FROM (
        SELECT
          CASE
            WHEN category = 'ragging_harassment' OR sla_breached = TRUE OR escalation_level >= 2 THEN 'high'
            WHEN escalation_level = 1 OR status IN ('assigned', 'in_progress', 'escalation_1') THEN 'medium'
            ELSE 'low'
          END AS priority
        FROM grievances
      ) q
      GROUP BY priority
      ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
    `);

    const topDepartments = await pool.query(`
      SELECT
        COALESCE(NULLIF(trim(department), ''), 'Unknown') AS label,
        COUNT(*)::int AS value
      FROM grievances
      GROUP BY COALESCE(NULLIF(trim(department), ''), 'Unknown')
      ORDER BY value DESC
      LIMIT 8
    `);

    const summaryTable = await pool.query(`
      SELECT
        COALESCE(NULLIF(trim(department), ''), 'Unknown') AS department,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('resolved', 'final_resolved'))::int AS resolved,
        ROUND(
          (
            COUNT(*) FILTER (WHERE status IN ('resolved', 'final_resolved'))::numeric
            / NULLIF(COUNT(*), 0)
          ) * 100,
          1
        ) AS resolution_rate,
        ROUND(
          AVG(
            EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400
          ) FILTER (WHERE resolved_at IS NOT NULL),
          2
        ) AS avg_resolution_days,
        ROUND(
          (
            COUNT(*) FILTER (
              WHERE status IN ('resolved', 'final_resolved')
                AND (sla_deadline IS NULL OR resolved_at <= sla_deadline)
            )::numeric
            / NULLIF(COUNT(*) FILTER (WHERE status IN ('resolved', 'final_resolved')), 0)
          ) * 100,
          1
        ) AS satisfaction_rate
      FROM grievances
      GROUP BY COALESCE(NULLIF(trim(department), ''), 'Unknown')
      ORDER BY total DESC, department ASC
    `);

    const kpis = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('resolved', 'final_resolved'))::int AS resolved,
        ROUND(
          (
            COUNT(*) FILTER (WHERE status IN ('resolved', 'final_resolved'))::numeric
            / NULLIF(COUNT(*), 0)
          ) * 100,
          1
        ) AS resolution_rate,
        ROUND(
          AVG(
            EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400
          ) FILTER (WHERE resolved_at IS NOT NULL),
          2
        ) AS avg_resolution_days,
        ROUND(
          (
            COUNT(*) FILTER (
              WHERE status IN ('resolved', 'final_resolved')
                AND (sla_deadline IS NULL OR resolved_at <= sla_deadline)
            )::numeric
            / NULLIF(COUNT(*) FILTER (WHERE status IN ('resolved', 'final_resolved')), 0)
          ) * 100,
          1
        ) AS satisfaction_rate
      FROM grievances
    `);

    const campusBreakdown = await pool.query(`
      SELECT
        COALESCE(NULLIF(trim(campus), ''), 'Unknown') AS campus,
        COUNT(*)::int                                                    AS total,
        COUNT(*) FILTER (WHERE status IN ('resolved', 'final_resolved'))::int AS resolved,
        COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'final_resolved', 'withdrawn'))::int AS open,
        COUNT(*) FILTER (WHERE sla_breached = TRUE)::int                AS sla_breached,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400)
          FILTER (WHERE resolved_at IS NOT NULL),
          1
        ) AS avg_days
      FROM grievances
      GROUP BY COALESCE(NULLIF(trim(campus), ''), 'Unknown')
      ORDER BY campus
    `);

    res.json({
      kpis: {
        total: kpis.rows[0]?.total || 0,
        resolution_rate: Number(kpis.rows[0]?.resolution_rate || 0),
        avg_resolution_days: Number(kpis.rows[0]?.avg_resolution_days || 0),
        satisfaction_rate: Number(kpis.rows[0]?.satisfaction_rate || 0),
      },
      charts: {
        monthly_trend: monthlyTrend.rows,
        by_category: byCategory.rows,
        status_distribution: statusDistribution.rows,
        priority_breakdown: priorityBreakdown.rows,
        top_departments: topDepartments.rows,
        campus_breakdown: campusBreakdown.rows,
      },
      summary_table: summaryTable.rows,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Analytics dashboard error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

const getAnalyticsTimeline = async (req, res) => {
  try {
    const monthlyTrend = await pool.query(`
      WITH months AS (
        SELECT date_trunc('month', CURRENT_DATE) - (INTERVAL '1 month' * gs.n) AS month_start
        FROM generate_series(11, 0, -1) AS gs(n)
      )
      SELECT
        to_char(m.month_start, 'Mon') AS month,
        COALESCE(s.submissions, 0) AS submissions,
        COALESCE(r.resolutions, 0) AS resolutions
      FROM months m
      LEFT JOIN (
        SELECT date_trunc('month', created_at) AS month_start, COUNT(*) AS submissions
        FROM grievances
        GROUP BY 1
      ) s ON s.month_start = m.month_start
      LEFT JOIN (
        SELECT date_trunc('month', resolved_at) AS month_start, COUNT(*) AS resolutions
        FROM grievances
        WHERE resolved_at IS NOT NULL
        GROUP BY 1
      ) r ON r.month_start = m.month_start
      ORDER BY m.month_start ASC
    `);

    res.json(monthlyTrend.rows);
  } catch (err) {
    console.error('Analytics timeline error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── OVERSIGHT: ALL GRIEVANCES WITH PROOFS + RESOLUTIONS ──────
// Used by VC, Registrar, Director — full cross-campus view
const getOversightGrievances = async (req, res) => {
  const { campus, status, category } = req.query;
  try {
    let query = `
      SELECT
        g.id, g.ticket_id, g.title, g.description, g.category,
        g.status, g.campus, g.school, g.department,
        g.is_confidential, g.is_anonymous,
        g.escalation_level, g.sla_deadline, g.sla_breached,
        g.resolution_note, g.resolution_confidential,
        g.resolved_at, g.created_at, g.updated_at,
        g.proof_file_name, g.proof_original_name, g.proof_mime_type, g.proof_file_size,
        su.name  AS student_name,
        su.email AS student_email,
        au.name  AS assigned_to_name,
        au.role  AS assigned_to_role,
        au.campus AS handler_campus
      FROM grievances g
      LEFT JOIN users su ON g.student_id = su.id
      LEFT JOIN users au ON g.assigned_to = au.id
      WHERE 1=1`;

    const params = [];
    let i = 1;

    if (campus && campus !== 'all') { query += ` AND g.campus = $${i++}`; params.push(campus); }
    if (status && status !== 'all') { query += ` AND g.status = $${i++}`; params.push(status); }
    if (category && category !== 'all') { query += ` AND g.category = $${i++}`; params.push(category); }

    query += ' ORDER BY g.created_at DESC';

    const result = await pool.query(query, params);
    const rows = result.rows.map(row => mapGrievanceProof(req, row));

    // Campus summary counts
    const campusSummary = await pool.query(`
      SELECT
        campus,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status IN ('resolved','final_resolved')) AS resolved,
        COUNT(*) FILTER (WHERE status NOT IN ('resolved','final_resolved','withdrawn')) AS open,
        COUNT(*) FILTER (WHERE sla_breached = TRUE) AS sla_breached
      FROM grievances
      WHERE campus IS NOT NULL
      GROUP BY campus
    `);

    res.json({ grievances: rows, campusSummary: campusSummary.rows });
  } catch (err) {
    console.error('Oversight grievances error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── EDIT GRIEVANCE (student only, status = submitted) ─────────
const editGrievance = async (req, res) => {
  const { id } = req.params;
  const { title, description, category, school, department, is_confidential } = req.body;

  if (!title && !description && !category && !req.file) {
    return res.status(400).json({ message: 'At least one field must be provided to update' });
  }

  try {
    const portalUser = await getPortalUser(req.user);
    const result = await pool.query('SELECT * FROM grievances WHERE id = $1', [id]);
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Grievance not found' });

    const grievance = result.rows[0];

    if (grievance.student_id !== portalUser.id)
      return res.status(403).json({ message: 'Not your grievance' });

    if (grievance.status !== 'submitted')
      return res.status(400).json({ message: 'Grievance can only be edited while in submitted status' });

    // If a new proof is uploaded, delete the old one
    if (req.file && grievance.proof_file_name) {
      const oldPath = path.join(__dirname, '..', 'uploads', 'proofs', grievance.proof_file_name);
      try { fs.unlinkSync(oldPath); } catch (_) {}
    }

    const newTitle           = title?.trim()       || grievance.title;
    const newDescription     = description?.trim() || grievance.description;
    const newCategory        = category            || grievance.category;
    const newSchool          = school !== undefined ? (school || null) : grievance.school;
    const newDepartment      = department !== undefined ? (department || null) : grievance.department;
    const newConfidential    = is_confidential !== undefined ? (is_confidential === true || is_confidential === 'true') : grievance.is_confidential;
    const newProofName       = req.file ? req.file.filename        : grievance.proof_file_name;
    const newProofOrigName   = req.file ? req.file.originalname    : grievance.proof_original_name;
    const newProofMime       = req.file ? req.file.mimetype        : grievance.proof_mime_type;
    const newProofSize       = req.file ? req.file.size            : grievance.proof_file_size;

    // Recalculate SLA if category changed
    let newSlaDeadline = grievance.sla_deadline;
    if (category && category !== grievance.category) {
      newSlaDeadline = getSLADeadline(
        category === 'ragging_harassment' ? SLA.ragging_harassment : SLA.total_span
      );
    }

    // Recalculate status if ragging category changed
    let newStatus = grievance.status;
    if (category && category !== grievance.category) {
      newStatus = category === 'ragging_harassment' ? 'fast_track' : 'submitted';
    }

    await pool.query(
      `UPDATE grievances SET
         title=$1, description=$2, category=$3, school=$4, department=$5,
         is_confidential=$6, proof_file_name=$7, proof_original_name=$8,
         proof_mime_type=$9, proof_file_size=$10, sla_deadline=$11,
         status=$12, updated_at=NOW()
       WHERE id=$13`,
      [newTitle, newDescription, newCategory, newSchool, newDepartment,
       newConfidential, newProofName, newProofOrigName, newProofMime, newProofSize,
       newSlaDeadline, newStatus, id]
    );

    await logHistory(id, portalUser.id, 'Student edited grievance', grievance.status, newStatus);

    const updated = await pool.query('SELECT * FROM grievances WHERE id = $1', [id]);
    res.json({ message: 'Grievance updated successfully', grievance: mapGrievanceProof(req, updated.rows[0]) });
  } catch (err) {
    if (req.file) {
      const cleanupPath = path.join(__dirname, '..', 'uploads', 'proofs', req.file.filename);
      try { fs.unlinkSync(cleanupPath); } catch (_) {}
    }
    console.error('Edit grievance error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── APPROVE GRIEVANCE (registrar → non-academic; faculty → academic) ──
const approveGrievance = async (req, res) => {
  const { id } = req.params;
  const { approval_note } = req.body;
  const role = req.user.role;

  try {
    const g = await pool.query('SELECT * FROM grievances WHERE id = $1', [id]);
    if (g.rows.length === 0) return res.status(404).json({ message: 'Not found' });

    const grievance = g.rows[0];

    // Registrar approves non-academic pending_approval cases
    if (role === 'registrar' && grievance.status !== 'pending_approval') {
      return res.status(400).json({ message: 'Only pending_approval grievances can be approved by Registrar' });
    }
    // Faculty (Director) approves academic pending_director_approval cases
    if (role === 'faculty' && grievance.status !== 'pending_director_approval') {
      return res.status(400).json({ message: 'Only pending_director_approval grievances can be approved by Director' });
    }

    const approverPortalUser = await getPortalUser(req.user);
    const newStatus = 'resolved';

    await pool.query(
      `UPDATE grievances
         SET status=$1, approved_by=$2, approved_at=NOW(),
             approval_note=$3, updated_at=NOW()
       WHERE id=$4`,
      [newStatus, approverPortalUser.id, approval_note || null, id]
    );

    await logHistory(id, approverPortalUser.id,
      `Grievance approved by ${role === 'registrar' ? 'Registrar' : 'Director'}`,
      grievance.status, newStatus, approval_note || null);

    // Now that it's officially resolved, notify the student
    const isConfidential = grievance.resolution_confidential;
    await sendResolutionEmail(grievance.student_id, grievance,
      isConfidential
        ? 'Your grievance has been resolved. The resolution details are confidential.'
        : grievance.resolution_note);

    res.json({ message: 'Grievance approved and marked as resolved' });
  } catch (err) {
    console.error('Approve grievance error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET PENDING APPROVALS ─────────────────────────────────────
// Registrar: pending_approval (non-academic)
// Director (faculty): pending_director_approval (academic)
const getPendingApprovals = async (req, res) => {
  const role = req.user.role;
  let statusFilter;
  if (role === 'registrar') statusFilter = 'pending_approval';
  else if (role === 'faculty') statusFilter = 'pending_director_approval';
  else return res.status(403).json({ message: 'Not authorized' });

  try {
    const result = await pool.query(
      `SELECT g.id, g.ticket_id, g.title, g.category, g.status,
              g.campus, g.school, g.department,
              g.resolution_note, g.resolution_confidential,
              g.resolved_at, g.created_at, g.sla_breached,
              su.name AS student_name,
              au.name AS assigned_to_name
       FROM grievances g
       LEFT JOIN users su ON g.student_id = su.id
       LEFT JOIN users au ON g.assigned_to = au.id
       WHERE g.status = $1
       ORDER BY g.resolved_at ASC`,
      [statusFilter]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get pending approvals error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── SLA CONFIG (VC reads & sets) ──────────────────────────────
const getSLAConfig = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sla_days, updated_at FROM sla_config ORDER BY id DESC LIMIT 1`
    );
    const config = result.rows[0] || { sla_days: 5 };
    res.json({ sla_days: Number(config.sla_days), updated_at: config.updated_at || null });
  } catch (err) {
    // Table may not exist yet — return default
    res.json({ sla_days: 5, updated_at: null });
  }
};

const setSLAConfig = async (req, res) => {
  const { sla_days } = req.body;
  const days = parseInt(sla_days, 10);

  if (isNaN(days) || days < 5) {
    return res.status(400).json({ message: 'SLA must be at least 5 days' });
  }
  if (days > 365) {
    return res.status(400).json({ message: 'SLA cannot exceed 365 days' });
  }

  try {
    const vcPortalUser = await getPortalUser(req.user);
    await pool.query(
      `INSERT INTO sla_config (sla_days, set_by, updated_at) VALUES ($1, $2, NOW())`,
      [days, vcPortalUser.id]
    );
    res.json({ message: `SLA updated to ${days} days`, sla_days: days });
  } catch (err) {
    console.error('Set SLA config error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  submitGrievance,
  getMyGrievances,
  getGrievanceById,
  withdrawGrievance,
  editGrievance,
  getAllGrievances,
  assignGrievance,
  resolveGrievance,
  escalateGrievance,
  addComment,
  getProof,
  getDashboardStats,
  getAnalyticsDashboard,
  getAnalyticsTimeline,
  getOversightGrievances,
  approveGrievance,
  getPendingApprovals,
  getSLAConfig,
  setSLAConfig,
};