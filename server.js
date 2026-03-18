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
app.use('/uploads', express.static('uploads')); // Serves static files from uploads folder
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
    password: '2005', // REPLACE WITH YOUR PASSWORD
    port: 5432,
});

// --- IN-MEMORY OTP STORE (Demo Purpose) ---
const otpStore = {}; 

// --- HELPER: Generate OTP ---
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

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

// 1. Signup (Updated: Gmail Only + Name Validation)
app.post('/api/auth/signup', async (req, res) => {
    const { name, email, pass, phone, gender, dob, address } = req.body;
    try {
        const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Email already exists." });
        }
        
        // Validate Email is strictly Gmail
        const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: "Only Gmail addresses are allowed." });
        }

        // Validate Name (Alphabets only)
        const nameRegex = /^[A-Za-z\s]+$/;
        if (!nameRegex.test(name)) {
            return res.status(400).json({ success: false, message: "Name must contain only alphabets." });
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

        let membership = null;
        if(user.has_completed_membership) {
            const memResult = await pool.query('SELECT * FROM memberships WHERE user_id = $1', [user.id]);
            if(memResult.rows.length > 0) membership = memResult.rows[0];
        }

        const { password, ...userWithoutPass } = user;
        res.json({ success: true, user: userWithoutPass, membership });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- NEW: FORGOT PASSWORD LOGIC ---

// A. Request OTP
app.post('/api/auth/forgot-password-request', async (req, res) => {
    const { email } = req.body;
    try {
        // 1. Check if user exists
        const result = await pool.query('SELECT phone FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User with this email does not exist." });
        }

        const userPhone = result.rows[0].phone;
        
        // 2. Generate OTP
        const otp = generateOTP();
        const expiry = Date.now() + 5 * 60 * 1000; // Valid for 5 minutes

        // 3. Store in memory
        otpStore[email] = { otp, expiry };

        // 4. Simulate SMS Sending
        console.log(`================================================================================`);
        console.log(`📩 SIMULATED SMS TO ${userPhone}:`);
        console.log(`   Your Vishal Fitness Verification Code is: ${otp}`);
        console.log(`   (Valid for 5 minutes)`);
        console.log(`================================================================================`);

        res.json({ 
            success: true, 
            message: "OTP has been sent to your registered mobile number." 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error processing request." });
    }
});

// B. Verify OTP & Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        // 1. Check OTP
        const storedData = otpStore[email];
        if (!storedData) {
            return res.status(400).json({ success: false, message: "OTP expired or invalid request." });
        }

        if (Date.now() > storedData.expiry) {
            delete otpStore[email];
            return res.status(400).json({ success: false, message: "OTP has expired." });
        }

        if (storedData.otp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP." });
        }

        // 2. Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 3. Update Database
        await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);

        // 4. Cleanup OTP
        delete otpStore[email];

        res.json({ success: true, message: "Password reset successfully! Please login." });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error resetting password." });
    }
});

