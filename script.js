// API Base URL
const API_BASE_URL = 'http://localhost:3000/api';

let currentUser = null;
let currentMembership = null;
let tempRejectionData = { id: null, type: null };
let isEditMode = false; 
let resetEmailTemp = ""; // To store email during password reset

// --- HELPER: Name Validation (Alphabets Only) ---
function validateName(name) {
    const nameRegex = /^[A-Za-z\s]+$/;
    if (!nameRegex.test(name)) {
        showToast("Name must contain only alphabets (no numbers or special characters).", "error");
        return false;
    }
    return true;
}

// --- HELPER: Date Formatter DD/MM/YYYY ---
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// --- Password Toggle ---
function togglePassword(inputId, icon) {
    const input = document.getElementById(inputId);
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
    }
}

// --- Auth Modal & Tab Logic ---
function toggleAuthModal() {
    const modal = document.getElementById('auth-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => {
        modal.classList.toggle('active');
    }, 10);

    if (!modal.classList.contains('hidden')) {
        switchAuthView('login'); // Default to login on open
        setDateConstraints();
    }
}

// Updated to handle Login, Signup, and Forgot Password
function switchAuthView(viewName) {
    const tabs = document.querySelectorAll('.tab');
    const loginForm = document.getElementById('login-form-container');
    const signupForm = document.getElementById('signup-form-container');
    const forgotForm = document.getElementById('forgot-password-container');
    
    // Reset tabs visual state
    tabs.forEach(t => t.classList.remove('active'));

    if (viewName === 'login') {
        document.getElementById('tab-login').classList.add('active');
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        forgotForm.classList.add('hidden');
    } else if (viewName === 'signup') {
        document.getElementById('tab-signup').classList.add('active');
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        forgotForm.classList.add('hidden');
    } else if (viewName === 'forgot') {
        // No active tab for forgot password
        loginForm.classList.add('hidden');
        signupForm.classList.add('hidden');
        forgotForm.classList.remove('hidden');
        
        // Reset forgot password form steps
        document.getElementById('forgot-step-1').classList.remove('hidden');
        document.getElementById('forgot-step-2').classList.add('hidden');
        document.getElementById('forgot-email').value = '';
        document.getElementById('forgot-otp').value = '';
        document.getElementById('new-pass').value = '';
        document.getElementById('confirm-new-pass').value = '';
    }
}

// --- Helper: Set Date Constraints ---
function setDateConstraints() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const enqDateInput = document.getElementById('enq-start-date');
    if (enqDateInput) {
        const currentYear = today.getFullYear();
        enqDateInput.min = `${currentYear}-01-01`;
        enqDateInput.max = `${currentYear + 5}-12-31`;
    }

    const memDateInput = document.getElementById('mem-start-date');
    if (memDateInput) {
        // REQUIREMENT: Start Date restricted to CURRENT YEAR ONLY.
        const currentYear = today.getFullYear();
        memDateInput.min = `${currentYear}-01-01`;
        memDateInput.max = `${currentYear}-12-31`;
        
        // If today falls within the current year (it always does), set default to today.
        if(todayStr >= memDateInput.min && todayStr <= memDateInput.max) {
            memDateInput.value = todayStr;
        } else {
            memDateInput.value = memDateInput.min; // Default to Jan 1st of current year if edge case
        }
    }
}

setDateConstraints();

// --- CONTENT VALIDATION (OCR DISABLED) ---
async function performSmartValidation(file, expectedType) {
    if (file.type !== 'application/pdf' && !file.type && !file.type.startsWith('image/')) {
        throw new Error("Invalid file format. Please upload a PDF or Image.");
    }
    if (file.type === 'application/pdf') return true;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = async function() {
                const width = img.width;
                const height = img.height;
                try {
                    if (expectedType === 'ID') {
                        if (width < 200 || height < 200) {
                            reject("Image is too blurry or too small. Please upload a clear photo.");
                        } else {
                            resolve(true);
                        }
                    } else if (expectedType === 'Signature') {
                        resolve(true);
                    }
                } catch (err) {
                    reject("An unexpected error occurred while validating the file.");
                }
            };
            img.onerror = () => reject("Invalid image file.");
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// --- VALIDATION LOGIC ---

// 1. Signup Form
document.getElementById('signup-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('reg-email').value.trim();
    const dob = document.getElementById('reg-dob').value;
    const pass = document.getElementById('reg-pass').value;
    const confirmPass = document.getElementById('reg-confirm-pass').value;
    const phone = document.getElementById('reg-phone').value;
    const gender = document.getElementById('reg-gender').value;
    const address = document.getElementById('reg-address').value;
    const name = document.getElementById('reg-name').value.trim();

    // Name Validation
    if (!validateName(name)) return;

    // Email Validation: ONLY GMAIL ALLOWED
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!emailRegex.test(email)) {
        showToast("Invalid email. Only Gmail addresses are allowed (e.g., user@gmail.com).", "error");
        return;
    }

    if (!dob) {
        showToast("Date of Birth is required.", "error");
        return;
    }
    const year = parseInt(dob.split('-')[0]);
    if (year < 1996 || year > 2009) {
        showToast("Date of Birth year must be between 1996 and 2009.", "error");
        return;
    }

    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
        showToast("Phone number must be exactly 10 digits.", "error");
        return;
    }

    if (pass !== confirmPass) {
        showToast("Passwords do not match.", "error");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, pass, phone, gender, dob, address })
        });

        const data = await response.json();

        if (!data.success) {
            showToast(data.message, "error");
            return;
        }

        showToast("Signup Successful! Please Login.", "success");
        this.reset();
        switchAuthView('login');
    } catch (error) {
        console.error('Signup error:', error);
        showToast("Server error. Please try again.", "error");
    }
});

// 2. Membership Form
function validateIdType(select) {
    const input = document.getElementById('mem-govt-id-number');
    const hint = document.getElementById('id-hint');
    
    if (select.value === 'Aadhar') {
        hint.innerText = "Format: 12 digits only (e.g., 123456789012)";
        input.placeholder = "Enter 12-digit Aadhar Number";
        input.value = "";
    } else if (select.value === 'PAN') {
        hint.innerText = "Format: 5 letters + 4 digits + 1 letter (e.g., ABCDE1234F)";
        input.placeholder = "Enter PAN Number";
        input.value = "";
    } else {
        hint.innerText = "Select ID type to see format.";
        input.value = "";
    }
}

// NEW: Toggle Relationship "Other" input
function toggleRelOther(select) {
    const otherInput = document.getElementById('mem-emer-rel-other');
    const relError = document.getElementById('rel-error');
    if (select.value === 'Other') {
        otherInput.classList.remove('hidden');
        otherInput.setAttribute('required', 'true');
        otherInput.focus();
    } else {
        otherInput.classList.add('hidden');
        otherInput.removeAttribute('required');
        otherInput.value = '';
        if(relError) relError.style.display = 'none';
    }
}

// NEW: Toggle Payment Note Input
function togglePaymentNote(select) {
    const noteGroup = document.getElementById('payment-note-group');
    if (select.value === 'Other') {
        noteGroup.classList.remove('hidden');
        document.getElementById('payment-note').setAttribute('required', 'true');
    } else {
        noteGroup.classList.add('hidden');
        document.getElementById('payment-note').removeAttribute('required');
    }
}

