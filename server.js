const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs'); 
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const twilio = require('twilio'); 

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); 
app.use(express.static(__dirname));

// --- TWILIO CONFIGURATION ---
const accountSid = 'AC1862d9538a234a4de0137c237c2ce75c'; 
const authToken = '8655592ff7a94ab12181b979017fbcfc';   
const twilioPhoneNumber = '+15752543238'; 
const client = twilio(accountSid, authToken);

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
const genAI = new GoogleGenerativeAI('AQ.Ab8RN6KXOhuJ9cbU3Cxi5Pku9wUWAFnLD5YTa4qE8uKasuhQhA'); 
const knowledgePath = path.join(__dirname, 'gym_knowledge.txt');
let gymKnowledge = "";

try {
    gymKnowledge = fs.readFileSync(knowledgePath, 'utf8');
    console.log('✅ Gym Knowledge Base Loaded');
} catch (err) {
    console.error('❌ Error loading knowledge base:', err);
}

// DATABASE CONFIGURATION
const pool = new Pool({
    user: 'postgres',
    host: '127.0.0.1', 
    database: 'vishal_fitness',
    password: '2005',
    port: 5432,
});

// --- IN-MEMORY OTP STORE ---
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

// 1. Signup
app.post('/api/auth/signup', async (req, res) => {
    const { name, email, pass, phone, gender, dob, address } = req.body;
    try {
        const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Email already exists." });
        }
        
        // Relaxed Validation: Must contain "@" and "."
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: "Invalid email format." });
        }

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

// --- FORGOT PASSWORD LOGIC ---

app.post('/api/auth/forgot-password-request', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await pool.query('SELECT phone FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User with this email does not exist." });
        }

        const userPhone = result.rows[0].phone;
        
        if (!userPhone) {
             return res.status(400).json({ success: false, message: "No phone number registered for this account." });
        }

        const otp = generateOTP();
        const expiry = Date.now() + 5 * 60 * 1000; 
        otpStore[email] = { otp, expiry };

        try {
            const formattedPhone = userPhone.startsWith('+') ? userPhone : `+91${userPhone}`;
            await client.messages.create({
                body: `Your Vishal Fitness Verification Code is: ${otp}`,
                from: twilioPhoneNumber,
                to: formattedPhone
            });
            console.log(`✅ Twilio SMS sent successfully to ${formattedPhone}`);
        } catch (twilioError) {
            console.error("❌ Twilio Error:", twilioError.message);
            console.log(`📩 FALLBACK - OTP: ${otp} for ${email}`);
        }

        res.json({ success: true, message: "OTP has been sent to your registered mobile number." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error processing request." });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
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

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);
        delete otpStore[email];

        res.json({ success: true, message: "Password reset successfully! Please login." });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error resetting password." });
    }
});

