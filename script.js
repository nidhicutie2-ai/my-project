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

    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
        showToast("Phone number must be exactly 10 digits.", "error");
        return;
    }

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
    
    // Hide public sections
    document.querySelector('.hero-section').style.display = 'none';
    document.querySelector('.navbar').style.display = 'none'; 
    document.querySelector('.enquiry-section').style.display = 'none';

    // Route based on role
    if (user.role === 'Admin') {
        showAdminDashboard(user);
    } else if (user.has_completed_membership) {
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

// --- ADMIN DASHBOARD LOGIC ---

function showAdminDashboard(user) {
    const dashboard = document.getElementById('admin-dashboard');
    dashboard.classList.remove('hidden');
    document.getElementById('admin-name-display').innerText = user.name;
    
    // Load initial data
    loadAdminStats();
    loadAdminUsers();
    loadAdminEnquiries();
    loadAdminMemberships();
    loadAdminAdmins();
}

function switchAdminTab(tabName) {
    // Update buttons
    document.querySelectorAll('.admin-nav-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Hide all views
    document.querySelectorAll('.admin-view').forEach(view => view.classList.add('hidden'));

    // Show selected view
    document.getElementById(`admin-view-${tabName}`).classList.remove('hidden');
}

// Fetch Functions
async function loadAdminStats() {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/stats`);
        const data = await res.json();
        if(data.success) {
            document.getElementById('stat-users').innerText = data.stats.users;
            document.getElementById('stat-members').innerText = data.stats.members;
            document.getElementById('stat-enquiries').innerText = data.stats.enquiries;
        }
    } catch (e) { console.error(e); }
}

// Load Users
async function loadAdminUsers() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = ''; 

    try {
        const res = await fetch(`${API_BASE_URL}/admin/users`);
        const data = await res.json();
        
        if(!data.success || data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">No users found in database.</td></tr>';
            return;
        }

        data.users.forEach(u => {
            const suspendIcon = u.status === 'Active' ? '<i class="fas fa-ban"></i> Suspend' : '<i class="fas fa-check-circle"></i> Activate';
            const suspendTitle = u.status === 'Active' ? 'Suspend User' : 'Activate User';

            const tr = document.createElement('tr');
            tr.style.display = "table-row"; 
            
            tr.innerHTML = `
                <td style="color:white !important;">${u.name || 'N/A'}</td>
                <td style="color:white !important;">${u.email || 'N/A'}</td>
                <td style="color:white !important;">${u.phone || 'N/A'}</td>
                <td style="color:white !important;">${u.address || 'N/A'}</td>
                <td style="color:white !important;">${u.gender || 'N/A'}</td>
                <td style="color:white !important;">${u.dob ? u.dob.split('T')[0] : 'N/A'}</td>
                <td><span class="badge ${u.role === 'Admin' ? 'badge-admin' : ''}" style="background:#333; padding:4px 8px; border-radius:4px;">${u.role}</span></td>
                <td><span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-suspended'}" style="background:${u.status === 'Active' ? '#28a745' : '#ffc107'}; color:#000; padding:4px 8px; border-radius:4px;">${u.status}</span></td>
                <td>
                    <button class="action-btn btn-edit" onclick="openEditUser(${u.id})" title="Edit User">
                        <i class="fas fa-pencil-alt"></i> Edit
                    </button>
                    <button class="action-btn btn-suspend" onclick="toggleUserStatus(${u.id}, '${u.status}')" title="${suspendTitle}">
                        ${suspendIcon}
                    </button>
                    ${u.role !== 'Admin' ? `
                    <button class="action-btn btn-delete" onclick="deleteUser(${u.id})" title="Delete User">
                        <i class="fas fa-trash-alt"></i> Del
                    </button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { 
        console.error("Error loading users:", e);
        tbody.innerHTML = '<tr><td colspan="9" style="color:red; text-align:center;">Error loading users.</td></tr>';
    }
}

// Load Enquiries
async function loadAdminEnquiries() {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/enquiries`);
        const data = await res.json();
        const tbody = document.getElementById('enquiries-table-body');
        tbody.innerHTML = '';

        data.enquiries.forEach(eq => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${eq.name}</td>
                <td>${eq.phone}</td>
                <td>${eq.email}</td>
                <td>${eq.contact_method}</td>
                <td>${eq.goal}</td>
                <td>${eq.plan_preference}</td>
                <td>${eq.start_date || '-'}</td>
                <td>${eq.budget || '-'}</td>
                <td>${eq.preferred_time}</td>
                <td>${new Date(eq.created_at).toLocaleDateString()}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

// UPDATED: Load Memberships with Actions (Edit, Suspend, Delete)
async function loadAdminMemberships() {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/memberships`);
        const data = await res.json();
        const tbody = document.getElementById('memberships-table-body');
        tbody.innerHTML = '';

        data.memberships.forEach(m => {
            const tr = document.createElement('tr');
            // Determine Suspend Button based on User Status (since suspend affects login)
            const suspendIcon = m.status === 'Active' ? '<i class="fas fa-ban"></i>' : '<i class="fas fa-check-circle"></i>';
            const suspendTitle = m.status === 'Active' ? 'Suspend User (Block Login)' : 'Activate User';
            
            tr.innerHTML = `
                <td>
                    <strong>${m.name}</strong><br>
                    <small style="color:#aaa">${m.email}</small>
                </td>
                <td>${m.plan}</td>
                <td>${m.goal}</td>
                <td>${new Date(m.start_date).toLocaleDateString()}</td>
                <td>${new Date(m.end_date).toLocaleDateString()}</td>
                <td>${m.payment_mode}</td>
                <td>
                    ${m.emergency_name}<br>
                    <small>${m.emergency_phone}</small>
                </td>
                <td>
                    <div title="${m.medical_conditions}">
                        ${m.medical_conditions.length > 20 ? m.medical_conditions.substring(0,20) + '...' : m.medical_conditions}
                    </div>
                </td>
                <td>
                    ${m.gov_id_file_path ? `<a href="/uploads/${m.gov_id_file_path}" target="_blank" style="color:var(--primary)">ID</a>` : 'N/A'}<br>
                    ${m.signature_file_path ? `<a href="/uploads/${m.signature_file_path}" target="_blank" style="color:var(--primary)">Sig</a>` : 'N/A'}
                </td>
                <td>
                    <button class="action-btn btn-edit" onclick="openEditMembership(${m.id})" title="Edit Membership">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="action-btn btn-suspend" onclick="suspendMembership(${m.user_id}, '${m.status}')" title="${suspendTitle}">
                        ${suspendIcon}
                    </button>
                    <button class="action-btn btn-delete" onclick="deleteMembership(${m.id})" title="Delete Membership">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

async function loadAdminAdmins() {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/admins`);
        const data = await res.json();
        const tbody = document.getElementById('admins-table-body');
        tbody.innerHTML = '';

        data.admins.forEach(a => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${a.name}</td>
                <td>${a.email}</td>
                <td><span class="badge ${a.status === 'Active' ? 'badge-active' : 'badge-suspended'}">${a.status}</span></td>
                <td>${new Date(a.admin_since).toLocaleDateString()}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

// Admin Actions
async function toggleUserStatus(id, currentStatus) {
    const newStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    if(!confirm(`Are you sure you want to set this user to ${newStatus}?`)) return;

    try {
        const res = await fetch(`${API_BASE_URL}/admin/user/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if(data.success) {
            showToast(data.message, "success");
            loadAdminUsers();
            loadAdminMemberships(); // Refresh to update suspend icon in membership view
        }
    } catch(e) { showToast("Error updating status", "error"); }
}

async function deleteUser(id) {
    if(!confirm("Are you sure you want to permanently delete this user? This cannot be undone.")) return;

    try {
        const res = await fetch(`${API_BASE_URL}/admin/user/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if(data.success) {
            showToast(data.message, "success");
            loadAdminUsers();
        }
    } catch(e) { showToast("Error deleting user", "error"); }
}

// --- NEW MEMBERSHIP ACTIONS ---

// 1. Suspend Membership (Actually Suspend the User)
async function suspendMembership(userId, currentStatus) {
    const newStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    if(!confirm(`Are you sure you want to ${newStatus} this member? This will prevent login.`)) return;

    try {
        const res = await fetch(`${API_BASE_URL}/admin/user/${userId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if(data.success) {
            showToast(data.message, "success");
            loadAdminMemberships(); // Refresh table
        }
    } catch(e) { showToast("Error updating status", "error"); }
}

// 2. Delete Membership
async function deleteMembership(id) {
    if(!confirm("Are you sure you want to delete this membership record?")) return;

    try {
        const res = await fetch(`${API_BASE_URL}/admin/membership/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if(data.success) {
            showToast(data.message, "success");
            loadAdminMemberships();
        }
    } catch(e) { showToast("Error deleting membership", "error"); }
}

// 3. Edit Membership Modal Logic
function toggleEditMembershipModal() {
    const modal = document.getElementById('edit-membership-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => {
        modal.classList.toggle('active');
    }, 10);
}

async function openEditMembership(id) {
    try {
        // We need to fetch the specific membership data
        // Since our GET list returns data, we can find it there, or better fetch specific details
        const res = await fetch(`${API_BASE_URL}/admin/memberships`);
        const data = await res.json();
        const membership = data.memberships.find(m => m.id === id);

        if(membership) {
            document.getElementById('edit-mem-id').value = membership.id;
            document.getElementById('edit-mem-plan').value = membership.plan;
            document.getElementById('edit-mem-goal').value = membership.goal;
            document.getElementById('edit-mem-start-date').value = membership.start_date.split('T')[0];
            document.getElementById('edit-mem-end-date').value = membership.end_date.split('T')[0];
            document.getElementById('edit-mem-payment-mode').value = membership.payment_mode;
            
            toggleEditMembershipModal();
        }
    } catch(e) { 
        console.error(e);
        showToast("Error fetching membership details", "error"); 
    }
}

document.getElementById('edit-membership-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('edit-mem-id').value;
    const plan = document.getElementById('edit-mem-plan').value;
    const goal = document.getElementById('edit-mem-goal').value;
    const startDate = document.getElementById('edit-mem-start-date').value;
    const endDate = document.getElementById('edit-mem-end-date').value;
    const paymentMode = document.getElementById('edit-mem-payment-mode').value;

    try {
        const res = await fetch(`${API_BASE_URL}/admin/membership/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan, goal, startDate, endDate, paymentMode })
        });
        const data = await res.json();
        if(data.success) {
            showToast(data.message, "success");
            toggleEditMembershipModal();
            loadAdminMemberships();
        } else {
            showToast(data.message, "error");
        }
    } catch(e) { showToast("Error updating membership", "error"); }
});

// Edit User Modal Logic
function toggleEditUserModal() {
    const modal = document.getElementById('edit-user-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => {
        modal.classList.toggle('active');
    }, 10);
}

async function openEditUser(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/user/${id}`);
        const data = await res.json();

        if(data.success) {
            const user = data.user;
            document.getElementById('edit-user-id').value = user.id;
            document.getElementById('edit-name').value = user.name;
            document.getElementById('edit-phone').value = user.phone || '';
            document.getElementById('edit-address').value = user.address || '';
            document.getElementById('edit-gender').value = user.gender || 'Male';
            document.getElementById('edit-dob').value = user.dob ? user.dob.split('T')[0] : '';
            
            toggleEditUserModal();
        } else {
            showToast("Error fetching user details", "error");
        }
    } catch(e) { 
        console.error(e);
        showToast("Server error", "error"); 
    }
}

document.getElementById('edit-user-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('edit-user-id').value;
    const name = document.getElementById('edit-name').value;
    const phone = document.getElementById('edit-phone').value;
    const address = document.getElementById('edit-address').value;
    const gender = document.getElementById('edit-gender').value;
    const dob = document.getElementById('edit-dob').value;

    try {
        const res = await fetch(`${API_BASE_URL}/admin/user/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, address, gender, dob })
        });
        const data = await res.json();
        if(data.success) {
            showToast(data.message, "success");
            toggleEditUserModal();
            loadAdminUsers();
        } else {
            showToast(data.message, "error");
        }
    } catch(e) { showToast("Error updating user", "error"); }
});