document.getElementById('membership-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Validations
    const name = document.getElementById('mem-name').value.trim();
    if (!validateName(name)) return;

    // Emergency Name Validation (Alphabets Only)
    const emerName = document.getElementById('mem-emer-name').value.trim();
    if (!validateName(emerName)) return;

    // Emergency Relationship Validation
    const relSelect = document.getElementById('mem-emer-rel');
    const relOther = document.getElementById('mem-emer-rel-other').value.trim();
    let finalRel = relSelect.value;

    if (finalRel === 'Other') {
        if (!validateName(relOther)) return;
        finalRel = relOther;
    } else {
        if (!finalRel) {
            showToast("Please select a relationship.", "error");
            return;
        }
    }

    const idType = document.getElementById('mem-govt-id-name').value;
    const idNumber = document.getElementById('mem-govt-id-number').value.trim();
    
    if (idType === 'Aadhar') {
        const aadharRegex = /^\d{12}$/;
        if (!aadharRegex.test(idNumber)) {
            showToast("Aadhar must be exactly 12 digits.", "error");
            return;
        }
    } else if (idType === 'PAN') {
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(idNumber.toUpperCase())) {
            showToast("Invalid PAN format. Example: ABCDE1234F", "error");
            return;
        }
    }

    const startDateInput = document.getElementById('mem-start-date').value;
    const todayStr = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();
    const startYear = parseInt(startDateInput.split('-')[0]);
    
    // REQUIREMENT: Start Date must be Current Year only.
    if(startYear !== currentYear) {
        showToast(`Joining Date must be in the current year (${currentYear}).`, "error");
        return;
    }

    // Also ensure it's not in the past (though HTML constraint helps, server check is good)
    if(startDateInput < todayStr) {
        showToast("Joining Date cannot be in the past.", "error");
        return;
    }

    const idFileInput = document.getElementById('mem-govt-id-file');
    if (idFileInput.files.length > 0) {
        try {
            await performSmartValidation(idFileInput.files[0], 'ID');
        } catch (err) {
            showToast(err, "error");
            return;
        }
    } else if (!isEditMode) { 
        showToast("Please upload ID Proof.", "error");
        return;
    }

    const sigFileInput = document.getElementById('mem-signature-file');
    if (sigFileInput.files.length > 0) {
        try {
            await performSmartValidation(sigFileInput.files[0], 'Signature');
        } catch (err) {
            console.error(err);
        }
    } else if (!isEditMode) {
        showToast("Please upload Digital Signature.", "error");
        return;
    }
    
    // NEW: Payment Validation
    const payFileInput = document.getElementById('payment-screenshot-file');
    const payStatus = document.getElementById('payment-status-select').value;
    const payNote = document.getElementById('payment-note').value.trim();

    if (!payStatus) {
        showToast("Please select payment status.", "error");
        return;
    }

    if (payStatus === 'Other' && !payNote) {
        showToast("Please describe the payment issue.", "error");
        return;
    }
    
    if (payFileInput.files.length > 0) {
        // Basic validation for image
        if (!payFileInput.files[0].type.startsWith('image/')) {
            showToast("Payment screenshot must be an image.", "error");
            return;
        }
    } else if (!isEditMode) {
        showToast("Please upload payment screenshot.", "error");
        return;
    }

    const emerPhone = document.getElementById('mem-emer-phone').value;
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(emerPhone)) {
        showToast("Emergency phone must be exactly 10 digits.", "error");
        return;
    }
    
    const userPhone = document.getElementById('mem-phone').value;
    if (!phoneRegex.test(userPhone)) {
        showToast("Phone number must be exactly 10 digits.", "error");
        return;
    }

    const goalSelect = document.getElementById('mem-goal');
    const goalOtherInput = document.getElementById('mem-goal-other');
    const goal = goalSelect.value === 'Other' ? goalOtherInput.value : goalSelect.value;
    
    if (goalSelect.value === 'Other' && goal.trim() === "") {
        showToast("Please specify your fitness goal.", "error");
        return;
    }

    const formData = new FormData();
    formData.append('userId', currentUser.id);
    formData.append('goal', goal);
    formData.append('plan', document.getElementById('mem-plan').value);
    formData.append('startDate', startDateInput);
    formData.append('endDate', document.getElementById('mem-end-date').value);
    formData.append('paymentMode', 'UPI'); // Hardcoded for now as per requirements
    formData.append('emergencyName', emerName);
    formData.append('emergencyRel', finalRel);
    formData.append('emergencyPhone', emerPhone);
    formData.append('medicalCond', document.querySelector('input[name="mem-med-cond"]:checked')?.value || 'No');
    formData.append('medDesc', document.getElementById('mem-med-desc').value);
    formData.append('medChecks', Array.from(document.querySelectorAll('input[name="med-check"]:checked')).map(cb => cb.value).join(', '));
    formData.append('govIdType', idType);
    formData.append('govIdNumber', idNumber);
    
    if (idFileInput.files.length > 0) formData.append('govIdFile', idFileInput.files[0]);
    if (sigFileInput.files.length > 0) formData.append('signatureFile', sigFileInput.files[0]);
    
    // NEW: Append Payment Data
    if (payFileInput.files.length > 0) formData.append('paymentScreenshotFile', payFileInput.files[0]);
    formData.append('paymentStatus', payStatus);
    if (payNote) formData.append('paymentNote', payNote);

    formData.append('name', name);
    formData.append('phone', userPhone);
    formData.append('address', document.getElementById('mem-address').value);
    formData.append('gender', document.getElementById('mem-gender').value);
    formData.append('dob', document.getElementById('mem-dob').value);

    try {
        let url = `${API_BASE_URL}/membership/submit`;
        let method = 'POST';

        if (isEditMode && currentMembership) {
            url = `${API_BASE_URL}/user/update-profile`; 
            method = 'PUT';
        }

        const response = await fetch(url, {
            method: method,
            body: formData
        });

        const data = await response.json();

        if (!data.success) {
            showToast(data.message, "error");
            return;
        }

        showToast(isEditMode ? "Profile Updated Successfully!" : "Membership Registered Successfully!", "success");
        
        currentUser.has_completed_membership = true;
        if(!isEditMode) {
            const memRes = await fetch(`${API_BASE_URL}/admin/memberships`);
        } else {
            Object.assign(currentMembership, data.membership); 
        }

        document.getElementById('membership-section').classList.add('hidden');
        showDashboard(currentUser);
    } catch (error) {
        console.error('Membership submission error:', error);
        showToast("Error submitting membership. Please try again.", "error");
    }
});

// --- PAYMENT DETAILS TOGGLE LOGIC ---
function togglePaymentDetails() {
    // No longer needed as UPI is the only option and always shown
    // Kept for compatibility if needed later
    const paymentMode = document.getElementById('mem-payment-mode').value; // Hidden field or defaulted
    // Logic handled by calculateMembershipDates now
}

// --- TRAINER LOGIC ---