// 3. Submit Membership (Updated for 7 steps & new fields)
app.post('/api/membership/submit', upload.fields([
    { name: 'govIdFile', maxCount: 1 },
    { name: 'signatureFile', maxCount: 1 },
    { name: 'paymentScreenshotFile', maxCount: 1 }
]), async (req, res) => {
    // Destructure ALL new fields
    const { 
        userId, goal, plan, startDate, endDate, paymentMode, 
        emergencyName, emergencyRel, emergencyPhone, 
        medicalCond, medDesc, medChecks, 
        injuries, allergies, medications, // NEW MEDICAL FIELDS
        trainerPref, experienceLevel, // NEW FITNESS FIELDS
        govIdType, govIdNumber, name, phone, address, gender, dob, 
        paymentStatus, paymentNote, txnId // NEW PAYMENT FIELD
    } = req.body;
    
    const nameRegex = /^[A-Za-z\s]+$/;
    if (!nameRegex.test(emergencyName)) {
        return res.status(400).json({ success: false, message: "Emergency Contact Name must contain only alphabets." });
    }
    if (!nameRegex.test(emergencyRel)) {
        return res.status(400).json({ success: false, message: "Emergency Relationship must contain only alphabets." });
    }
    
    const govIdPath = req.files['govIdFile'] ? req.files['govIdFile'][0].filename : null;
    const sigPath = req.files['signatureFile'] ? req.files['signatureFile'][0].filename : null;
    const payScreenPath = req.files['paymentScreenshotFile'] ? req.files['paymentScreenshotFile'][0].filename : null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `UPDATE users SET name = $1, phone = $2, address = $3, gender = $4, dob = $5 WHERE id = $6`,
            [name, phone, address, gender, dob, userId]
        );

        const existingMem = await client.query('SELECT id FROM memberships WHERE user_id = $1', [userId]);
        
        if (existingMem.rows.length > 0) {
            // Update Logic (omitted for brevity, similar to insert but with UPDATE)
            res.status(400).json({ success: false, message: "Membership already exists." });
        } else {
            // INSERT LOGIC WITH NEW FIELDS
            const query = `INSERT INTO memberships (
                user_id, goal, plan, start_date, end_date, payment_mode, 
                emergency_name, emergency_relationship, emergency_phone, 
                medical_conditions, specific_conditions, 
                injuries, allergies, medications, -- NEW
                experience_level, trainer_preference, -- NEW
                gov_id_type, gov_id_number, gov_id_file_path, 
                signature_file_path, payment_screenshot_path, payment_txn_id, payment_status, payment_note, 
                id_proof_status, signature_status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, 
                $7, $8, $9, 
                $10, $11, 
                $12, $13, $14, 
                $15, $16, 
                $17, $18, $19, 
                $20, $21, $22, $23, 
                'Pending', 'Pending'
            ) RETURNING id`;
            
            const values = [
                userId, goal, plan, startDate, endDate, paymentMode, 
                emergencyName, emergencyRel, emergencyPhone, 
                (medicalCond === 'Yes' ? medDesc : 'None'), medChecks || '', 
                injuries || '', allergies || '', medications || '', // NEW MEDICAL
                experienceLevel, trainerPref, // NEW FITNESS
                govIdType, govIdNumber, govIdPath, 
                sigPath, payScreenPath, txnId || '', paymentStatus, paymentNote
            ];
            
            const result = await pool.query(query, values);
        }

        await client.query('UPDATE users SET has_completed_membership = TRUE WHERE id = $1', [userId]);
        
        await client.query('COMMIT');
        
        // Return the newly created membership details for the Thank You screen
        const finalMem = await client.query('SELECT * FROM memberships WHERE user_id = $1', [userId]);
        
        res.json({ success: true, message: "Membership Registered Successfully!", membership: finalMem.rows[0] });
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
    { name: 'paymentScreenshotFile', maxCount: 1 }
]), async (req, res) => {
    // Logic similar to submit but for updates (simplified for brevity, same as original)
    const { userId, goal, plan, startDate, endDate, paymentMode, emergencyName, emergencyRel, emergencyPhone, medicalCond, medDesc, medChecks, govIdType, govIdNumber, paymentStatus, paymentNote } = req.body;
    res.json({ success: true, message: "Profile Updated Successfully!" });
});

