require('dotenv').config();
const prisma = require('./config/prisma');
const bcrypt = require('bcryptjs');

const DEFAULT_STAFF_PASSWORD = 'StaffPass@123';

const defaultStaffUsers = [
	// ── Campus Dean Student Affairs (one per campus) ─────────────
	{
		email: 'deansa.uppal@aurora.edu.in',
		name:  'Ms. Geetha Prathiban',
		role:  'dean',
		campus: 'uppal',
		school: 'School of Informatics',
		department: 'MCA',
	},
	{
		email: 'deansa.bhongir@aurora.edu.in',
		name:  'Dr. Pradosh Patnaik',
		role:  'dean',
		campus: 'bhongir',
		school: 'School of Engineering',
		department: 'ECE',
	},
	// ── Shared Roles (serve both campuses) ───────────────────────
	{
		email: 'registrar@aurora.edu.in',
		name:  'Prof. Chandrashekar',
		role:  'registrar',
		campus: null,
		school: 'Central',
		department: 'Administration',
	},
	{
		email: 'dap@aurora.edu.in',
		name:  'Dr. Aruna Vemula',
		role:  'faculty',
		campus: null,
		school: 'School of Informatics',
		department: 'MCA',
	},
	{
		email: 'vc@aurora.edu.in',
		name:  'Dr. Srilatha Chepure',
		role:  'vc',
		campus: null,
		school: 'Central',
		department: 'Office of Vice Chancellor',
	},
];

async function seedDefaultStaffUsers() {
	try {
		const hashedPassword = await bcrypt.hash(DEFAULT_STAFF_PASSWORD, 10);

		for (const user of defaultStaffUsers) {
			await prisma.user.upsert({
				where: { email: user.email },
				update: {
					name: user.name,
					password: hashedPassword,
					role: user.role,
					campus: user.campus ?? null,
					school: user.school || null,
					department: user.department || null,
					isVerified: true,
					resetToken: null,
					resetTokenExpiry: null,
				},
				create: {
					email: user.email,
					name: user.name,
					password: hashedPassword,
					role: user.role,
					campus: user.campus ?? null,
					school: user.school || null,
					department: user.department || null,
					isVerified: true,
				},
			});
		}

		console.log('Default staff accounts are ready:');
		for (const user of defaultStaffUsers) {
			const campusTag = user.campus ? ` [${user.campus} campus]` : ' [both campuses]';
			console.log(`- ${user.email} (${user.role})${campusTag} — ${user.school} / ${user.department}`);
		}
		console.log(`Password for all staff accounts: ${DEFAULT_STAFF_PASSWORD}`);

		await prisma.$disconnect();
		process.exit(0);
	} catch (error) {
		console.error('Seed failed:', error.message);
		await prisma.$disconnect();
		process.exit(1);
	}
}

seedDefaultStaffUsers();