// 3. Submit Membership
app.post('/api/membership/submit', upload.fields([
    { name: 'govIdFile', maxCount: 1 },
    { name: 'signatureFile', maxCount: 1 },
    { name: 'paymentScreenshotFile', maxCount: 1 } // NEW: Handle Payment Screenshot
]), async (req, res) => {
    const { userId, goal, plan, startDate, endDate, paymentMode, emergencyName, emergencyRel, emergencyPhone, medicalCond, medDesc, medChecks, govIdType, govIdNumber, name, phone, address, gender, dob, paymentStatus, paymentNote } = req.body;
    
    // VALIDATION: Emergency Name and Relationship (Alphabets Only)
    const nameRegex = /^[A-Za-z\s]+$/;
    if (!nameRegex.test(emergencyName)) {
        return res.status(400).json({ success: false, message: "Emergency Contact Name must contain only alphabets." });
    }
    if (!nameRegex.test(emergencyRel)) {
        return res.status(400).json({ success: false, message: "Emergency Relationship must contain only alphabets." });
    }
    
    const govIdPath = req.files['govIdFile'] ? req.files['govIdFile'][0].filename : null;
    const sigPath = req.files['signatureFile'] ? req.files['signatureFile'][0].filename : null;
    const payScreenPath = req.files['paymentScreenshotFile'] ? req.files['paymentScreenshotFile'][0].filename : null; // NEW

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Update User Personal Info
        await client.query(
            `UPDATE users SET name = $1, phone = $2, address = $3, gender = $4, dob = $5 WHERE id = $6`,
            [name, phone, address, gender, dob, userId]
        );

        // Insert or Update Membership
        const existingMem = await client.query('SELECT id FROM memberships WHERE user_id = $1', [userId]);
        
        if (existingMem.rows.length > 0) {
            let updateQuery = "UPDATE memberships SET goal = $1, plan = $2, start_date = $3, end_date = $4, payment_mode = $5, emergency_name = $6, emergency_relationship = $7, emergency_phone = $8, medical_conditions = $9, specific_conditions = $10, gov_id_type = $11, gov_id_number = $12";
            let params = [goal, plan, startDate, endDate, paymentMode, emergencyName, emergencyRel, emergencyPhone, (medicalCond === 'Yes' ? medDesc : 'None'), medChecks || '', govIdType, govIdNumber];
            let paramIdx = 13;

            if (govIdPath) {
                updateQuery += `, gov_id_file_path = $${paramIdx}, id_proof_status = 'Pending', id_proof_reason = NULL`;
                params.push(govIdPath);
                paramIdx++;
            }
            if (sigPath) {
                updateQuery += `, signature_file_path = $${paramIdx}, signature_status = 'Pending', signature_reason = NULL`;
                params.push(sigPath);
                paramIdx++;
            }
            
            // NEW: Update Payment Details
            if (payScreenPath) {
                updateQuery += `, payment_screenshot_path = $${paramIdx}`;
                params.push(payScreenPath);
                paramIdx++;
            }
            if (paymentStatus) {
                updateQuery += `, payment_status = $${paramIdx}`;
                params.push(paymentStatus);
                paramIdx++;
            }
            if (paymentNote) {
                updateQuery += `, payment_note = $${paramIdx}`;
                params.push(paymentNote);
                paramIdx++;
            }
            
            // Reset verification status if payment details updated
            if (payScreenPath || paymentStatus) {
                updateQuery += `, payment_verified = false`; 
            }

            updateQuery += ` WHERE user_id = $${paramIdx}`;
            params.push(userId);

            await client.query(updateQuery, params);
        } else {
            const query = `INSERT INTO memberships (user_id, goal, plan, start_date, end_date, payment_mode, emergency_name, emergency_relationship, emergency_phone, medical_conditions, specific_conditions, gov_id_type, gov_id_number, gov_id_file_path, signature_file_path, payment_screenshot_path, payment_status, payment_note, id_proof_status, signature_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING id`;
            const values = [userId, goal, plan, startDate, endDate, paymentMode, emergencyName, emergencyRel, emergencyPhone, (medicalCond === 'Yes' ? medDesc : 'None'), medChecks || '', govIdType, govIdNumber, govIdPath, sigPath, payScreenPath, paymentStatus, paymentNote, 'Pending', 'Pending'];
            await client.query(query, values);
        }

        await client.query('UPDATE users SET has_completed_membership = TRUE WHERE id = $1', [userId]);
        
        await client.query('COMMIT');
        res.json({ success: true, message: "Membership Registered Successfully!" });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: "Error saving membership data." });
    } finally {
        client.release();
    }
});

