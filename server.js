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
app.use('/uploads', express.static('uploads')); // Serve static files (images/PDFs)

// Ensure uploads directory exists
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// File Upload Configuration (Multer)
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
    user: 'postgres',        // Your pgAdmin username (usually 'postgres')
    host: 'localhost',       // Your host
    database: 'vishal_fitness', // Your database name
    password: '1530',        // Your pgAdmin password
    port: 5432,
});

// Test DB Connection
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client', err.stack);
    }
    console.log('Connected to PostgreSQL Database');
    release();
});

// --- ROUTES ---

// 1. Signup
app.post('/api/auth/signup', async (req, res) => {
    const { name, email, pass, phone, gender, dob, address } = req.body;
    
    try {
        // Check if user exists
        const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Email already exists." });
        }

        // Hash Password
        const hashedPassword = await bcrypt.hash(pass, 10);

        // Insert User
        const query = `
            INSERT INTO users (name, email, password, phone, gender, dob, address) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING id, name, email, role, phone, gender, dob, address, has_completed_membership
        `;
        const values = [name, email, hashedPassword, phone, gender, dob, address];
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

        // Verify Password
        const validPass = await bcrypt.compare(pass, user.password);
        if (!validPass) {
            return res.status(400).json({ success: false, message: "Invalid credentials." });
        }

        // Role Verification
        if (role === 'Admin' && user.role !== 'Admin') {
            return res.status(403).json({ success: false, message: "Admins cannot login as Users." });
        }
        if (role === 'User' && user.role === 'Admin') {
            return res.status(403).json({ success: false, message: "Members cannot access Admin portal." });
        }

        // Return user data (excluding password)
        const { password, ...userWithoutPass } = user;
        res.json({ success: true, user: userWithoutPass });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 3. Submit Membership (With File Uploads)
app.post('/api/membership/submit', upload.fields([
    { name: 'govIdFile', maxCount: 1 },
    { name: 'signatureFile', maxCount: 1 }
]), async (req, res) => {
    const { 
        userId, goal, plan, startDate, endDate, paymentMode,
        emergencyName, emergencyRel, emergencyPhone, 
        medicalCond, medDesc, medChecks, govIdType 
    } = req.body;

    // Fix: Store only the filename, not the full path
    const govIdPath = req.files['govIdFile'] ? req.files['govIdFile'][0].filename : null;
    const sigPath = req.files['signatureFile'] ? req.files['signatureFile'][0].filename : null;

    try {
        // Insert Membership Data
        const query = `
            INSERT INTO memberships (
                user_id, goal, plan, start_date, end_date, payment_mode,
                emergency_name, emergency_relationship, emergency_phone,
                medical_conditions, specific_conditions, gov_id_type, gov_id_file_path, signature_file_path
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
        `;
        
        // Combine specific conditions into a string
        const conditionsStr = medChecks || '';

        const values = [
            userId, goal, plan, startDate, endDate, paymentMode,
            emergencyName, emergencyRel, emergencyPhone,
            (medicalCond === 'Yes' ? medDesc : 'None'), 
            conditionsStr, 
            govIdType, 
            govIdPath, 
            sigPath
        ];

        const result = await pool.query(query, values);

        // Update User Status
        await pool.query('UPDATE users SET has_completed_membership = TRUE WHERE id = $1', [userId]);

        res.json({ success: true, message: "Membership Registered Successfully!", membershipId: result.rows[0].id });

    } catch (err) {
        console.error('Membership submission error:', err);
        res.status(500).json({ success: false, message: "Error saving membership data." });
    }
});

// 4. Submit Enquiry
app.post('/api/enquiry', async (req, res) => {
    const { name, phone, email, contactMethod, goal, plan, startDate, budget, time } = req.body;

    try {
        const query = `
            INSERT INTO enquiries (name, phone, email, contact_method, goal, plan_preference, start_date, budget, preferred_time)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        const values = [name, phone, email, contactMethod, goal, plan, startDate, budget, time];
        await pool.query(query, values);
        res.json({ success: true, message: "Enquiry Sent Successfully!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error saving enquiry." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});