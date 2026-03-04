// API Base URL
const API_BASE_URL = 'http://localhost:3000/api';

let currentUser = null;

// --- Auth Modal & Tab Logic ---
function toggleAuthModal() {
    const modal = document.getElementById('auth-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => {
        modal.classList.toggle('active');
    }, 10);
    
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

// --- Helper: Set Date Constraints ---
function setDateConstraints() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const regDob = document.getElementById('reg-dob');
    if(regDob) {
        regDob.max = todayStr;
        regDob.min = "1950-01-01";
    }
}

setDateConstraints();

// --- Login Logic ---
document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const role = document.getElementById('login-role').value;
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast("Invalid email format.", "error");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, pass, role })
        });

        const data = await response.json();

        if (!data.success) {
            showToast(data.message, "error");
            return;
        }

        currentUser = data.user;
        loginSuccess(currentUser);
    } catch (error) {
        console.error('Login error:', error);
        showToast("Server error. Please try again.", "error");
    }
});

// --- Signup Logic ---
document.getElementById('signup-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const confirmPass = document.getElementById('reg-confirm-pass').value;
    const phone = document.getElementById('reg-phone').value;
    const gender = document.getElementById('reg-gender').value;
    const dob = document.getElementById('reg-dob').value;
    const address = document.getElementById('reg-address').value;

    // Phone Validation
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
        showToast("Phone number must be exactly 10 digits.", "error");
        return;
    }

    // DOB Validation
    const selectedDob = new Date(dob);
    const today = new Date();
    today.setHours(0,0,0,0);
    selectedDob.setHours(0,0,0,0);

    if (selectedDob > today) {
        showToast("Date of Birth cannot be in the future.", "error");
        return;
    }

    if (pass !== confirmPass) {
        showToast("Passwords do not match.", "error");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, email, pass, phone, gender, dob, address })
        });

        const data = await response.json();

        if (!data.success) {
            showToast(data.message, "error");
            return;
        }

        showToast("Signup Successful! Please Login.", "success");
        this.reset();
        switchTab('login');
    } catch (error) {
        console.error('Signup error:', error);
        showToast("Server error. Please try again.", "error");
    }
});

