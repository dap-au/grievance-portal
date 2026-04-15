const pool = require('../config/db');
const { sendEmail } = require('./emailService');

const ADMIN_ROLES = [
  'dean_sa',
  'school_dean',
  'dept_head',
  'director_academics',
  'registrar',
  'vice_chancellor',
  'dean',
  'faculty',
  'vc',
];

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatStatusLabel = (status) => String(status || '').replace(/_/g, ' ');

const buildPortalLink = (grievanceId) => `${frontendUrl}${grievanceId ? `/grievances/${grievanceId}` : '/grievances'}`;

const buildEmailShell = ({ accent, title, eyebrow, body }) => `
  <div style="margin:0;padding:0;background:${accent.background};font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:720px;margin:0 auto;padding:32px 18px;">
      <div style="background:#ffffff;border:1px solid ${accent.border};border-top:6px solid ${accent.border};border-radius:16px;overflow:hidden;box-shadow:0 12px 30px rgba(15,23,42,0.08);">
        <div style="padding:28px 30px 18px;background:linear-gradient(135deg, ${accent.headerStart}, ${accent.headerEnd});color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9;">${eyebrow}</div>
          <h1 style="margin:10px 0 0;font-size:26px;line-height:1.2;">${title}</h1>
        </div>
        <div style="padding:28px 30px 32px;color:#1f2937;line-height:1.7;font-size:15px;">
          ${body}
        </div>
      </div>
      <div style="text-align:center;color:#64748b;font-size:12px;padding:14px 10px 0;">
        This is an automated message from the Grievance Portal.
      </div>
    </div>
  </div>
`;

const getActiveAdminRecipients = async () => {
  const admins = await pool.query(
    `SELECT id, name, email, role
     FROM users
     WHERE is_active = TRUE
       AND email IS NOT NULL
       AND role = ANY($1::text[])
     ORDER BY role, name`,
    [ADMIN_ROLES]
  );

  return admins.rows;
};

const notifySingleUser = async ({ userId, grievanceId, message, subject, html }) => {
  const userResult = await pool.query(
    'SELECT id, name, email FROM users WHERE id = $1 AND is_active = TRUE',
    [userId]
  );

  if (userResult.rows.length === 0) {
    return;
  }

  const user = userResult.rows[0];
  await pool.query(
    `INSERT INTO notifications (user_id, grievance_id, message) VALUES ($1, $2, $3)`,
    [user.id, grievanceId || null, message]
  );

  await sendEmail(user.email, subject, html(user));
};

const broadcastToAdmins = async ({ grievanceId, message, subject, html }) => {
  const admins = await getActiveAdminRecipients();

  await Promise.all(admins.map(async (admin) => {
    await pool.query(
      `INSERT INTO notifications (user_id, grievance_id, message) VALUES ($1, $2, $3)`,
      [admin.id, grievanceId || null, message]
    );

    await sendEmail(admin.email, subject, html(admin));
  }));

  return admins.length;
};

const sendNotification = async (userId, grievanceId, message) => {
  try {
    if (!userId) {
      const deans = await pool.query(
        "SELECT id FROM users WHERE role='dean_sa' AND is_active=TRUE"
      );

      for (const dean of deans.rows) {
        await pool.query(
          `INSERT INTO notifications (user_id, grievance_id, message) VALUES ($1, $2, $3)`,
          [dean.id, grievanceId || null, message]
        );
      }

      return;
    }

    await notifySingleUser({
      userId,
      grievanceId,
      message,
      subject: 'Grievance Portal update',
      html: (user) => buildEmailShell({
        accent: {
          background: '#f8fafc',
          border: '#cbd5e1',
          headerStart: '#0f172a',
          headerEnd: '#1e293b',
        },
        eyebrow: 'Portal update',
        title: 'Update on your grievance',
        body: `
          <p style="margin-top:0;">Dear ${escapeHtml(user.name)},</p>
          <p>${escapeHtml(message)}</p>
          <p>
            Open the portal to review the latest details:
            <a href="${buildPortalLink(grievanceId)}" style="color:#0f172a;font-weight:600;">View grievance</a>
          </p>
        `,
      }),
    });
  } catch (err) {
    console.warn('Notification error (non-fatal):', err.message);
  }
};

