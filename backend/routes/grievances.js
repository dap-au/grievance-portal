// backend/routes/grievances.js
const express = require('express');
const router = express.Router();
const { protect, authorize, blockViceChancellor } = require('../middleware/auth');
const { uploadProof } = require('../middleware/upload');
const {
  submitGrievance, getMyGrievances, getGrievanceById,
  withdrawGrievance, editGrievance, getAllGrievances, assignGrievance,
  resolveGrievance, escalateGrievance, addComment, getProof, getDashboardStats,
  getAnalyticsDashboard, getAnalyticsTimeline, getOversightGrievances,
  approveGrievance, getPendingApprovals, getSLAConfig, setSLAConfig,
} = require('../controllers/grievanceController');

// Roles that can actively work on cases
const CASE_HANDLERS = ['student', 'dean', 'committee', 'faculty', 'registrar'];
// Roles that can view all cases (oversight)
const OVERSIGHT = ['dean', 'committee', 'faculty', 'registrar', 'vc'];
// Roles with full analytics access
const ANALYTICS_ROLES = ['vc', 'registrar', 'faculty'];

// Dashboard/Analytics â€” must come BEFORE /:id routes!
router.get('/dashboard',              protect, authorize(OVERSIGHT), getDashboardStats);
router.get('/analytics',              protect, authorize(ANALYTICS_ROLES), getAnalyticsDashboard);
router.get('/analytics/dashboard',    protect, authorize(ANALYTICS_ROLES), getAnalyticsDashboard);
router.get('/analytics/timeline',     protect, authorize(ANALYTICS_ROLES), getAnalyticsTimeline);
// Oversight: full grievance list with proofs + resolutions (VC, Registrar, Director only)
router.get('/oversight',              protect, authorize(ANALYTICS_ROLES), getOversightGrievances);

// Approvals queue
router.get('/pending-approvals',      protect, authorize(['registrar', 'faculty']), getPendingApprovals);
router.patch('/:id/approve',          protect, authorize(['registrar', 'faculty']), approveGrievance);

// SLA config (VC only)
router.get('/sla-config',             protect, authorize(['vc']), getSLAConfig);
router.post('/sla-config',            protect, authorize(['vc']), setSLAConfig);

// Student routes
router.post('/',              protect, authorize(['student']), uploadProof.single('proof'), submitGrievance);
router.get('/my',             protect, authorize(['student']),  getMyGrievances);
router.patch('/:id/withdraw', protect, authorize(['student']),  withdrawGrievance);
router.patch('/:id/edit',     protect, authorize(['student']),  uploadProof.single('proof'), editGrievance);

router.get('/:id/proof',      protect, getProof);

// Admin/handler routes (case work) â€” dean + committee can resolve and comment
router.get('/',               protect, authorize(['dean', 'committee', 'faculty', 'registrar', 'vc']), getAllGrievances);
router.patch('/:id/assign',   protect, authorize(['dean']), blockViceChancellor, assignGrievance);
router.patch('/:id/resolve',  protect, authorize(['dean', 'committee', 'faculty', 'registrar']), blockViceChancellor, resolveGrievance);
router.patch('/:id/escalate', protect, authorize(['dean', 'committee', 'faculty', 'registrar']), blockViceChancellor, escalateGrievance);
router.post('/:id/comment',   protect, authorize(['dean', 'committee', 'faculty', 'registrar']), blockViceChancellor, addComment);

// Dashboard stats â€” alternative endpoint
router.get('/dashboard/stats', protect, authorize(OVERSIGHT), getDashboardStats);

// Shared detail view
router.get('/:id',            protect, getGrievanceById);

module.exports = router;