// Load Trainers for Public Page only (Removed from Membership Page)
async function loadPublicTrainers() {
    const grid = document.getElementById('public-trainers-grid');
    if(!grid) return;
    grid.innerHTML = '';
    try {
        const res = await fetch(`${API_BASE_URL}/trainers`);
        const data = await res.json();
        if(data.success && data.trainers.length > 0) {
            data.trainers.forEach(t => {
                const photoSrc = t.photo ? `/uploads/${t.photo}` : 'https://picsum.photos/seed/gym/200/200';
                // Added Instagram and Availability display
                const instaDisplay = t.instagram ? `<p class="trainer-insta"><i class="fab fa-instagram"></i> ${t.instagram}</p>` : '';
                const availDisplay = t.availability ? `<p class="trainer-schedule"><i class="far fa-clock"></i> ${t.availability}</p>` : '';
                
                const card = document.createElement('div');
                card.className = 'trainer-card';
                card.setAttribute('data-id', t.id);
                card.innerHTML = `
                    <div class="trainer-img-wrapper">
                        <img src="${photoSrc}" alt="${t.name}">
                    </div>
                    <div class="trainer-info">
                        <h3 class="trainer-name">${t.name}</h3>
                        <p class="trainer-exp"><i class="fas fa-dumbbell"></i> ${t.experience} Experience</p>
                        <p class="trainer-bio">${t.bio}</p>
                        ${instaDisplay}
                        ${availDisplay}
                    </div>
                `;
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = '<p style="color:#aaa;">No trainers available.</p>';
        }
    } catch (e) { console.error(e); }
}

// --- REVIEW SYSTEM ---
function toggleReviewModal() {
    if (!currentUser) {
        showToast("Please Login to write a review.", "error");
        toggleAuthModal();
        return;
    }
    const modal = document.getElementById('review-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => modal.classList.toggle('active'), 10);
    document.getElementById('review-username').value = currentUser.name;
    setReviewRating(0);
}

function setReviewRating(rating) {
    document.getElementById('review-rating-value').value = rating;
    const stars = document.querySelectorAll('#review-stars-input i');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.remove('far');
            star.classList.add('fas');
            star.style.color = '#FFD700';
        } else {
            star.classList.remove('fas');
            star.classList.add('far');
            star.style.color = '#ccc';
        }
    });
}

document.getElementById('review-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const rating = document.getElementById('review-rating-value').value;
    if (rating === "0") {
        showToast("Please select a star rating.", "error");
        return;
    }

    const reviewData = {
        userId: currentUser.id,
        rating: rating,
        reviewText: document.getElementById('review-text').value,
        reviewDate: new Date().toISOString().split('T')[0]
    };

    try {
        const res = await fetch(`${API_BASE_URL}/review/submit`, {
            method: 'post',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify(reviewData)
        });
        const data = await res.json();
        if(data.success) {
            showToast("Review Submitted Successfully!", "success");
            toggleReviewModal();
            loadPublicReviews();
        } else {
            showToast(data.message, "error");
        }
    } catch(err) {
        showToast("Error submitting review", "error");
    }
});

async function loadPublicReviews() {
    const grid = document.getElementById('public-reviews-grid');
    if(!grid) return;
    grid.innerHTML = '';
    try {
        const res = await fetch(`${API_BASE_URL}/reviews`);
        const data = await res.json();
        if(data.success && data.reviews.length > 0) {
            data.reviews.forEach(r => {
                let starsHtml = '';
                for(let i=0; i<5; i++) {
                    starsHtml += `<i class="fas fa-star" style="color:${i < r.rating ? '#FFD700' : '#ccc'}; font-size: 0.8rem;"></i>`;
                }
                const card = document.createElement('div');
                card.className = 'review-card';
                card.innerHTML = `
                    <div class="review-header">
                        <strong>${r.name}</strong>
                        <div class="review-stars">${starsHtml}</div>
                    </div>
                    <p class="review-text">"${r.review_text}"</p>
                    <small class="review-date">${formatDate(r.review_date)}</small>
                `;
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = '<p style="color:#aaa; text-align:center; grid-column:1/-1;">No reviews yet. Be the first!</p>';
        }
    } catch(e) { console.error(e); }
}

// --- AUTH & DASHBOARD LOGIC ---

// --- IMPROVED LOGIN LOGIC (As Requested) ---
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
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, pass, role })
        });

        const data = await response.json();

        if (!data.success) {
            // Detailed error logging for debugging
            console.error("Login Failed:", data.message);
            showToast(data.message, "error");
            return;
        }

        currentUser = data.user;
        currentMembership = data.membership;
        loginSuccess(currentUser);
    } catch (error) {
        console.error('Login error:', error);
        showToast("Server error. Please try again.", "error");
    }
});

function loginSuccess(user) {
    showToast(`Welcome, ${user.name}!`, "success");
    toggleAuthModal();
    
    document.querySelector('.hero-section').style.display = 'none';
    document.querySelector('.navbar').style.display = 'none'; 
    document.querySelector('.enquiry-section').style.display = 'none';
    
    if (user.role === 'Admin') {
        document.querySelector('.trainers-section').style.display = 'none';
        document.querySelector('.reviews-section').style.display = 'none';
        showAdminDashboard(user);
    } else {
        // User logged in. Hide trainers initially as they will see the Dashboard.
        document.querySelector('.trainers-section').style.display = 'none'; 
        document.querySelector('.reviews-section').style.display = 'none';

        if (currentMembership) {
            let hasRejection = false;
            if(currentMembership.id_proof_status === 'Rejected') {
                showToast(`ID Proof Rejected: ${currentMembership.id_proof_reason || 'Please upload a new one.'}`, "error");
                hasRejection = true;
            }
            if(currentMembership.signature_status === 'Rejected') {
                showToast(`Signature Rejected: ${currentMembership.signature_reason || 'Please upload a new one.'}`, "error");
                hasRejection = true;
            }
            // NEW: Check payment status if rejected by admin
            if (currentMembership.payment_verified === false && currentMembership.payment_reject_reason) {
                showToast(`Payment Rejected: ${currentMembership.payment_reject_reason}`, "error");
                hasRejection = true;
            }
            if (hasRejection) {
                setTimeout(() => toggleReuploadModal(true), 1500);
            }
        }

        if (user.has_completed_membership) {
            showDashboard(user);
        } else {
            showMembershipForm(user);
        }
    }
}