const sendSubmissionConfirmationEmail = async (userId, grievance) => {
  try {
    await notifySingleUser({
      userId,
      grievanceId: grievance.id,
      message: `Submission confirmation for ${grievance.ticket_id}`,
      subject: `Grievance submitted: ${grievance.ticket_id}`,
      html: (user) => buildEmailShell({
        accent: {
          background: '#f8fafc',
          border: '#1d4ed8',
          headerStart: '#1d4ed8',
          headerEnd: '#2563eb',
        },
        eyebrow: 'Submission received',
        title: 'Your grievance has been submitted',
        body: `
          <p style="margin-top:0;">Dear ${escapeHtml(user.name)},</p>
          <p>Your grievance has been submitted successfully.</p>
          <div style="padding:16px 18px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;margin:18px 0;">
            <div style="font-size:12px;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.08em;">Grievance ID</div>
            <div style="font-size:20px;font-weight:700;color:#0f172a;">${escapeHtml(grievance.ticket_id)}</div>
            <div style="margin-top:6px;color:#334155;">${escapeHtml(grievance.title)}</div>
          </div>
          <p>Keep this ID for future reference. You can follow status updates in the portal.</p>
          <p><a href="${buildPortalLink(grievance.id)}" style="color:#1d4ed8;font-weight:600;">Open grievance in portal</a></p>
        `,
      }),
    });
  } catch (err) {
    console.warn('Submission confirmation email failed:', err.message);
  }
};

const sendStatusUpdateEmail = async (userId, grievance, { previousStatus, newStatus, note = null, headline = 'Your grievance was updated' } = {}) => {
  try {
    await notifySingleUser({
      userId,
      grievanceId: grievance.id,
      message: `Status update for ${grievance.ticket_id}: ${formatStatusLabel(previousStatus)} -> ${formatStatusLabel(newStatus)}`,
      subject: `Update on grievance ${grievance.ticket_id}`,
      html: (user) => buildEmailShell({
        accent: {
          background: '#f8fafc',
          border: '#475569',
          headerStart: '#0f172a',
          headerEnd: '#334155',
        },
        eyebrow: 'Status update',
        title: headline,
        body: `
          <p style="margin-top:0;">Dear ${escapeHtml(user.name)},</p>
          <p>Your grievance <strong>${escapeHtml(grievance.ticket_id)}</strong> has changed status.</p>
          <div style="padding:16px 18px;border-radius:12px;background:#f8fafc;border:1px solid #cbd5e1;margin:18px 0;">
            <div><strong>Previous:</strong> ${escapeHtml(formatStatusLabel(previousStatus) || 'N/A')}</div>
            <div><strong>Current:</strong> ${escapeHtml(formatStatusLabel(newStatus) || 'N/A')}</div>
          </div>
          ${note ? `<p>${escapeHtml(note)}</p>` : ''}
          <p><a href="${buildPortalLink(grievance.id)}" style="color:#0f172a;font-weight:600;">Review the latest update</a></p>
        `,
      }),
    });
  } catch (err) {
    console.warn('Status update email failed:', err.message);
  }
};

const sendResponseUpdateEmail = async (userId, grievance, responseText = null) => {
  try {
    await notifySingleUser({
      userId,
      grievanceId: grievance.id,
      message: `A new response was added to ${grievance.ticket_id}`,
      subject: `New response on grievance ${grievance.ticket_id}`,
      html: (user) => buildEmailShell({
        accent: {
          background: '#f8fafc',
          border: '#0f766e',
          headerStart: '#0f766e',
          headerEnd: '#14b8a6',
        },
        eyebrow: 'New response',
        title: 'A new response is available',
        body: `
          <p style="margin-top:0;">Dear ${escapeHtml(user.name)},</p>
          <p>The grievance team added a new response to your case <strong>${escapeHtml(grievance.ticket_id)}</strong>.</p>
          ${responseText ? `<div style="padding:16px 18px;border-radius:12px;background:#f0fdfa;border:1px solid #99f6e4;margin:18px 0;">${escapeHtml(responseText)}</div>` : ''}
          <p><a href="${buildPortalLink(grievance.id)}" style="color:#0f766e;font-weight:600;">Open the portal to review it</a></p>
        `,
      }),
    });
  } catch (err) {
    console.warn('Response update email failed:', err.message);
  }
};