// User Update Profile Endpoint
app.put('/api/user/update-profile', upload.fields([
    { name: 'govIdFile', maxCount: 1 },
    { name: 'signatureFile', maxCount: 1 },
    { name: 'paymentScreenshotFile', maxCount: 1 } // NEW
]), async (req, res) => {
    const { userId, name, phone, address, gender, dob, goal, plan, startDate, endDate, paymentMode, emergencyName, emergencyRel, emergencyPhone, medicalCond, medDesc, medChecks, govIdType, govIdNumber, paymentStatus, paymentNote } = req.body;
    const govIdPath = req.files['govIdFile'] ? req.files['govIdFile'][0].filename : null;
    const sigPath = req.files['signatureFile'] ? req.files['signatureFile'][0].filename : null;
    const payScreenPath = req.files['paymentScreenshotFile'] ? req.files['paymentScreenshotFile'][0].filename : null; // NEW

    // VALIDATION: Emergency Name and Relationship
    const nameRegex = /^[A-Za-z\s]+$/;
    if (!nameRegex.test(emergencyName)) {
        return res.status(400).json({ success: false, message: "Emergency Contact Name must contain only alphabets." });
    }
    if (!nameRegex.test(emergencyRel)) {
        return res.status(400).json({ success: false, message: "Emergency Relationship must contain only alphabets." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Update User Table
        await client.query(
            `UPDATE users SET name = $1, phone = $2, address = $3, gender = $4, dob = $5 WHERE id = $6`,
            [name, phone, address, gender, dob, userId]
        );

        // 2. Update Membership Table
        let updateQuery = "UPDATE memberships SET goal = $1, plan = $2, start_date = $3, end_date = $4, payment_mode = $5, emergency_name = $6, emergency_relationship = $7, emergency_phone = $8, medical_conditions = $9, specific_conditions = $10, gov_id_type = $11, gov_id_number = $12";
        let params = [goal, plan, startDate, endDate, paymentMode, emergencyName, emergencyRel, emergencyPhone, (medicalCond === 'Yes' ? medDesc : 'None'), medChecks || '', govIdType, govIdNumber];
        let paramIdx = 13;

        if (govIdPath) {
            updateQuery += `, gov_id_file_path = $${paramIdx}, id_proof_status = 'Pending', id_proof_reason = NULL`;
            params.push(govIdPath);
            paramIdx++;
        }
        if (sigPath) {
            updateQuery += `, signature_file_path = $${paramIdx}, signature_status = 'Pending', signature_reason = NULL`;
            params.push(sigPath);
            paramIdx++;
        }
        
        // NEW: Handle Payment Update in Edit Mode
        if (payScreenPath) {
            updateQuery += `, payment_screenshot_path = $${paramIdx}`;
            params.push(payScreenPath);
            paramIdx++;
        }
        if (paymentStatus) {
            updateQuery += `, payment_status = $${paramIdx}`;
            params.push(paymentStatus);
            paramIdx++;
        }
        if (paymentNote) {
            updateQuery += `, payment_note = $${paramIdx}`;
            params.push(paymentNote);
            paramIdx++;
        }
        
        // Reset verification if payment changed
        if (payScreenPath || paymentStatus) {
            updateQuery += `, payment_verified = false`;
        }

        updateQuery += ` WHERE user_id = $${paramIdx}`;
        params.push(userId);

        await client.query(updateQuery, params);

        await client.query('COMMIT');
        
        const memRes = await client.query('SELECT * FROM memberships WHERE user_id = $1', [userId]);
        res.json({ success: true, message: "Profile Updated Successfully!", membership: memRes.rows[0] });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: "Error updating profile." });
    } finally {
        client.release();
    }
});

