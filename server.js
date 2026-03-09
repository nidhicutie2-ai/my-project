const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use(express.static(__dirname));

// Ensure uploads directory exists
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// File Upload Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// DATABASE CONFIGURATION
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'vishal_fitness',
    password: '1530',
    port: 5432,
});

// --- SEED DEFAULT ADMIN FUNCTION ---
async function createDefaultAdmin() {
    try {
        const client = await pool.connect();
        const email = 'admin@vishal.com';
        const plainPassword = 'admin123';
        
        console.log(`🔍 Checking if admin exists (${email})...`);
        
        const checkUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (checkUser.rows.length > 0) {
            console.log('✅ Admin already exists in database. Skipping creation.');
            client.release();
            return;
        }

        console.log(`⚙️  Admin not found. Hashing password '${plainPassword}'...`);
        
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        console.log(`🔐 Hash generated.`);
        
        const userRes = await client.query(
            `INSERT INTO users (name, email, password, role, status, has_completed_membership) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING id`,
            ['Super Admin', email, hashedPassword, 'Admin', 'Active', true]
        );
        
        await client.query(
            `INSERT INTO admins (user_id) VALUES ($1)`,
            [userRes.rows[0].id]
        );
        
        console.log('🎉 SUCCESS: Default Admin Created!');
        console.log(`   👤 Email: ${email}`);
        console.log(`   🔑 Password: ${plainPassword}`);
        
        client.release();
    } catch (err) {
        console.error('❌ CRITICAL ERROR creating admin:', err);
    }
}

// --- ROUTES ---