const sendResolutionEmail = async (userId, grievance, resolutionNote) => {
  try {
    await notifySingleUser({
      userId,
      grievanceId: grievance.id,
      message: `Resolved grievance ${grievance.ticket_id}`,
      subject: `Resolved: ${grievance.ticket_id}`,
      html: (user) => buildEmailShell({
        accent: {
          background: '#f0fdf4',
          border: '#16a34a',
          headerStart: '#166534',
          headerEnd: '#22c55e',
        },
        eyebrow: 'Resolved',
        title: 'Your grievance has been resolved',
        body: `
          <p style="margin-top:0;">Dear ${escapeHtml(user.name)},</p>
          <p>Your grievance <strong>${escapeHtml(grievance.ticket_id)}</strong> has been marked as resolved.</p>
          <div style="padding:16px 18px;border-radius:12px;background:#dcfce7;border:1px solid #86efac;margin:18px 0;">
            <div style="font-size:12px;color:#166534;text-transform:uppercase;letter-spacing:0.08em;">Resolution note</div>
            <div style="margin-top:8px;color:#14532d;">${escapeHtml(resolutionNote || 'No resolution note was provided.')}</div>
          </div>
          <p>Thank you for using the Grievance Portal.</p>
          <p><a href="${buildPortalLink(grievance.id)}" style="color:#166534;font-weight:700;">View the resolved case</a></p>
        `,
      }),
    });
  } catch (err) {
    console.warn('Resolution email failed:', err.message);
  }
};

const sendHighPriorityGrievanceAlert = async (grievance) => {
  try {
    await broadcastToAdmins({
      grievanceId: grievance.id,
      message: `High-priority grievance submitted: ${grievance.ticket_id}`,
      subject: `High-priority grievance alert: ${grievance.ticket_id}`,
      html: (admin) => buildEmailShell({
        accent: {
          background: '#fef2f2',
          border: '#dc2626',
          headerStart: '#991b1b',
          headerEnd: '#ef4444',
        },
        eyebrow: 'High priority alert',
        title: 'Immediate attention required',
        body: `
          <p style="margin-top:0;">Hello ${escapeHtml(admin.name || 'Admin')},</p>
          <p>A high-priority grievance has just been submitted and needs review.</p>
          <div style="padding:16px 18px;border-radius:12px;background:#fff1f2;border:1px solid #fecdd3;margin:18px 0;">
            <div style="font-size:12px;color:#b91c1c;text-transform:uppercase;letter-spacing:0.08em;">Ticket</div>
            <div style="font-size:20px;font-weight:700;color:#111827;">${escapeHtml(grievance.ticket_id)}</div>
            <div style="margin-top:6px;color:#374151;">${escapeHtml(grievance.title)}</div>
            <div style="margin-top:6px;color:#b91c1c;font-weight:600;">Category: ${escapeHtml(formatStatusLabel(grievance.category))}</div>
          </div>
          <p><a href="${buildPortalLink(grievance.id)}" style="color:#b91c1c;font-weight:700;">Review grievance now</a></p>
        `,
      }),
    });
  } catch (err) {
    console.warn('High-priority alert email failed:', err.message);
  }
};

const getOverdueGrievances = async () => {
  const result = await pool.query(
    `SELECT g.id, g.ticket_id, g.title, g.category, g.status, g.sla_deadline,
            u.name AS student_name,
            a.name AS assigned_to_name
     FROM grievances g
     LEFT JOIN users u ON g.student_id = u.id
     LEFT JOIN users a ON g.assigned_to = a.id
     WHERE g.sla_deadline < NOW()
       AND g.status NOT IN ('resolved','final_resolved','withdrawn')
     ORDER BY g.sla_deadline ASC`
  );

  return result.rows;
};

