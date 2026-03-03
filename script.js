// Mock Database
let users = [
    { name: "Admin", email: "admin@vishal.com", pass: "admin123", role: "Admin", hasCompletedMembership: true },
    { name: "Test User", email: "user@vishal.com", pass: "user123", role: "Member", hasCompletedMembership: false }
];

let currentUser = null;

// --- Auth Modal & Tab Logic ---
function toggleAuthModal() {
    const modal = document.getElementById('auth-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => {
        modal.classList.toggle('active');
    }, 10);
    
    // If opening the modal, set Date constraints
    if (!modal.classList.contains('hidden')) {
        setDateConstraints();
    }
}

function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab');
    const loginForm = document.getElementById('login-form-container');
    const signupForm = document.getElementById('signup-form-container');

    tabs.forEach(t => t.classList.remove('active'));

    if (tabName === 'login') {
        tabs[0].classList.add('active');
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
    } else {
        tabs[1].classList.add('active');
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
    }
}

// --- Helper: Set Date Constraints on Page Load / Modal Open ---
function setDateConstraints() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 1. Signup DOB: Max = Today, Min = 1950-01-01
    const regDob = document.getElementById('reg-dob');
    if(regDob) {
        regDob.max = todayStr;
        regDob.min = "1950-01-01";
    }
}

// Call once on load
setDateConstraints();

// --- Login Logic ---
document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const role = document.getElementById('login-role').value;
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast("Invalid email format.", "error");
        return;
    }

    const user = users.find(u => u.email === email && u.pass === pass);

    if (!user) {
        showToast("Invalid credentials.", "error");
        return;
    }
    
    if (user.role === 'Admin' && role !== 'Admin') {
        showToast("Admins cannot login as Users.", "error");
        return;
    }
    
    if (user.role === 'Member' && role === 'Admin') {
        showToast("Members cannot access Admin portal.", "error");
        return;
    }

    currentUser = user;
    loginSuccess(user);
});

// --- Signup Logic ---
document.getElementById('signup-form').addEventListener('submit', function(e) {
    e.preventDefault();

    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const confirmPass = document.getElementById('reg-confirm-pass').value;
    const phone = document.getElementById('reg-phone').value;
    const role = document.getElementById('reg-role').value;
    const gender = document.getElementById('reg-gender').value;
    const dob = document.getElementById('reg-dob').value;
    const address = document.getElementById('reg-address').value;

    // --- NEW: Phone Validation ---
    // Must be numeric and exactly 10 digits
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
        showToast("Phone number must be exactly 10 digits.", "error");
        return;
    }

    // --- NEW: DOB Validation ---
    const selectedDob = new Date(dob);
    const today = new Date();
    today.setHours(0,0,0,0); // Reset time part for accurate comparison
    selectedDob.setHours(0,0,0,0);

    if (selectedDob > today) {
        showToast("Date of Birth cannot be in the future.", "error");
        return;
    }

    if (users.some(u => u.email === email)) {
        showToast("Email already exists.", "error");
        return;
    }

    if (pass !== confirmPass) {
        showToast("Passwords do not match.", "error");
        return;
    }

    const newUser = {
        name: name,
        email: email,
        pass: pass,
        role: role,
        phone: phone,
        gender: gender,
        dob: dob,
        address: address,
        hasCompletedMembership: false 
    };

    users.push(newUser);
    showToast("Signup Successful! Please Login.", "success");
    this.reset();
    switchTab('login');
});

// --- Login Success Logic ---
function loginSuccess(user) {
    showToast(`Welcome, ${user.name}!`, "success");
    toggleAuthModal();
    
    document.querySelector('.hero-section').style.display = 'none';
    document.querySelector('.navbar').style.display = 'none'; 
    document.querySelector('.enquiry-section').style.display = 'none';

    if (user.role === 'Admin' || user.hasCompletedMembership) {
        showDashboard(user);
    } else {
        showMembershipForm(user);
    }
}

