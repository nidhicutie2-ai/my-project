// Mock Database
let users = [
    { name: "Admin", email: "admin@vishal.com", pass: "admin123", role: "Admin" },
    { name: "Test User", email: "user@vishal.com", pass: "user123", role: "Member" }
];

let currentUser = null;

// --- Auth Modal & Tab Logic ---
function toggleAuthModal() {
    const modal = document.getElementById('auth-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => {
        modal.classList.toggle('active');
    }, 10);
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

// --- Login Logic (Unchanged) ---
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

// --- UPDATED Signup Logic ---
document.getElementById('signup-form').addEventListener('submit', function(e) {
    e.preventDefault();

    // Gather values based on NEW Form Fields
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const confirmPass = document.getElementById('reg-confirm-pass').value;
    const phone = document.getElementById('reg-phone').value;
    const role = document.getElementById('reg-role').value;
    const gender = document.getElementById('reg-gender').value;
    const dob = document.getElementById('reg-dob').value;
    const address = document.getElementById('reg-address').value;

    // 1. Email Unique Validation
    if (users.some(u => u.email === email)) {
        showToast("Email already exists.", "error");
        return;
    }

    // 2. Password Match
    if (pass !== confirmPass) {
        showToast("Passwords do not match.", "error");
        return;
    }

    // Create User Object (Updated to include new fields)
    const newUser = {
        name: name,
        email: email,
        pass: pass,
        role: role,
        phone: phone,
        gender: gender,
        dob: dob,
        address: address
    };

    users.push(newUser);
    showToast("Signup Successful! Please Login.", "success");
    
    // Reset form and switch to login
    this.reset();
    switchTab('login');
});

// --- Enquiry Form Logic (Unchanged) ---
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
function loginSuccess(user) {
    showToast(`Welcome, ${user.name}!`, "success");
    toggleAuthModal();
    document.querySelector('.hero-section').style.display = 'none';
    document.querySelector('.navbar').style.display = 'none';
    const dashboard = document.getElementById('user-dashboard');
    dashboard.classList.remove('hidden');
    document.getElementById('welcome-msg').innerText = `Welcome, ${user.name} (${user.role})`;
}

function logout() {
    currentUser = null;
    document.querySelector('.hero-section').style.display = 'flex';
    document.querySelector('.navbar').style.display = 'block';
    document.getElementById('user-dashboard').classList.add('hidden');
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