function toggleEditMode(enable) {
    const dashboard = document.getElementById('user-dashboard');
    const memSection = document.getElementById('membership-section');
    const submitBtn = memSection.querySelector('button[type="submit"]');

    if (enable) {
        isEditMode = true;
        dashboard.classList.add('hidden');
        memSection.classList.remove('hidden');
        
        if(currentMembership) {
            document.getElementById('mem-plan').value = currentMembership.plan;
            document.getElementById('mem-goal').value = currentMembership.goal;
            document.getElementById('mem-start-date').value = currentMembership.start_date.split('T')[0];
            document.getElementById('mem-end-date').value = currentMembership.end_date.split('T')[0];
            document.getElementById('mem-emer-name').value = currentMembership.emergency_name;
            
            // Handle relationship dropdown for edit mode
            const relSelect = document.getElementById('mem-emer-rel');
            const relOther = document.getElementById('mem-emer-rel-other');
            const relOptions = Array.from(relSelect.options).map(o => o.value);
            if(relOptions.includes(currentMembership.emergency_relationship)) {
                relSelect.value = currentMembership.emergency_relationship;
                relOther.classList.add('hidden');
                relOther.removeAttribute('required');
            } else {
                relSelect.value = 'Other';
                relOther.value = currentMembership.emergency_relationship;
                relOther.classList.remove('hidden');
                relOther.setAttribute('required', 'true');
            }

            document.getElementById('mem-emer-phone').value = currentMembership.emergency_phone;
            
            document.getElementById('mem-govt-id-file').required = false;
            document.getElementById('mem-signature-file').required = false;
            document.getElementById('payment-screenshot-file').required = false; // NEW
            
            // NEW: Pre-fill payment status
            if (currentMembership.payment_status) {
                document.getElementById('payment-status-select').value = currentMembership.payment_status;
                togglePaymentNote(document.getElementById('payment-status-select'));
            }
            
            submitBtn.innerText = "Save Changes";
            calculateMembershipDates();
        }
    } else {
        isEditMode = false;
        memSection.classList.add('hidden');
        dashboard.classList.remove('hidden');
        document.getElementById('mem-govt-id-file').required = true;
        document.getElementById('mem-signature-file').required = true;
        document.getElementById('payment-screenshot-file').required = true; // NEW
        submitBtn.innerText = "Submit & Activate Membership";
    }
}

function showDashboard(user) {
    const dashboard = document.getElementById('user-dashboard');
    dashboard.classList.remove('hidden');
    document.getElementById('welcome-msg').innerText = `Welcome, ${user.name} (${user.role})`;
    
    // REQUIREMENT: Remove "Meet Our Expert Trainers" section from User Profile page
    const trainersSection = document.querySelector('.trainers-section');
    if(trainersSection) trainersSection.style.display = 'none';
    
    checkMembershipExpiry();

    const readOnlySection = document.getElementById('dashboard-read-only');
    const emptySection = document.getElementById('dashboard-empty');
    
    if(currentMembership) {
        readOnlySection.classList.remove('hidden');
        emptySection.classList.add('hidden');

        document.getElementById('dash-name').innerText = user.name;
        document.getElementById('dash-email').innerText = user.email;
        document.getElementById('dash-phone').innerText = user.phone || '-';
        document.getElementById('dash-start-date').innerText = formatDate(currentMembership.start_date);
        document.getElementById('dash-plan').innerText = currentMembership.plan;
        
        let amt = '₹1000';
        if(currentMembership.plan === 'Quarterly') amt = '₹2800';
        if(currentMembership.plan === 'Half-Yearly') amt = '₹5000';
        if(currentMembership.plan === 'Annual') amt = '₹9000';
        document.getElementById('dash-amount').innerText = amt;

        const idStatus = document.getElementById('dash-id-status');
        const sigStatus = document.getElementById('dash-sig-status');
        
        idStatus.className = `badge badge-${currentMembership.id_proof_status}`;
        idStatus.innerText = currentMembership.id_proof_status;
        document.getElementById('dash-id-reason').innerText = currentMembership.id_proof_reason ? `Reason: ${currentMembership.id_proof_reason}` : '';

        sigStatus.className = `badge badge-${currentMembership.signature_status}`;
        sigStatus.innerText = currentMembership.signature_status;
        document.getElementById('dash-sig-reason').innerText = currentMembership.signature_reason ? `Reason: ${currentMembership.signature_reason}` : '';

        // NEW: Show Payment Status in Dashboard
        const payStatus = document.getElementById('dash-payment-status');
        let payText = 'Pending';
        let payClass = 'Pending';
        
        if (currentMembership.payment_verified === true) {
            payText = 'Verified';
            payClass = 'Approved';
        } else if (currentMembership.payment_verified === false && currentMembership.payment_reject_reason) {
            payText = 'Rejected';
            payClass = 'Rejected';
        }
        
        payStatus.className = `badge badge-${payClass}`;
        payStatus.innerText = payText;
        document.getElementById('dash-payment-note').innerText = currentMembership.payment_reject_reason ? `Reason: ${currentMembership.payment_reject_reason}` : (currentMembership.payment_note ? `Note: ${currentMembership.payment_note}` : '');

        document.getElementById('dash-emer').innerText = `${currentMembership.emergency_name} (${currentMembership.emergency_relationship}) - ${currentMembership.emergency_phone}`;

    } else {
        readOnlySection.classList.add('hidden');
        emptySection.classList.remove('hidden');
    }
}

function showAdminDashboard(user) {
    const dashboard = document.getElementById('admin-dashboard');
    dashboard.classList.remove('hidden');
    document.getElementById('admin-name-display').innerText = user.name;
    
    loadAdminStats();
    loadAdminUsers();
    loadAdminEnquiries();
    loadAdminMemberships(); // Now handles Verification too
    loadAdminAdmins();
    loadAdminTrainers();
    loadAdminReviews();
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.admin-nav-btn').forEach(btn => btn.classList.remove('active'));
    if(event && event.target) event.target.classList.add('active');
    document.querySelectorAll('.admin-view').forEach(view => view.classList.add('hidden'));
    const targetView = document.getElementById(`admin-view-${tabName}`);
    if(targetView) targetView.classList.remove('hidden');
}

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