function showDashboard(user) {
    const dashboard = document.getElementById('user-dashboard');
    dashboard.classList.remove('hidden');
    document.getElementById('welcome-msg').innerText = `Welcome, ${user.name} (${user.role})`;
}

// --- Membership Form Logic ---

function showMembershipForm(user) {
    const memSection = document.getElementById('membership-section');
    memSection.classList.remove('hidden');

    // Auto-fill fields
    document.getElementById('mem-name').value = user.name || '';
    document.getElementById('mem-email').value = user.email || '';
    document.getElementById('mem-phone').value = user.phone || '';
    document.getElementById('mem-address').value = user.address || '';
    document.getElementById('mem-gender').value = user.gender || 'Male';
    if(user.dob) document.getElementById('mem-dob').value = user.dob;

    // Set Submission Date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('mem-sub-date').value = today;

    // --- NEW: Set Membership Start Date Constraints ---
    const startDateInput = document.getElementById('mem-start-date');
    
    // Min: Jan 1, 2026
    startDateInput.min = "2026-01-01";
    
    // Max: Today + 1 Month
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 1);
    startDateInput.max = maxDate.toISOString().split('T')[0];

    // Set default value to Today if valid
    if (today >= startDateInput.min && today <= startDateInput.max) {
        startDateInput.value = today;
    } else {
        startDateInput.value = startDateInput.min; // Fallback
    }
    
    calculateMembershipDates();
}

// Toggle Medical Description
function toggleMedCond(show) {
    const descGroup = document.getElementById('med-desc-group');
    if (show) {
        descGroup.classList.remove('hidden');
        document.getElementById('mem-med-desc').setAttribute('required', 'true');
    } else {
        descGroup.classList.add('hidden');
        document.getElementById('mem-med-desc').removeAttribute('required');
    }
}

// --- NEW: Toggle Membership Goal "Other" ---
function toggleMemGoalOther(select) {
    const otherInput = document.getElementById('mem-goal-other');
    if (select.value === 'Other') {
        otherInput.classList.remove('hidden');
        otherInput.setAttribute('required', 'true');
        otherInput.focus();
    } else {
        otherInput.classList.add('hidden');
        otherInput.removeAttribute('required');
        otherInput.value = '';
    }
}

// Calculate End Date and Total Amount
function calculateMembershipDates() {
    const planType = document.getElementById('mem-plan').value;
    const startDateInput = document.getElementById('mem-start-date').value;
    const amountInput = document.getElementById('mem-amount');
    const endDateInput = document.getElementById('mem-end-date');

    // --- NEW: Start Date Validation Logic ---
    if (startDateInput) {
        const selectedDate = new Date(startDateInput);
        const minDate = new Date(document.getElementById('mem-start-date').min);
        const maxDate = new Date(document.getElementById('mem-start-date').max);

        if (selectedDate < minDate || selectedDate > maxDate) {
            showToast("Start Date must be between Jan 2026 and Today + 1 Month.", "error");
            endDateInput.value = ""; // Clear end date
            return;
        }
    } else {
        return;
    }

    let monthsToAdd = 0;
    let amount = 0;

    switch(planType) {
        case 'Monthly': monthsToAdd = 1; amount = 1000; break;
        case 'Quarterly': monthsToAdd = 3; amount = 2800; break;
        case 'Half-Yearly': monthsToAdd = 6; amount = 5000; break;
        case 'Annual': monthsToAdd = 12; amount = 9000; break;
    }

    amountInput.value = `₹${amount}`;

    const startDate = new Date(startDateInput);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + monthsToAdd);
    endDateInput.value = endDate.toISOString().split('T')[0];
}