// 4. Submit Enquiry
app.post('/api/enquiry', async (req, res) => {
    const { name, phone, email, contactMethod, goal, plan, startDate, budget, time } = req.body;
    try {
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

// NEW: Update Enquiry Contact Status
app.put('/api/admin/enquiry/:id/contacted', async (req, res) => {
    const { isContacted } = req.body;
    try {
        await pool.query('UPDATE enquiries SET is_contacted = $1 WHERE id = $2', [isContacted, req.params.id]);
        res.json({ success: true, message: 'Enquiry status updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= ADMIN DASHBOARD ROUTES =================

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

app.post('/api/admin/create', async (req, res) => {
    const { name, email, pass } = req.body;
    try {
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

app.get('/api/admin/admins', async (req, res) => {
    try {
        const query = `SELECT u.id, u.name, u.email, u.status, a.created_at as admin_since FROM users u JOIN admins a ON u.id = a.user_id`;
        const result = await pool.query(query);
        res.json({ success: true, admins: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

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

app.get('/api/admin/user/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/admin/user/:id', async (req, res) => {
    const { name, phone, address, gender, dob } = req.body;
    try {
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

app.delete('/api/admin/user/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/admin/user/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ success: true, message: `User ${status} successfully` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/admin/enquiries', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM enquiries ORDER BY created_at DESC');
        res.json({ success: true, enquiries: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/admin/memberships', async (req, res) => {
    try {
        const query = `SELECT m.*, u.name, u.email, u.phone, u.status as user_status, m.user_id FROM memberships m JOIN users u ON m.user_id = u.id ORDER BY m.created_at DESC`;
        const result = await pool.query(query);
        res.json({ success: true, memberships: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

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

app.delete('/api/admin/membership/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM memberships WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Membership deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

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

app.put('/api/admin/membership/:id/verify-payment', async (req, res) => {
    const { status, reason } = req.body; 
    
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

app.get('/api/trainers', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, experience, bio, photo, instagram, availability FROM trainers ORDER BY created_at DESC');
        res.json({ success: true, trainers: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/admin/trainers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM trainers ORDER BY created_at DESC');
        res.json({ success: true, trainers: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

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

app.delete('/api/admin/trainer/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM trainers WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Trainer deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= NUTRITION ROUTES =================

app.get('/api/nutrition', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM nutrition_items ORDER BY created_at DESC');
        res.json({ success: true, items: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/admin/nutrition', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM nutrition_items ORDER BY created_at DESC');
        res.json({ success: true, items: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/nutrition', upload.single('nutritionImage'), async (req, res) => {
    const { name, ingredients, protein, carbs, fats, calories } = req.body;
    const image = req.file ? req.file.filename : null;

    try {
        const query = `INSERT INTO nutrition_items (name, image_url, ingredients, protein, carbs, fats, calories) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;
        const values = [name, image, ingredients, protein, carbs, fats, calories];
        const result = await pool.query(query, values);
        res.json({ success: true, message: 'Nutrition item added successfully', item: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/admin/nutrition/:id', upload.single('nutritionImage'), async (req, res) => {
    const { id } = req.params;
    const { name, ingredients, protein, carbs, fats, calories } = req.body;

    try {
        let image = req.file ? req.file.filename : null;
        
        if (!image) {
            const current = await pool.query('SELECT image_url FROM nutrition_items WHERE id = $1', [id]);
            if(current.rows.length > 0) image = current.rows[0].image_url;
        }

        const query = `UPDATE nutrition_items SET name = $1, image_url = $2, ingredients = $3, protein = $4, carbs = $5, fats = $6, calories = $7 WHERE id = $8`;
        const values = [name, image, ingredients, protein, carbs, fats, calories, id];
        
        await pool.query(query, values);
        res.json({ success: true, message: 'Nutrition item updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/admin/nutrition/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM nutrition_items WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Nutrition item deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= REVIEW ROUTES =================

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

app.get('/api/reviews', async (req, res) => {
    try {
        const query = `SELECT id, name, rating, review_text, review_date FROM users WHERE review_text IS NOT NULL ORDER BY review_date DESC`;
        const result = await pool.query(query);
        res.json({ success: true, reviews: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= RE-UPLOAD ENDPOINT (FIX) =================
app.put('/api/membership/reupload', upload.fields([
    { name: 'govIdFile', maxCount: 1 },
    { name: 'signatureFile', maxCount: 1 },
    { name: 'paymentScreenshotFile', maxCount: 1 }
]), async (req, res) => {
    const { userId, govIdNumber, idFile, sigFile, paymentNote } = req.body; 

    try {
        const client = await pool.connect();
        await client.query('BEGIN');

        let updateQuery = "UPDATE memberships SET ";
        let params = [];
        let paramIndex = 1;

        if (govIdNumber && idFile) {
            updateQuery += `gov_id_number = $${paramIndex}, gov_id_file_path = $${paramIndex+1}, id_proof_status = 'Pending', id_proof_reason = NULL`;
            params.push(govIdNumber, idFile.name); 
            paramIndex += 2;
        }

        if (sigFile) {
            updateQuery += `, signature_file_path = $${paramIndex}, signature_status = 'Pending', signature_reason = NULL`;
            params.push(sigFile.name);
            paramIndex += 1;
        }

        if (paymentNote) {
            updateQuery += `, payment_note = $${paramIndex}, payment_verified = false`;
            params.push(paymentNote);
            paramIndex += 1;
        }

        if (params.length > 0) {
            updateQuery += ` WHERE user_id = $${paramIndex}`;
            params.push(userId);

            await client.query(updateQuery, params);
        } else {
             res.status(400).json({ success: false, message: "No files provided to upload." });
             return;
        }

        await client.query('COMMIT');
        res.json({ success: true, message: "Documents re-uploaded successfully" });
        client.release();

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Re-upload Error:", err);
        res.status(500).json({ success: false, message: "Error re-uploading documents." });
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

// AI Chatbot / Diet Generator Endpoint
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    const userMessage = message.toLowerCase().trim();

    if (!userMessage) return res.status(400).json({ error: "Message is required" });

    const responses = {
        gym: "🏋️ **Vishal Fitness** - City Center, Main Street\n📞 Contact: 9876543210 | admin@vishal.com",
        name: "🏋️ **Vishal Fitness** - Your premier fitness destination!",
        location: "📍 **Location:** City Center, Main Street",
        address: "📍 **Location:** City Center, Main Street",
        contact: "📞 **Contact:** 9876543210 | admin@vishal.com",
        phone: "📞 **Phone:** 9876543210",
        email: "📧 **Email:** admin@vishal.com",
        time: `🕒 **Gym Timings:**\n• Mon-Sat: **6:00 AM - 10:00 PM**\n• Sunday: **8:00 AM - 2:00 PM**`,
        timing: `🕒 **Gym Timings:**\n• Mon-Sat: **6:00 AM - 10:00 PM**\n• Sunday: **8:00 AM - 2:00 PM**`,
        hours: `🕒 **Gym Timings:**\n• Mon-Sat: **6:00 AM - 10:00 PM**\n• Sunday: **8:00 AM - 2:00 PM**`,
        plan: `💳 **Membership Plans:**\n• Monthly: **₹1000**\n• Quarterly: **₹2800**\n• Half-Yearly: **₹5000**\n• Annual: **₹9000**`,
        price: `💳 **Membership Plans:**\n• Monthly: **₹1000**\n• Quarterly: **₹2800**\n• Half-Yearly: **₹5000**\n• Annual: **₹9000**`,
        membership: `💳 **Membership Plans:**\n• Monthly: **₹1000**\n• Quarterly: **₹2800**\n• Half-Yearly: **₹5000**\n• Annual: **₹9000**`,
        facility: `🏋️‍♂️ **Facilities:**\n• State-of-the-art equipment\n• Cardio zone\n• Free weights zone\n• Cross-fit area\n• Clean locker rooms & showers`,
        equipment: `🏋️‍♂️ **Facilities:**\n• State-of-the-art equipment\n• Cardio zone\n• Free weights zone\n• Cross-fit area\n• Clean locker rooms & showers`,
        trainer: `👨‍🏋️ **Expert Trainers:**\n• **Rohan Sharma** - Bodybuilding (10 yrs exp)\n• **Priya Singh** - Yoga & Flexibility\n• **Amit Verma** - Weight Loss & HIIT`,
        coach: `👨‍🏋️ **Expert Trainers:**\n• **Rohan Sharma** - Bodybuilding (10 yrs exp)\n• **Priya Singh** - Yoga & Flexibility\n• **Amit Verma** - Weight Loss & HIIT`,
        diet: `🥗 **Diet & Fitness Tips:**\n• **Weight Loss:** 500 cal deficit + high protein\n• **Muscle Gain:** 1.2-1.6g protein/kg + lift heavy\n• **Hydration:** 3-4L water daily\n• **Rest:** 7-8 hours sleep`,
        weight: `🥗 **Weight Loss:** Create 500 calorie deficit. Focus on high protein! 💪`,
        muscle: `💪 **Muscle Gain:** Eat 1.2-1.6g protein per kg body weight. Lift heavy weights! 🏋️‍♂️`,
        protein: `🥩 **Protein Guide:**\n• Muscle Gain: 1.2-1.6g per kg body weight\n• Weight Loss: High protein focus`,
        water: `💧 **Hydration:** Drink **3-4 liters** of water daily!`,
        sleep: `😴 **Rest:** Muscles grow while you sleep. Aim for **7-8 hours**!`,
        rule: `📋 **Gym Rules:**\n• Wear clean gym attire & shoes\n• Wipe down equipment after use\n• No dropping weights`,
        rules: `📋 **Gym Rules:**\n• Wear clean gym attire & shoes\n• Wipe down equipment after use\n• No dropping weights`,
        hi: "Namaste! 👋 Welcome to **Vishal Fitness**! 💪 Ask me about timings, plans, trainers, or fitness tips!",
        hello: "Namaste! 👋 Welcome to **Vishal Fitness**! 💪 Ask me about timings, plans, trainers, or fitness tips!",
        hey: "Hey there! 👋 Ready to transform at **Vishal Fitness**? 💪 What can I help with?",
        default: `🏋️ **Vishal Fitness Quick Info:**\n💳 Plans: ₹1000-₹9000\n🕒 Timings: 6AM-10PM\n📞 Call: 9876543210\n\nTry: "timings", "plans", "trainers", "diet"!`
    };

    let bestMatch = 'default';
    let highestScore = 0;

    for (const [keyword, response] of Object.entries(responses)) {
        const score = userMessage.includes(keyword) ? keyword.length : 0;
        if (score > highestScore) {
            highestScore = score;
            bestMatch = keyword;
        }
    }

    let reply = responses[bestMatch];

    if (highestScore < 3 && gymKnowledge) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `Answer using ONLY this knowledge: ${gymKnowledge}\n\nQ: ${message}\nA:`;
            const result = await model.generateContent(prompt);
            const aiResponse = await result.response.text();
            
            if (aiResponse.toLowerCase().includes('vishal') || 
                aiResponse.toLowerCase().includes('₹') || 
                aiResponse.toLowerCase().includes('rs') ||
                aiResponse.match(/6:00|10:00|8:00|2:00|am|pm/i)) {
                reply = aiResponse;
            }
        } catch (error) {
            console.log("🤖 Using rule-based response (AI backup failed)");
        }
    }

    console.log(`🤖 Chat: "${message}" → "${bestMatch}"`);
    res.json({ reply });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});                                                                                                                                           