async function loadAdminUsers() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = ''; 
    try {
        const res = await fetch(`${API_BASE_URL}/admin/users`);
        const data = await res.json();
        if(!data.success || data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">No users found.</td></tr>';
            return;
        }
        data.users.forEach(u => {
            const suspendIcon = u.status === 'Active' ? '<i class="fas fa-ban"></i> Suspend' : '<i class="fas fa-check-circle"></i> Activate';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color:white !important;">${u.name || 'N/A'}</td>
                <td style="color:white !important;">${u.email || 'N/A'}</td>
                <td style="color:white !important;">${u.phone || 'N/A'}</td>
                <td style="color:white !important;">${u.address || 'N/A'}</td>
                <td style="color:white !important;">${u.gender || 'N/A'}</td>
                <td style="color:white !important;">${u.dob ? formatDate(u.dob) : 'N/A'}</td>
                <td><span class="badge" style="background:#333; padding:4px 8px; border-radius:4px;">${u.role}</span></td>
                <td><span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-suspended'}">${u.status}</span></td>
                <td>
                    <button class="action-btn btn-edit" onclick="openEditUser(${u.id})"><i class="fas fa-pencil-alt"></i></button>
                    <button class="action-btn btn-suspend" onclick="toggleUserStatus(${u.id}, '${u.status}')">${suspendIcon}</button>
                    ${u.role !== 'Admin' ? `<button class="action-btn btn-delete" onclick="deleteUser(${u.id})"><i class="fas fa-trash-alt"></i></button>` : ''}
                </td>`;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

async function loadAdminEnquiries() {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/enquiries`);
        const data = await res.json();
        const tbody = document.getElementById('enquiries-table-body');
        tbody.innerHTML = '';
        data.enquiries.forEach(eq => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${eq.name}</td><td>${eq.phone}</td><td>${eq.email}</td><td>${eq.contact_method}</td>
                <td>${eq.goal}</td><td>${eq.plan_preference}</td><td>${eq.start_date || '-'}</td>
                <td>${eq.budget || '-'}</td><td>${eq.preferred_time}</td>
                <td>${formatDate(eq.created_at)}</td>`;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

async function loadAdminMemberships() {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/memberships`);
        const data = await res.json();
        const tbody = document.getElementById('memberships-table-body');
        tbody.innerHTML = '';
        
        if (!data.success || data.memberships.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No memberships found.</td></tr>';
            return;
        }

        data.memberships.forEach(m => {
            const actionsHtml = `
                <button class="action-btn btn-edit" onclick="openEditMembership(${m.id})"><i class="fas fa-pencil-alt"></i></button>
            `;

            // 1. Generate View Button for ID Proof (If file exists)
            let idViewBtn = '';
            if (m.gov_id_file_path) {
                idViewBtn = `<button class="action-btn btn-view" onclick="previewDoc('${m.gov_id_file_path}')" title="View Document" style="margin-top:5px; width:100%;"><i class="fas fa-eye"></i> View Proof</button>`;
            }

            // 2. Generate View Button for Signature (If file exists)
            let sigViewBtn = '';
            if (m.signature_file_path) {
                sigViewBtn = `<button class="action-btn btn-view" onclick="previewDoc('${m.signature_file_path}')" title="View Document" style="margin-top:5px; width:100%;"><i class="fas fa-eye"></i> View Sig</button>`;
            }
            
            // 3. NEW: Payment Info Logic
            let paymentInfoHtml = '';
            if(m.payment_screenshot_path) {
                paymentInfoHtml += `<button class="action-btn btn-view" onclick="previewDoc('${m.payment_screenshot_path}')" title="View Screenshot" style="margin-bottom:5px; width:100%;"><i class="fas fa-image"></i> View Screenshot</button>`;
            }
            
            // Payment Status Actions
            let paymentActions = '';
            let paymentStatusBadge = `<span class="badge badge-Pending">Pending</span>`;
            
            if (m.payment_verified === true) {
                paymentStatusBadge = `<span class="badge badge-Approved">Verified</span>`;
            } else if (m.payment_verified === false) {
                paymentStatusBadge = `<span class="badge badge-Rejected">Rejected</span>`;
                if(m.payment_reject_reason) {
                    paymentStatusBadge += `<br><small style="color:#dc3545; font-size:0.7rem;">${m.payment_reject_reason}</small>`;
                }
            }
            
            // If not verified yet, show Approve/Reject buttons
            if (m.payment_verified !== true) {
                paymentActions = `
                    <div style="margin-top:5px;">
                        <button class="action-btn btn-approve" onclick="verifyPayment(${m.id}, 'Verified')">✔ Approve</button>
                        <button class="action-btn btn-reject" onclick="initPaymentReject(${m.id})">✖ Reject</button>
                    </div>
                `;
            } else {
                paymentActions = `<div style="margin-top:5px;">${paymentStatusBadge}</div>`;
            }
            
            // Append User's note if status is "Other"
            if(m.payment_status === 'Other' && m.payment_note) {
                paymentInfoHtml += `<small style="color:#ffc107; display:block; margin-bottom:5px;">User Note: ${m.payment_note}</small>`;
            }

            // ID Verification Logic
            let idActions = '';
            if (m.id_proof_status === 'Pending') {
                idActions = `
                    <div style="margin-top:5px;">
                        <button class="action-btn btn-approve" onclick="reviewDoc(${m.id}, 'id', 'Approved')">✔ Approve</button>
                        <button class="action-btn btn-reject" onclick="initReject(${m.id}, 'id')">✖ Reject</button>
                    </div>
                    ${idViewBtn}
                `;
            } else {
                idActions = `<div style="margin-top:5px;"><span class="badge badge-${m.id_proof_status}">${m.id_proof_status}</span>`;
                if (m.id_proof_status === 'Rejected') {
                    idActions += `<br><small style="color:#dc3545; font-size:0.7rem;">${m.id_proof_reason}</small>`;
                }
                idActions += `</div>`;
                idActions += idViewBtn;
            }

            // Signature Verification Logic
            let sigActions = '';
            if (m.signature_status === 'Pending') {
                sigActions = `
                    <div style="margin-top:5px;">
                        <button class="action-btn btn-approve" onclick="reviewDoc(${m.id}, 'signature', 'Approved')">✔ Approve</button>
                        <button class="action-btn btn-reject" onclick="initReject(${m.id}, 'signature')">✖ Reject</button>
                    </div>
                    ${sigViewBtn}
                `;
            } else {
                sigActions = `<div style="margin-top:5px;"><span class="badge badge-${m.signature_status}">${m.signature_status}</span>`;
                if (m.signature_status === 'Rejected') {
                    sigActions += `<br><small style="color:#dc3545; font-size:0.7rem;">${m.signature_reason}</small>`;
                }
                sigActions += `</div>`;
                sigActions += sigViewBtn;
            }

            const medicalText = (m.medical_conditions && m.medical_conditions !== 'None') ? `${m.medical_conditions}` : 'None';
            const specificChecks = m.specific_conditions ? `<br><small style="color:#aaa;">${m.specific_conditions}</small>` : '';

            const emergencyText = `
                <strong>${m.emergency_name}</strong> (${m.emergency_relationship})<br>
                <span style="color:var(--primary);">${m.emergency_phone}</span>
            `;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${m.name}</strong><br><small>${m.email}</small></td>
                <td>${m.plan}</td>
                <td>${m.goal}</td>
                <td>${formatDate(m.start_date)} - ${formatDate(m.end_date)}</td>
                <td>
                    <strong>UPI</strong><br>
                    ${paymentInfoHtml}
                    ${paymentActions}
                </td>
                <td>${emergencyText}</td>
                <td>${medicalText}${specificChecks}</td>
                <td>
                    <strong>ID Proof</strong> (${m.gov_id_number || 'N/A'})
                    ${idActions}
                </td>
                <td>
                    <strong>Signature</strong>
                    ${sigActions}
                </td>
                <td>${actionsHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

// --- DOCUMENT PREVIEW FUNCTIONALITY ---
function toggleDocPreviewModal() {
    const modal = document.getElementById('doc-preview-modal');
    modal.classList.remove('active');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function previewDoc(filename) {
    if (!filename) return;
    const modal = document.getElementById('doc-preview-modal');
    const container = document.getElementById('doc-preview-container');
    
    // Ensure correct path
    const fileUrl = `/uploads/${filename}`;
    const ext = filename.split('.').pop().toLowerCase();

    // Determine content type
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        container.innerHTML = `<img src="${fileUrl}" alt="Document Preview" style="max-width: 100%; max-height: 70vh; object-fit: contain;">`;
    } else if (ext === 'pdf') {
        container.innerHTML = `<iframe src="${fileUrl}" type="application/pdf" width="100%" height="100%" style="border:none;"></iframe>`;
    } else {
        container.innerHTML = `<div style="text-align:center; color:#ccc;">
            <i class="fas fa-file-alt" style="font-size: 3rem; margin-bottom: 10px;"></i>
            <p>Preview not available for this file type.</p>
            <a href="${fileUrl}" target="_blank" style="color:var(--primary); text-decoration:underline;">Download File</a>
        </div>`;
    }

    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('active'), 10);
}

function initReject(id, type) {
    tempRejectionData = { id, type };
    document.getElementById('reject-reason-input').value = '';
    const modal = document.getElementById('rejection-modal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('active'), 10);
}

// NEW: Payment Rejection Init
let tempPaymentRejectId = null;
function initPaymentReject(id) {
    tempPaymentRejectId = id;
    document.getElementById('reject-reason-input').value = ''; // Reuse reason input
    const modal = document.getElementById('rejection-modal');
    modal.querySelector('h3').innerText = "Reject Payment";
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('active'), 10);
}

function toggleRejectionModal() {
    const modal = document.getElementById('rejection-modal');
    modal.classList.remove('active');
    setTimeout(() => modal.classList.add('hidden'), 300);
    // Reset title just in case
    setTimeout(() => modal.querySelector('h3').innerText = "Reject Document", 300);
}

async function confirmRejection() {
    const reason = document.getElementById('reject-reason-input').value;
    if(!reason) return showToast("Please provide a reason", "error");
    
    // Check if it is a Payment Rejection or Document Rejection
    if (tempPaymentRejectId) {
        await verifyPayment(tempPaymentRejectId, 'Rejected', reason);
        tempPaymentRejectId = null;
    } else {
        await reviewDoc(tempRejectionData.id, tempRejectionData.type, 'Rejected', reason);
    }
    
    toggleRejectionModal();
}

async function reviewDoc(id, type, status, reason = '') {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/membership/${id}/review`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ docType: type, status, reason })
        });
        const data = await res.json();
        if(data.success) {
            showToast(`Document ${status}`, "success");
            loadAdminMemberships(); // Reload the combined table
        }
    } catch(e) { showToast("Error updating status", "error"); }
}

// NEW: Verify Payment Function
async function verifyPayment(id, status, reason = '') {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/membership/${id}/verify-payment`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ status, reason })
        });
        const data = await res.json();
        if(data.success) {
            showToast(`Payment ${status}`, "success");
            loadAdminMemberships();
        }
    } catch(e) { showToast("Error updating payment status", "error"); }
}