const sendDailyOverdueAlert = async () => {
  try {
    const overdue = await getOverdueGrievances();

    if (overdue.length === 0) {
      return { overdueCount: 0 };
    }

    await broadcastToAdmins({
      grievanceId: null,
      message: `Overdue grievance digest: ${overdue.length} cases need attention`,
      subject: `Overdue grievances (${overdue.length})`,
      html: (admin) => buildEmailShell({
        accent: {
          background: '#fef2f2',
          border: '#b91c1c',
          headerStart: '#7f1d1d',
          headerEnd: '#dc2626',
        },
        eyebrow: 'Overdue alert',
        title: 'Overdue grievances require immediate action',
        body: `
          <p style="margin-top:0;">Hello ${escapeHtml(admin.name || 'Admin')},</p>
          <p>The following grievances are past their SLA deadline and need attention today.</p>
          <table style="width:100%;border-collapse:collapse;margin:18px 0 0;">
            <thead>
              <tr>
                <th align="left" style="padding:10px;border-bottom:1px solid #fecaca;color:#7f1d1d;">Ticket</th>
                <th align="left" style="padding:10px;border-bottom:1px solid #fecaca;color:#7f1d1d;">Title</th>
                <th align="left" style="padding:10px;border-bottom:1px solid #fecaca;color:#7f1d1d;">Assigned to</th>
                <th align="left" style="padding:10px;border-bottom:1px solid #fecaca;color:#7f1d1d;">Deadline</th>
              </tr>
            </thead>
            <tbody>
              ${overdue.map((item) => `
                <tr>
                  <td style="padding:10px;border-bottom:1px solid #fee2e2;font-weight:700;">${escapeHtml(item.ticket_id)}</td>
                  <td style="padding:10px;border-bottom:1px solid #fee2e2;">${escapeHtml(item.title)}</td>
                  <td style="padding:10px;border-bottom:1px solid #fee2e2;">${escapeHtml(item.assigned_to_name || 'Unassigned')}</td>
                  <td style="padding:10px;border-bottom:1px solid #fee2e2;">${escapeHtml(new Date(item.sla_deadline).toLocaleString())}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <p style="margin-top:18px;color:#7f1d1d;font-weight:700;">Total overdue cases: ${overdue.length}</p>
          <p><a href="${buildPortalLink(null)}" style="color:#b91c1c;font-weight:700;">Open the portal dashboard</a></p>
        `,
      }),
    });

    return { overdueCount: overdue.length };
  } catch (err) {
    console.error('Daily overdue alert failed:', err.message);
    return { overdueCount: 0, error: err.message };
  }
};

const checkSLABreaches = async () => {
  try {
    const now = new Date();

    await pool.query(
      `UPDATE grievances SET sla_breached=TRUE
       WHERE sla_deadline < $1
         AND sla_breached=FALSE
         AND status NOT IN ('resolved','final_resolved','withdrawn')`,
      [now]
    );

    const day3 = new Date(); day3.setDate(day3.getDate() + 4);
    const day3start = new Date(); day3start.setDate(day3start.getDate() + 3);
    const reminders = await pool.query(
      `SELECT id, ticket_id, assigned_to FROM grievances
       WHERE sla_deadline BETWEEN $1 AND $2
         AND status NOT IN ('resolved','final_resolved','withdrawn')
         AND assigned_to IS NOT NULL`,
      [day3start, day3]
    );

    for (const g of reminders.rows) {
      await sendNotification(g.assigned_to, g.id,
        `Reminder: Grievance ${g.ticket_id} SLA deadline approaching in 3 days. Please take action.`);
    }

    const day6 = new Date(); day6.setDate(day6.getDate() + 1);
    const day6start = new Date();
    const prealerts = await pool.query(
      `SELECT id, ticket_id FROM grievances
       WHERE sla_deadline BETWEEN $1 AND $2
         AND status NOT IN ('resolved','final_resolved','withdrawn')`,
      [day6start, day6]
    );

    for (const g of prealerts.rows) {
      await sendNotification(null, g.id,
        `Pre-alert: Grievance ${g.ticket_id} will breach SLA in less than 1 day.`);
    }

    console.log(`✅ SLA check done — ${reminders.rows.length} reminders, ${prealerts.rows.length} pre-alerts`);
  } catch (err) {
    console.error('SLA check error:', err.message);
  }
};

const startDailyOverdueAlertJob = () => {
  const runJob = async () => {
    const result = await sendDailyOverdueAlert();
    if (result?.overdueCount > 0) {
      console.log(`✅ Daily overdue alert sent for ${result.overdueCount} grievances`);
    }
  };

  const scheduleNextRun = () => {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(8, 0, 0, 0);

    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delay = nextRun.getTime() - now.getTime();

    setTimeout(() => {
      runJob()
        .catch(err => console.error('Overdue alert run failed:', err.message))
        .finally(() => {
          setInterval(() => {
            runJob().catch(intervalErr => console.error('Overdue alert run failed:', intervalErr.message));
          }, 24 * 60 * 60 * 1000);
        });
    }, delay);
  };

  runJob().catch(err => console.error('Initial overdue alert run failed:', err.message));
  scheduleNextRun();
};

module.exports = {
  sendNotification,
  sendSubmissionConfirmationEmail,
  sendStatusUpdateEmail,
  sendResponseUpdateEmail,
  sendResolutionEmail,
  sendHighPriorityGrievanceAlert,
  sendDailyOverdueAlert,
  startDailyOverdueAlertJob,
  checkSLABreaches,
};