// 1. Signup
app.post('/api/auth/signup', async (req, res) => {
    const { name, email, pass, phone, gender, dob, address } = req.body;
    try {
        const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Email already exists." });
        }
        const hashedPassword = await bcrypt.hash(pass, 10);
        const query = `INSERT INTO users (name, email, password, phone, gender, dob, address, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, email, role, phone, gender, dob, address, has_completed_membership, status`;
        const values = [name, email, hashedPassword, phone, gender, dob, address, 'Active'];
        const result = await pool.query(query, values);
        res.status(201).json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 2. Login
app.post('/api/auth/login', async (req, res) => {
    const { email, pass, role } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid credentials." });
        }
        const user = result.rows[0];

        if (user.status === 'Suspended') {
            return res.status(403).json({ success: false, message: "Your account has been suspended. Contact Admin." });
        }

        const validPass = await bcrypt.compare(pass, user.password);
        if (!validPass) {
            return res.status(400).json({ success: false, message: "Invalid credentials." });
        }

        if (role === 'Admin' && user.role !== 'Admin') {
            return res.status(403).json({ success: false, message: "Access Denied." });
        }
        if (role === 'User' && user.role === 'Admin') {
            return res.status(403).json({ success: false, message: "Admins cannot login via User portal." });
        }

        const { password, ...userWithoutPass } = user;
        res.json({ success: true, user: userWithoutPass });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 3. Submit Membership
app.post('/api/membership/submit', upload.fields([
    { name: 'govIdFile', maxCount: 1 },
    { name: 'signatureFile', maxCount: 1 }
]), async (req, res) => {
    const { userId, goal, plan, startDate, endDate, paymentMode, emergencyName, emergencyRel, emergencyPhone, medicalCond, medDesc, medChecks, govIdType } = req.body;
    const govIdPath = req.files['govIdFile'] ? req.files['govIdFile'][0].filename : null;
    const sigPath = req.files['signatureFile'] ? req.files['signatureFile'][0].filename : null;

    try {
        const query = `INSERT INTO memberships (user_id, goal, plan, start_date, end_date, payment_mode, emergency_name, emergency_relationship, emergency_phone, medical_conditions, specific_conditions, gov_id_type, gov_id_file_path, signature_file_path) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`;
        const values = [userId, goal, plan, startDate, endDate, paymentMode, emergencyName, emergencyRel, emergencyPhone, (medicalCond === 'Yes' ? medDesc : 'None'), medChecks || '', govIdType, govIdPath, sigPath];
        await pool.query(query, values);
        await pool.query('UPDATE users SET has_completed_membership = TRUE WHERE id = $1', [userId]);
        res.json({ success: true, message: "Membership Registered Successfully!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error saving membership data." });
    }
});

// 4. Submit Enquiry
app.post('/api/enquiry', async (req, res) => {
    const { name, phone, email, contactMethod, goal, plan, startDate, budget, time } = req.body;
    try {
        const query = `INSERT INTO enquiries (name, phone, email, contact_method, goal, plan_preference, start_date, budget, preferred_time) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;
        await pool.query(query, [name, phone, email, contactMethod, goal, plan, startDate, budget, time]);
        res.json({ success: true, message: "Enquiry Sent Successfully!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error saving enquiry." });
    }
});

// ================= ADMIN DASHBOARD ROUTES =================

// Get All Stats
app.get('/api/admin/stats', async (req, res) => {
    try {
        const usersCount = (await pool.query('SELECT COUNT(*) FROM users')).rows[0].count;
        const membersCount = (await pool.query('SELECT COUNT(*) FROM memberships')).rows[0].count;
        const enquiriesCount = (await pool.query('SELECT COUNT(*) FROM enquiries')).rows[0].count;
        res.json({ success: true, stats: { users: usersCount, members: membersCount, enquiries: enquiriesCount } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Create New Admin
app.post('/api/admin/create', async (req, res) => {
    const { name, email, pass } = req.body;
    try {
        const check = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if(check.rows.length > 0) return res.status(400).json({ success: false, message: "User already exists" });

        const hashedPassword = await bcrypt.hash(pass, 10);
        const userRes = await pool.query(
            'INSERT INTO users (name, email, password, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, email, hashedPassword, 'Admin', 'Active']
        );
        await pool.query('INSERT INTO admins (user_id) VALUES ($1)', [userRes.rows[0].id]);
        res.json({ success: true, message: 'Admin created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get Admins List
app.get('/api/admin/admins', async (req, res) => {
    try {
        const query = `SELECT u.id, u.name, u.email, u.status, a.created_at as admin_since FROM users u JOIN admins a ON u.id = a.user_id`;
        const result = await pool.query(query);
        res.json({ success: true, admins: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 1. Get All Users
app.get('/api/admin/users', async (req, res) => {
    try {
        const query = `SELECT id, name, email, phone, role, status, address, gender, dob, has_completed_membership, created_at FROM users ORDER BY created_at DESC`;
        const result = await pool.query(query);
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error("❌ Database Error in /api/admin/users:", err.message);
        res.status(500).json({ success: false, message: "Server Error fetching users", error: err.message });
    }
});

// 2. Get Single User
app.get('/api/admin/user/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. Edit User
app.put('/api/admin/user/:id', async (req, res) => {
    const { name, phone, address, gender, dob } = req.body;
    try {
        await pool.query('UPDATE users SET name = $1, phone = $2, address = $3, gender = $4, dob = $5 WHERE id = $6', 
            [name, phone, address, gender, dob, req.params.id]);
        res.json({ success: true, message: 'User updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. Delete User
app.delete('/api/admin/user/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. Suspend/Activate User (Used by both User Table and Membership Suspend Action)
app.put('/api/admin/user/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ success: true, message: `User ${status} successfully` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 6. Get Enquiries
app.get('/api/admin/enquiries', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM enquiries ORDER BY created_at DESC');
        res.json({ success: true, enquiries: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 7. Get Memberships (UPDATED: Included user_id and status)
app.get('/api/admin/memberships', async (req, res) => {
    try {
        const query = `SELECT m.*, u.name, u.email, u.phone, u.status as user_status, m.user_id FROM memberships m JOIN users u ON m.user_id = u.id ORDER BY m.created_at DESC`;
        const result = await pool.query(query);
        res.json({ success: true, memberships: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 8. NEW: Update Membership (Edit Action)
app.put('/api/admin/membership/:id', async (req, res) => {
    const { plan, goal, startDate, endDate, paymentMode } = req.body;
    try {
        await pool.query(
            'UPDATE memberships SET plan = $1, goal = $2, start_date = $3, end_date = $4, payment_mode = $5 WHERE id = $6',
            [plan, goal, startDate, endDate, paymentMode, req.params.id]
        );
        res.json({ success: true, message: 'Membership updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 9. Delete Membership
app.delete('/api/admin/membership/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM memberships WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Membership deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- START SERVER & SEED ADMIN ---
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client', err.stack);
    }
    console.log('✅ Connected to PostgreSQL Database');
    
    createDefaultAdmin();
    
    release();
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});