async function loadAdminReviews() {
    const tbody = document.getElementById('reviews-table-body');
    tbody.innerHTML = '';
    try {
        const res = await fetch(`${API_BASE_URL}/reviews`);
        const data = await res.json();
        if(data.success && data.reviews.length > 0) {
            data.reviews.forEach(r => {
                let starsHtml = '';
                for(let i=0; i<5; i++) {
                    starsHtml += `<i class="fas fa-star" style="color:${i < r.rating ? '#FFD700' : '#ccc'}; font-size: 0.8rem;"></i>`;
                }
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${r.name}</td>
                    <td>${starsHtml}</td>
                    <td>${r.review_text}</td>
                    <td>${formatDate(r.review_date)}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No reviews found.</td></tr>';
        }
    } catch(e) { console.error(e); }
}

async function loadAdminAdmins() {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/admins`);
        const data = await res.json();
        const tbody = document.getElementById('admins-table-body');
        tbody.innerHTML = '';
        data.admins.forEach(a => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${a.name}</td><td>${a.email}</td><td><span class="badge ${a.status === 'Active' ? 'badge-active' : 'badge-suspended'}">${a.status}</span></td><td>${formatDate(a.admin_since)}</td>`;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

async function loadAdminTrainers() {
    const tbody = document.getElementById('trainers-table-body');
    tbody.innerHTML = '';
    try {
        const res = await fetch(`${API_BASE_URL}/admin/trainers`);
        const data = await res.json();
        if(data.success && data.trainers.length > 0) {
            data.trainers.forEach(t => {
                const photoSrc = t.photo ? `/uploads/${t.photo}` : '';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${photoSrc ? `<img src="${photoSrc}" style="width:50px;height:50px;object-fit:cover;border-radius:50%;">` : 'N/A'}</td>
                    <td>${t.name}</td><td>${t.experience}</td><td>${t.bio.substring(0,30)}...</td>
                    <td>${t.instagram || '-'}</td><td>${t.availability}</td><td>${t.specialization}</td>
                    <td>
                        <button class="action-btn btn-edit" onclick="editTrainer(${t.id})"><i class="fas fa-edit"></i></button>
                        <button class="action-btn btn-delete" onclick="deleteTrainer(${t.id})"><i class="fas fa-trash"></i></button>
                    </td>`;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No trainers found.</td></tr>';
        }
    } catch (e) { console.error(e); }
}

function toggleTrainerModal() {
    const modal = document.getElementById('trainer-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => modal.classList.toggle('active'), 10);
    if(!modal.classList.contains('hidden')) {
        document.getElementById('trainer-form').reset();
        document.getElementById('trainer-id').value = '';
        document.getElementById('trainer-modal-title').innerText = "Add New Trainer";
    }
}

async function editTrainer(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/trainers`);
        const data = await res.json();
        const trainer = data.trainers.find(t => t.id === id);
        if(trainer) {
            document.getElementById('trainer-id').value = trainer.id;
            document.getElementById('trainer-name').value = trainer.name;
            document.getElementById('trainer-exp').value = trainer.experience;
            document.getElementById('trainer-bio').value = trainer.bio;
            document.getElementById('trainer-insta').value = trainer.instagram || '';
            document.getElementById('trainer-avail').value = trainer.availability;
            document.getElementById('trainer-spec').value = trainer.specialization;
            document.getElementById('trainer-modal-title').innerText = "Edit Trainer";
            toggleTrainerModal();
        }
    } catch(e) { console.error(e); }
}

document.getElementById('trainer-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('trainer-id').value;
    const isEdit = !!id;
    const formData = new FormData();
    formData.append('name', document.getElementById('trainer-name').value);
    formData.append('experience', document.getElementById('trainer-exp').value);
    formData.append('bio', document.getElementById('trainer-bio').value);
    formData.append('instagram', document.getElementById('trainer-insta').value);
    formData.append('availability', document.getElementById('trainer-avail').value);
    formData.append('specialization', document.getElementById('trainer-spec').value);
    
    const photoInput = document.getElementById('trainer-photo');
    if (photoInput.files.length > 0) formData.append('photo', photoInput.files[0]);
    
    try {
        const url = isEdit ? `${API_BASE_URL}/admin/trainer/${id}` : `${API_BASE_URL}/admin/trainer`;
        const method = isEdit ? 'PUT' : 'POST';
        const res = await fetch(url, { method: method, body: formData });
        const data = await res.json();
        if(data.success) {
            showToast(data.message, "success");
            toggleTrainerModal();
            loadAdminTrainers();
            loadPublicTrainers();
        } else {
            showToast(data.message, "error");
        }
    } catch(e) { console.error(e); showToast("Error saving trainer", "error"); }
});

async function deleteTrainer(id) {
    if(!confirm("Delete this trainer?")) return;
    try {
        const res = await fetch(`${API_BASE_URL}/admin/trainer/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if(data.success) {
            showToast(data.message, "success");
            loadAdminTrainers();
            loadPublicTrainers();
        }
    } catch(e) { showToast("Error deleting trainer", "error"); }
}

async function toggleUserStatus(id, currentStatus) {
    const newStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    if(!confirm(`Set user to ${newStatus}?`)) return;
    try {
        const res = await fetch(`${API_BASE_URL}/admin/user/${id}/status`, {
            method: 'put',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if(data.success) {
            showToast(data.message, "success");
            loadAdminUsers();
            loadAdminMemberships();
        }
    } catch(e) { showToast("Error updating status", "error"); }
}

async function deleteUser(id) {
    if(!confirm("Delete user permanently?")) return;
    try {
        await fetch(`${API_BASE_URL}/admin/user/${id}`, { method: 'DELETE' });
        showToast("User deleted", "success");
        loadAdminUsers();
    } catch(e) { showToast("Error deleting user", "error"); }
}

function toggleEditMembershipModal() {
    const modal = document.getElementById('edit-membership-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => modal.classList.toggle('active'), 10);
}

async function openEditMembership(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/memberships`);
        const data = await res.json();
        const membership = data.memberships.find(m => m.id === id);
        if(membership) {
            document.getElementById('edit-mem-id').value = membership.id;
            document.getElementById('edit-mem-plan').value = membership.plan;
            document.getElementById('edit-mem-goal').value = membership.goal;
            document.getElementById('edit-mem-start-date').value = membership.start_date ? membership.start_date.split('T')[0] : '';
            document.getElementById('edit-mem-end-date').value = membership.end_date ? membership.end_date.split('T')[0] : '';
            document.getElementById('edit-mem-payment-mode').value = membership.payment_mode;
            toggleEditMembershipModal();
        }
    } catch(e) { console.error(e); }
}

document.getElementById('edit-membership-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('edit-mem-id').value;
    const { plan, goal, startDate, endDate, paymentMode } = {
        plan: document.getElementById('edit-mem-plan').value,
        goal: document.getElementById('edit-mem-goal').value,
        startDate: document.getElementById('edit-mem-start-date').value,
        endDate: document.getElementById('edit-mem-end-date').value,
        paymentMode: document.getElementById('edit-mem-payment-mode').value
    };
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
        }
    } catch(e) { showToast("Error updating membership", "error"); }
});

function toggleEditUserModal() {
    const modal = document.getElementById('edit-user-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => modal.classList.toggle('active'), 10);
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
        }
    } catch(e) { console.error(e); }
}