// 4. Submit Enquiry (Updated: Name Validation)
app.post('/api/enquiry', async (req, res) => {
    const { name, phone, email, contactMethod, goal, plan, startDate, budget, time } = req.body;
    try {
        // Validate Name
        const nameRegex = /^[A-Za-z\s]+$/;
        if (!nameRegex.test(name)) {
            return res.status(400).json({ success: false, message: "Name must contain only alphabets." });
        }

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

// Create New Admin (Updated: Name Validation)
app.post('/api/admin/create', async (req, res) => {
    const { name, email, pass } = req.body;
    try {
        // Validate Name
        const nameRegex = /^[A-Za-z\s]+$/;
        if (!nameRegex.test(name)) {
            return res.status(400).json({ success: false, message: "Name must contain only alphabets." });
        }

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

// 3. Edit User (Updated: Name Validation)
app.put('/api/admin/user/:id', async (req, res) => {
    const { name, phone, address, gender, dob } = req.body;
    try {
        // Validate Name
        const nameRegex = /^[A-Za-z\s]+$/;
        if (!nameRegex.test(name)) {
            return res.status(400).json({ success: false, message: "Name must contain only alphabets." });
        }

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

// 5. Suspend/Activate User
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

// 7. Get Memberships (UPDATED: Includes Payment Columns)
app.get('/api/admin/memberships', async (req, res) => {
    try {
        // Selects all columns including payment details
        const query = `SELECT m.*, u.name, u.email, u.phone, u.status as user_status, m.user_id FROM memberships m JOIN users u ON m.user_id = u.id ORDER BY m.created_at DESC`;
        const result = await pool.query(query);
        res.json({ success: true, memberships: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 8. Update Membership
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

// Review Document (Approve/Reject)
app.put('/api/admin/membership/:id/review', async (req, res) => {
    const { docType, status, reason } = req.body;
    const statusCol = docType === 'id' ? 'id_proof_status' : 'signature_status';
    const reasonCol = docType === 'id' ? 'id_proof_reason' : 'signature_reason';
    
    try {
        await pool.query(
            `UPDATE memberships SET ${statusCol} = $1, ${reasonCol} = $2 WHERE id = $3`,
            [status, reason || null, req.params.id]
        );
        res.json({ success: true, message: `Document ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error updating status" });
    }
});

// NEW: Verify Payment (Approve/Reject)
app.put('/api/admin/membership/:id/verify-payment', async (req, res) => {
    const { status, reason } = req.body; // status: 'Verified' or 'Rejected'
    
    try {
        await pool.query(
            `UPDATE memberships SET payment_verified = $1, payment_reject_reason = $2 WHERE id = $3`,
            [status === 'Verified', reason || null, req.params.id]
        );
        res.json({ success: true, message: `Payment ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error updating payment status" });
    }
});

// ================= TRAINER ROUTES =================

// Get Public Trainers
app.get('/api/trainers', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, experience, bio, photo, instagram, availability FROM trainers ORDER BY created_at DESC');
        res.json({ success: true, trainers: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get Admin Trainers
app.get('/api/admin/trainers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM trainers ORDER BY created_at DESC');
        res.json({ success: true, trainers: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Create Trainer
app.post('/api/admin/trainer', upload.single('photo'), async (req, res) => {
    const { name, experience, bio, instagram, availability, specialization } = req.body;
    const photo = req.file ? req.file.filename : null;

    try {
        const query = `INSERT INTO trainers (name, experience, bio, instagram, availability, specialization, photo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;
        const values = [name, experience, bio, instagram, availability, specialization, photo];
        const result = await pool.query(query, values);
        res.json({ success: true, message: 'Trainer added successfully', trainer: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update Trainer
app.put('/api/admin/trainer/:id', upload.single('photo'), async (req, res) => {
    const { name, experience, bio, instagram, availability, specialization } = req.body;
    const id = req.params.id;

    try {
        let photo = req.file ? req.file.filename : null;
        if (!photo) {
            const current = await pool.query('SELECT photo FROM trainers WHERE id = $1', [id]);
            if(current.rows.length > 0) photo = current.rows[0].photo;
        }

        const query = `UPDATE trainers SET name = $1, experience = $2, bio = $3, instagram = $4, availability = $5, specialization = $6, photo = $7 WHERE id = $8`;
        const values = [name, experience, bio, instagram, availability, specialization, photo, id];
        
        await pool.query(query, values);
        res.json({ success: true, message: 'Trainer updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Delete Trainer
app.delete('/api/admin/trainer/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM trainers WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Trainer deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= REVIEW ROUTES =================

// Submit Review
app.post('/api/review/submit', async (req, res) => {
    const { userId, rating, reviewText, reviewDate } = req.body;
    try {
        const query = `UPDATE users SET rating = $1, review_text = $2, review_date = $3 WHERE id = $4`;
        const values = [rating, reviewText, reviewDate, userId];
        await pool.query(query, values);
        res.json({ success: true, message: 'Review submitted successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get Reviews
app.get('/api/reviews', async (req, res) => {
    try {
        const query = `SELECT id, name, rating, review_text, review_date FROM users WHERE review_text IS NOT NULL ORDER BY review_date DESC`;
        const result = await pool.query(query);
        res.json({ success: true, reviews: result.rows });
    } catch (err) {
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
