# Student Grievance Portal

Full-stack web application — React + Node.js + PostgreSQL

---

## File Structure

```
grievance-portal/
├── backend/
│   ├── config/
│   │   ├── db.js              ← Database connection
│   │   └── schema.sql         ← Run once to create all tables
│   ├── controllers/
│   │   ├── authController.js  ← Login, register, get user
│   │   └── grievanceController.js ← All grievance logic
│   ├── middleware/
│   │   └── auth.js            ← JWT protection + role check
│   ├── routes/
│   │   ├── auth.js            ← /api/auth/*
│   │   └── grievances.js      ← /api/grievances/*
│   ├── utils/
│   │   └── notifications.js   ← Email + DB notifications, SLA checker
│   ├── server.js              ← Entry point
│   ├── package.json
│   └── .env.example           ← Copy to .env and fill values
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── shared/
│   │   │       └── Sidebar.js
│   │   ├── context/
│   │   │   └── AuthContext.js ← Global login state
│   │   ├── pages/
│   │   │   ├── Login.js
│   │   │   ├── Register.js
│   │   │   ├── Dashboard.js
│   │   │   ├── SubmitGrievance.js
│   │   │   ├── MyGrievances.js
│   │   │   ├── GrievanceDetail.js
│   │   │   ├── AllGrievances.js
│   │   │   └── OversightDashboard.js
│   │   ├── utils/
│   │   │   └── api.js         ← Axios with auto JWT attach
│   │   ├── App.js             ← Routes
│   │   ├── index.js
│   │   └── index.css          ← Full design system
│   └── package.json
└── README.md
```

---

## Step-by-Step Setup

### 1. Install PostgreSQL
- Download from https://www.postgresql.org/download/
- Install and remember your password
- Start the PostgreSQL service

### 2. Create the database
Open terminal / pgAdmin and run:
```sql
CREATE DATABASE grievance_db;
```

### 3. Run the schema
```bash
psql -U postgres -d grievance_db -f backend/config/schema.sql
```
This creates all tables: users, grievances, grievance_history, comments, notifications.

### 4. Set up backend
```bash
cd backend
cp .env.example .env
# Edit .env with your DB password, JWT secret, email settings
npm install
npm run dev
```
You should see:
- ✅ Database connected successfully
- 🚀 Server running on http://localhost:5000

### 5. Set up frontend
```bash
cd frontend
npm install
npm start
```
Opens at http://localhost:3000

---

## Common Errors and Fixes

### "password authentication failed for user postgres"
→ Wrong DB_PASSWORD in .env. Use the password you set during PostgreSQL install.

### "ECONNREFUSED 127.0.0.1:5432"
→ PostgreSQL is not running.
- Windows: Search "Services" → find PostgreSQL → Start
- Mac: `brew services start postgresql`
- Linux: `sudo service postgresql start`

### "relation users does not exist"
→ You didn't run schema.sql. Run it:
```bash
psql -U postgres -d grievance_db -f backend/config/schema.sql
```

### "Cannot GET /api/grievances" (404)
→ Backend server is not running. Run `npm run dev` in /backend.

### "Network Error" in browser
→ Frontend can't reach backend. Check REACT_APP_API_URL in frontend/.env
or make sure backend is running on port 5000.

### "jwt malformed" or "invalid token"
→ Clear localStorage in browser dev tools → Application → Local Storage → Clear all.

### "Module not found"
→ You forgot `npm install`. Run it in both /backend and /frontend.

---

## Adding Staff Users

Staff accounts (Dean SA, School Dean, Registrar, etc.) are created directly in the DB,
not through the public registration form.

First generate a bcrypt hash for the password:
```bash
node -e "const b=require('bcryptjs'); b.hash('StaffPass@123', 10).then(h => console.log(h));"
```

Then insert:
```sql
INSERT INTO users (name, email, password, role, school)
VALUES (
  'Dr. Ravi Kumar',
  'ravi.kumar@college.edu',
  '<paste bcrypt hash here>',
  'school_dean',
  'School of Engineering'
);
```

Available roles:
- student         → self-registers
- dean_sa         → sees all grievances, assigns
- school_dean     → sees their school's grievances
- dept_head       → sees their department's grievances
- registrar       → escalation level 2 + oversight
- director_academics → escalation level 3 (academic) + oversight
- vice_chancellor → final authority + oversight

---

## Role Access Summary

| Page              | Student | Dean SA | School Dean | Dept Head | Registrar | Director | VC |
|-------------------|---------|---------|-------------|-----------|-----------|----------|----|
| Submit grievance  | ✓       |         |             |           |           |          |    |
| My grievances     | ✓       |         |             |           |           |          |    |
| All grievances    |         | ✓       | ✓           | ✓         | ✓         | ✓        | ✓  |
| Assign            |         | ✓       |             |           |           |          |    |
| Resolve           |         | ✓       | ✓           | ✓         | ✓         | ✓        | ✓  |
| Escalate          |         | ✓       | ✓           | ✓         | ✓         | ✓        | ✓  |
| Oversight charts  |         |         |             |           | ✓         | ✓        | ✓  |

---

## Escalation Chain

1. Student submits → Dean SA reviews and assigns (48 hr)
2. School Dean / Department resolves (7 days)
   - Day 3: auto-reminder to resolver
   - Day 6: pre-alert to Dean SA
3. If unresolved / disputed → Dean SA escalation review (3 days)
4. Still unresolved → Registrar policy review (5 days)
5. Still unresolved →
   - Academic cases → Director Academics (5 days)
   - Other cases → Vice Chancellor (final binding)
6. If Director can't resolve → Vice Chancellor (absolute final)

Ragging/harassment → always fast-tracked to dedicated committee (24 hr)