document.getElementById('edit-user-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('edit-user-id').value;
    const { name, phone, address, gender, dob } = {
        name: document.getElementById('edit-name').value,
        phone: document.getElementById('edit-phone').value,
        address: document.getElementById('edit-address').value,
        gender: document.getElementById('edit-gender').value,
        dob: document.getElementById('edit-dob').value
    };
    
    // Name Validation
    if (!validateName(name)) return;

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
        }
    } catch(e) { showToast("Error updating user", "error"); }
});

function toggleCreateAdminModal() {
    const modal = document.getElementById('create-admin-modal');
    modal.classList.toggle('hidden');
    setTimeout(() => modal.classList.toggle('active'), 10);
}

document.getElementById('create-admin-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const { name, email, pass } = {
        name: document.getElementById('new-admin-name').value,
        email: document.getElementById('new-admin-email').value,
        pass: document.getElementById('new-admin-pass').value
    };
    
    // Name Validation
    if (!validateName(name)) return;

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
        }
    } catch(e) { showToast("Error creating admin", "error"); }
});

function showMembershipForm(user) {
    const memSection = document.getElementById('membership-section');
    memSection.classList.remove('hidden');
    document.getElementById('mem-name').value = user.name || '';
    document.getElementById('mem-email').value = user.email || '';
    document.getElementById('mem-phone').value = user.phone || '';
    document.getElementById('mem-address').value = user.address || '';
    document.getElementById('mem-gender').value = user.gender || 'Male';
    if(user.dob) document.getElementById('mem-dob').value = user.dob.split('T')[0];
    
    // Ensure Date Constraints are set for the form
    setDateConstraints();
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('mem-sub-date').value = today;
    
    const startDateInput = document.getElementById('mem-start-date');
    
    if (today >= startDateInput.min && today <= startDateInput.max) startDateInput.value = today;
    else startDateInput.value = today;
    
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
    const qrAmountDisplay = document.getElementById('qr-amount-display'); // Update QR Text
    
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
    if(qrAmountDisplay) qrAmountDisplay.innerText = `₹${amount}`; // NEW
    
    const startDate = new Date(startDateInput);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + monthsToAdd);
    endDateInput.value = endDate.toISOString().split('T')[0];
}

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
    let goal = null;
    for(const radio of document.getElementsByName('enq-goal')) { if(radio.checked) goal = radio.value; }
    if (goal === 'Other') {
        const otherText = document.getElementById('enq-goal-other').value.trim();
        if (!otherText) { showToast("Specify your fitness goal.", "error"); return; }
        goal = otherText;
    }
    const plan = document.querySelector('input[name="enq-plan"]:checked')?.value;
    const startDate = document.getElementById('enq-start-date').value;
    
    if(!startDate) { showToast("Select start date.", "error"); return; }
    const year = parseInt(startDate.split('-')[0]);
    const currentYear = new Date().getFullYear();
    if(year < currentYear || year > currentYear + 5) {
        showToast(`Start date must be between ${currentYear} and ${currentYear + 5}.`, "error");
        return;
    }

    const budget = document.getElementById('enq-budget').value;
    const time = document.querySelector('input[name="enq-time"]:checked')?.value;

    // Name Validation
    if (!validateName(name)) return;

    if (!phone.match(/^[0-9]{10}$/)) { showToast("Valid 10-digit phone required.", "error"); return; }
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { showToast("Invalid email.", "error"); return; }
    if (!plan) { showToast("Select a preferred plan.", "error"); return; }
    if (!time) { showToast("Select preferred workout time.", "error"); return; }

    const btn = this.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = "Sending...";
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/enquiry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, email, contactMethod, goal, plan, startDate, budget, time })
        });
        const data = await response.json();
        if (!data.success) { showToast(data.message, "error"); return; }
        showToast("Enquiry Sent Successfully!", "success");
        this.reset();
        document.getElementById('enq-goal-other').classList.add('hidden');
    } catch (error) {
        console.error('Enquiry error:', error);
        showToast("Error sending enquiry.", "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

function toggleMembershipWidget() {
    const widget = document.getElementById('membership-widget');
    const body = widget.querySelector('.widget-body');
    const arrow = widget.querySelector('.arrow-icon');
    
    if (body.style.maxHeight === '0px' || !body.style.maxHeight) {
        body.style.maxHeight = '500px';
        arrow.classList.add('rotate-up');
    } else {
        body.style.maxHeight = '0px';
        arrow.classList.remove('rotate-up');
    }
}

function checkMembershipExpiry() {
    const widget = document.getElementById('membership-widget');
    
    if (!currentMembership) {
        widget.classList.add('hidden');
        return;
    }

    const endDate = new Date(currentMembership.end_date);
    const today = new Date();
    
    endDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    
    const diffTime = endDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    widget.classList.remove('hidden');
    
    const planName = currentMembership.plan || 'Plan';
    const formattedDate = formatDate(currentMembership.end_date); 
    const daysRemaining = diffDays;
    
    document.getElementById('widget-plan-name').innerText = planName;
    document.getElementById('widget-expiry-date').innerText = formattedDate;
    document.getElementById('widget-days-remaining').innerText = `${daysRemaining} days remaining`;
    
    const icon = widget.querySelector('.widget-icon');
    
    if (diffDays < 0) {
        widget.style.borderLeft = '4px solid #dc3545';
        icon.innerText = '⚠️';
        document.querySelector('.status-text').innerText = "Membership Expired";
        document.querySelector('.status-text').style.color = "#dc3545";
        document.getElementById('widget-days-remaining').innerText = `${Math.abs(diffDays)} days overdue`;
    } else if (diffDays <= 7) {
        widget.style.borderLeft = '4px solid #e67e22';
        icon.innerText = '✅';
        document.querySelector('.status-text').innerText = "Membership Active"; 
        document.querySelector('.status-text').style.color = "#e67e22";
    } else {
        widget.style.borderLeft = '4px solid #28a745';
        icon.innerText = '✅';
        document.querySelector('.status-text').innerText = "Membership Active";
        document.querySelector('.status-text').style.color = "#28a745";
    }
}

function toggleReuploadModal(autoOpen = false) {
    const modal = document.getElementById('reupload-modal');
    if (!autoOpen && !modal.classList.contains('hidden')) {
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);
        return;
    }

    if (modal.classList.contains('hidden')) {
        document.getElementById('reupload-form').reset();
        document.getElementById('reupload-user-id').value = currentUser.id;
        
        const idGroup = document.getElementById('reupload-id-group');
        const sigGroup = document.getElementById('reupload-sig-group');
        const reasonText = document.getElementById('reupload-reason-text');
        
        let msg = [];
        
        if (currentMembership.id_proof_status === 'Rejected') {
            idGroup.style.display = 'block';
            document.getElementById('reupload-id-file').setAttribute('required', 'true');
            document.getElementById('reupload-id-number').setAttribute('required', 'true');
            let placeholder = "Enter ID Number";
            if(currentMembership.gov_id_type === 'Aadhar') placeholder = "12-digit Aadhar Number";
            if(currentMembership.gov_id_type === 'PAN') placeholder = "PAN Number (e.g. ABCDE1234F)";
            document.getElementById('reupload-id-number').placeholder = placeholder;
            msg.push("ID Proof was rejected. Please upload a new one and verify the number.");
        } else {
            idGroup.style.display = 'none';
            document.getElementById('reupload-id-file').removeAttribute('required');
            document.getElementById('reupload-id-number').removeAttribute('required');
        }

        if (currentMembership.signature_status === 'Rejected') {
            sigGroup.style.display = 'block';
            document.getElementById('reupload-sig-file').setAttribute('required', 'true');
            msg.push("Signature was rejected. Please upload a new one.");
        } else {
            sigGroup.style.display = 'none';
            document.getElementById('reupload-sig-file').removeAttribute('required');
        }
        
        // NEW: Handle Payment Rejection in Reupload (Simplification: User just re-uploads via edit profile for now, but we add a note)
        if (currentMembership.payment_verified === false && currentMembership.payment_reject_reason) {
             msg.push(`Payment was rejected: ${currentMembership.payment_reject_reason}. Please edit your profile to update payment details.`);
        }

        reasonText.innerText = msg.join(" ");

        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('active'), 10);
    }
}