// Membership Form Submission
document.getElementById('membership-form').addEventListener('submit', function(e) {
    e.preventDefault();

    // --- NEW: Emergency Phone Validation ---
    const emerPhone = document.getElementById('mem-emer-phone').value;
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(emerPhone)) {
        showToast("Emergency phone must be exactly 10 digits.", "error");
        return;
    }

    // --- NEW: Goal "Other" Validation ---
    const goalSelect = document.getElementById('mem-goal');
    const goalOtherInput = document.getElementById('mem-goal-other');
    if (goalSelect.value === 'Other' && goalOtherInput.value.trim() === "") {
        showToast("Please specify your fitness goal.", "error");
        return;
    }

    // File Validations
    const idNameInput = document.getElementById('mem-govt-id-name');
    const idFileInput = document.getElementById('mem-govt-id-file');
    const sigFileInput = document.getElementById('mem-signature-file');

    if(idNameInput.value.trim() === "") {
        showToast("Please enter your ID Type (e.g., Aadhar).", "error");
        return;
    }

    if (idFileInput.files.length === 0) {
        showToast("Please upload your Government ID proof.", "error");
        return;
    }

    if (sigFileInput.files.length === 0) {
        showToast("Please upload your Digital Signature.", "error");
        return;
    }

    // Collect Membership Data
    const membershipData = {
        goal: goalSelect.value === 'Other' ? goalOtherInput.value : goalSelect.value,
        plan: document.getElementById('mem-plan').value,
        startDate: document.getElementById('mem-start-date').value,
        endDate: document.getElementById('mem-end-date').value,
        paymentMode: document.getElementById('mem-payment-mode').value,
        emergencyName: document.getElementById('mem-emer-name').value,
        govIdType: idNameInput.value,
        govIdFile: "File Uploaded: " + idFileInput.files[0].name,
        signatureFile: "File Uploaded: " + sigFileInput.files[0].name
    };

    // Update Current User Object
    currentUser.hasCompletedMembership = true;
    currentUser.membership = membershipData;

    // Update Database (Mock)
    const dbIndex = users.findIndex(u => u.email === currentUser.email);
    if(dbIndex !== -1) {
        users[dbIndex] = currentUser;
    }

    showToast("Membership Registered Successfully!", "success");

    // Hide Membership Form and Show Dashboard
    document.getElementById('membership-section').classList.add('hidden');
    showDashboard(currentUser);
});


// --- Enquiry Form Logic ---
function toggleEnqOther(radio) {
    const otherInput = document.getElementById('enq-goal-other');
    if (radio.value === 'Other' && radio.checked) {
        otherInput.classList.remove('hidden');
        otherInput.focus();
    } else {
        otherInput.classList.add('hidden');
        otherInput.value = '';
    }
}

document.getElementById('enquiry-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('enq-name').value.trim();
    const phone = document.getElementById('enq-phone').value.trim();
    const email = document.getElementById('enq-email').value.trim();
    const goalRadios = document.getElementsByName('enq-goal');
    let goal = null;
    for(const radio of goalRadios) { if(radio.checked) goal = radio.value; }

    if (goal === 'Other') {
        const otherText = document.getElementById('enq-goal-other').value.trim();
        if (!otherText) {
            showToast("Please specify your fitness goal.", "error");
            document.getElementById('enq-goal-other').focus();
            return;
        }
        goal = otherText;
    }

    if (name.length < 2) { showToast("Please enter a valid name.", "error"); return; }
    if (phone.length < 10) { showToast("Please enter a valid phone number.", "error"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { showToast("Invalid email format.", "error"); return; }

    const btn = this.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = "Sending...";
    btn.disabled = true;

    setTimeout(() => {
        showToast("Enquiry Sent Successfully!", "success");
        this.reset();
        document.getElementById('enq-goal-other').classList.add('hidden');
        btn.innerText = originalText;
        btn.disabled = false;
    }, 1500);
});

// --- Helper Functions ---
function logout() {
    currentUser = null;
    document.querySelector('.hero-section').style.display = 'flex';
    document.querySelector('.navbar').style.display = 'block';
    document.querySelector('.enquiry-section').style.display = 'flex';
    document.getElementById('user-dashboard').classList.add('hidden');
    document.getElementById('membership-section').classList.add('hidden');
    showToast("Logged out successfully.", "success");
}

function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

function toggleMobileMenu() {
    showToast("Mobile menu placeholder", "success");
}