// --- Login Success Logic ---
function loginSuccess(user) {
    showToast(`Welcome, ${user.name}!`, "success");
    toggleAuthModal();
    
    document.querySelector('.hero-section').style.display = 'none';
    document.querySelector('.navbar').style.display = 'none'; 
    document.querySelector('.enquiry-section').style.display = 'none';

    if (user.role === 'Admin' || user.has_completed_membership) {
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

    document.getElementById('mem-name').value = user.name || '';
    document.getElementById('mem-email').value = user.email || '';
    document.getElementById('mem-phone').value = user.phone || '';
    document.getElementById('mem-address').value = user.address || '';
    document.getElementById('mem-gender').value = user.gender || 'Male';
    if(user.dob) document.getElementById('mem-dob').value = user.dob.split('T')[0];

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('mem-sub-date').value = today;

    const startDateInput = document.getElementById('mem-start-date');
    startDateInput.min = "2026-01-01";
    
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 1);
    startDateInput.max = maxDate.toISOString().split('T')[0];

    if (today >= startDateInput.min && today <= startDateInput.max) {
        startDateInput.value = today;
    } else {
        startDateInput.value = startDateInput.min;
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

function calculateMembershipDates() {
    const planType = document.getElementById('mem-plan').value;
    const startDateInput = document.getElementById('mem-start-date').value;
    const amountInput = document.getElementById('mem-amount');
    const endDateInput = document.getElementById('mem-end-date');

    if (!startDateInput) return;

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
document.getElementById('membership-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    // Emergency Phone Validation
    const emerPhone = document.getElementById('mem-emer-phone').value;
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(emerPhone)) {
        showToast("Emergency phone must be exactly 10 digits.", "error");
        return;
    }

    // Goal Validation
    const goalSelect = document.getElementById('mem-goal');
    const goalOtherInput = document.getElementById('mem-goal-other');
    const goal = goalSelect.value === 'Other' ? goalOtherInput.value : goalSelect.value;
    
    if (goalSelect.value === 'Other' && goal.trim() === "") {
        showToast("Please specify your fitness goal.", "error");
        return;
    }

    // File Validations
    const idNameInput = document.getElementById('mem-govt-id-name');
    const idFileInput = document.getElementById('mem-govt-id-file');
    const sigFileInput = document.getElementById('mem-signature-file');

    if(idNameInput.value.trim() === "") {
        showToast("Please enter your ID Type.", "error");
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

    // Collect Medical Conditions
    const medicalCond = document.querySelector('input[name="mem-med-cond"]:checked')?.value || 'No';
    const medDesc = document.getElementById('mem-med-desc').value;
    const medChecks = Array.from(document.querySelectorAll('input[name="med-check"]:checked'))
        .map(cb => cb.value)
        .join(', ');

    // Prepare FormData for file upload
    const formData = new FormData();
    formData.append('userId', currentUser.id);
    formData.append('goal', goal);
    formData.append('plan', document.getElementById('mem-plan').value);
    formData.append('startDate', document.getElementById('mem-start-date').value);
    formData.append('endDate', document.getElementById('mem-end-date').value);
    formData.append('paymentMode', document.getElementById('mem-payment-mode').value);
    formData.append('emergencyName', document.getElementById('mem-emer-name').value);
    formData.append('emergencyRel', document.getElementById('mem-emer-rel').value);
    formData.append('emergencyPhone', emerPhone);
    formData.append('medicalCond', medicalCond);
    formData.append('medDesc', medDesc);
    formData.append('medChecks', medChecks);
    formData.append('govIdType', idNameInput.value);
    formData.append('govIdFile', idFileInput.files[0]);
    formData.append('signatureFile', sigFileInput.files[0]);

    try {
        const response = await fetch(`${API_BASE_URL}/membership/submit`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!data.success) {
            showToast(data.message, "error");
            return;
        }

        currentUser.has_completed_membership = true;
        showToast("Membership Registered Successfully!", "success");

        document.getElementById('membership-section').classList.add('hidden');
        showDashboard(currentUser);
    } catch (error) {
        console.error('Membership submission error:', error);
        showToast("Error submitting membership. Please try again.", "error");
    }
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

document.getElementById('enquiry-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const name = document.getElementById('enq-name').value.trim();
    const phone = document.getElementById('enq-phone').value.trim();
    const email = document.getElementById('enq-email').value.trim();
    const contactMethod = document.querySelector('input[name="enq-contact-method"]:checked')?.value;
    
    const goalRadios = document.getElementsByName('enq-goal');
    let goal = null;
    for(const radio of goalRadios) { 
        if(radio.checked) goal = radio.value; 
    }

    if (goal === 'Other') {
        const otherText = document.getElementById('enq-goal-other').value.trim();
        if (!otherText) {
            showToast("Please specify your fitness goal.", "error");
            document.getElementById('enq-goal-other').focus();
            return;
        }
        goal = otherText;
    }

    const plan = document.querySelector('input[name="enq-plan"]:checked')?.value;
    const startDate = document.getElementById('enq-start-date').value;
    const budget = document.getElementById('enq-budget').value;
    const time = document.querySelector('input[name="enq-time"]:checked')?.value;

    // Validation
    if (name.length < 2) { 
        showToast("Please enter a valid name.", "error"); 
        return; 
    }
    
    if (!phone.match(/^[0-9]{10}$/)) { 
        showToast("Please enter a valid 10-digit phone number.", "error"); 
        return; 
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { 
        showToast("Invalid email format.", "error"); 
        return; 
    }

    if (!plan) {
        showToast("Please select a preferred plan.", "error");
        return;
    }

    if (!startDate) {
        showToast("Please select a preferred start date.", "error");
        return;
    }

    if (!time) {
        showToast("Please select a preferred workout time.", "error");
        return;
    }

    const btn = this.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = "Sending...";
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/enquiry`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                name, phone, email, contactMethod, 
                goal, plan, startDate, budget, time 
            })
        });

        const data = await response.json();

        if (!data.success) {
            showToast(data.message, "error");
            return;
        }

        showToast("Enquiry Sent Successfully!", "success");
        this.reset();
        document.getElementById('enq-goal-other').classList.add('hidden');
    } catch (error) {
        console.error('Enquiry error:', error);
        showToast("Error sending enquiry. Please try again.", "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
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