document.getElementById('reupload-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('userId', currentUser.id);

    const idNumberInput = document.getElementById('reupload-id-number');
    const idFile = document.getElementById('reupload-id-file');
    const sigFile = document.getElementById('reupload-sig-file');

    if (idFile.files.length > 0) {
        const idNum = idNumberInput.value.trim();
        const idType = currentMembership.gov_id_type; 
        
        if(idType === 'Aadhar') {
            if(!/^\d{12}$/.test(idNum)) {
                showToast("Aadhar must be exactly 12 digits.", "error");
                return;
            }
        } else if (idType === 'PAN') {
            if(!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(idNum.toUpperCase())) {
                showToast("Invalid PAN format.", "error");
                return;
            }
        }

        try {
            await performSmartValidation(idFile.files[0], 'ID');
            formData.append('idFile', idFile.files[0]);
            formData.append('govIdNumber', idNum);
        } catch (err) {
            showToast(err, "error");
            return;
        }
    }

    if (sigFile.files.length > 0) {
        try {
            await performSmartValidation(sigFile.files[0], 'Signature');
            formData.append('sigFile', sigFile.files[0]);
        } catch (err) {
            console.error(err);
        }
    }

    try {
        const res = await fetch(`${API_BASE_URL}/membership/reupload`, {
            method: 'PUT',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast("Documents re-uploaded successfully! Pending Approval.", "success");
            toggleReuploadModal();
        } else {
            showToast(data.message, "error");
        }
    } catch (err) {
        showToast("Error re-uploading documents", "error");
    }
});

function logout() {
    currentUser = null;
    currentMembership = null;
    isEditMode = false;
    document.querySelector('.hero-section').style.display = 'flex';
    document.querySelector('.navbar').style.display = 'block';
    document.querySelector('.enquiry-section').style.display = 'flex';
    // Reset to landing page state (show trainers)
    document.querySelector('.trainers-section').style.display = 'block'; 
    document.querySelector('.reviews-section').style.display = 'block'; 
    document.getElementById('user-dashboard').classList.add('hidden');
    document.getElementById('membership-section').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
    document.getElementById('membership-widget').classList.add('hidden');
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

// --- FORGOT PASSWORD LOGIC ---

document.getElementById('forgot-email-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    
    // Basic Email Validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!emailRegex.test(email)) {
        showToast("Please enter a valid Gmail address.", "error");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/forgot-password-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (data.success) {
            showToast(data.message, "success");
            resetEmailTemp = email;
            document.getElementById('forgot-step-1').classList.add('hidden');
            document.getElementById('forgot-step-2').classList.remove('hidden');
        } else {
            showToast(data.message, "error");
        }
    } catch (error) {
        console.error(error);
        showToast("Error sending OTP. Please try again.", "error");
    }
});

document.getElementById('reset-password-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const otp = document.getElementById('forgot-otp').value.trim();
    const newPass = document.getElementById('new-pass').value;
    const confirmPass = document.getElementById('confirm-new-pass').value;

    if (otp.length !== 4) {
        showToast("Please enter a valid 4-digit OTP.", "error");
        return;
    }

    if (newPass !== confirmPass) {
        showToast("Passwords do not match.", "error");
        return;
    }

    if (newPass.length < 6) {
        showToast("Password must be at least 6 characters.", "error");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: resetEmailTemp, 
                otp: otp, 
                newPassword: newPass 
            })
        });
        const data = await response.json();
        if (data.success) {
            // Updated success message for clarity
            showToast("Password updated! Please login with your new password.", "success");
            switchAuthView('login');
        } else {
            showToast(data.message, "error");
        }
    } catch (error) {
        console.error(error);
        showToast("Error resetting password.", "error");
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadPublicTrainers();
    loadPublicReviews();
});