// Create Admin Modal Logic
function toggleCreateAdminModal() {
    const modal = document.getElementById('create-admin-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => modal.classList.toggle('active'), 10);
}

document.getElementById('create-admin-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = document.getElementById('new-admin-name').value;
    const email = document.getElementById('new-admin-email').value;
    const pass = document.getElementById('new-admin-pass').value;

    try {
        const res = await fetch(`${API_BASE_URL}/admin/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, pass })
        });
        const data = await res.json();
        if(data.success) {
            showToast(data.message, "success");
            this.reset();
            toggleCreateAdminModal();
            loadAdminAdmins();
        } else {
            showToast(data.message, "error");
        }
    } catch(e) { showToast("Error creating admin", "error"); }
});


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

document.getElementById('membership-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const emerPhone = document.getElementById('mem-emer-phone').value;
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(emerPhone)) {
        showToast("Emergency phone must be exactly 10 digits.", "error");
        return;
    }

    const goalSelect = document.getElementById('mem-goal');
    const goalOtherInput = document.getElementById('mem-goal-other');
    const goal = goalSelect.value === 'Other' ? goalOtherInput.value : goalSelect.value;
    
    if (goalSelect.value === 'Other' && goal.trim() === "") {
        showToast("Please specify your fitness goal.", "error");
        return;
    }

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

    const medicalCond = document.querySelector('input[name="mem-med-cond"]:checked')?.value || 'No';
    const medDesc = document.getElementById('mem-med-desc').value;
    const medChecks = Array.from(document.querySelectorAll('input[name="med-check"]:checked'))
        .map(cb => cb.value)
        .join(', ');

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
    document.getElementById('admin-dashboard').classList.add('hidden');
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