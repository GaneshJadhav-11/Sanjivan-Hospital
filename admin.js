// ================================
// ADMIN LOGIN
// ================================

const loginForm = document.getElementById("loginForm");

const loginSection = document.getElementById("loginSection");

const dashboard = document.getElementById("dashboard");

const loginMessage = document.getElementById("loginMessage");

const logoutBtn = document.getElementById("logoutBtn");


// Demo Admin Credentials

const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD = "admin123";


loginForm.addEventListener("submit", function (event) {

    event.preventDefault();

const email = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();


    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {

        loginSection.classList.add("hidden");

        dashboard.classList.remove("hidden");

        logoutBtn.classList.remove("hidden");

        loginMessage.textContent = "";

        loadDashboard();

    } else {

        loginMessage.textContent =
            "Invalid username or password.";

    }

});


// ================================
// LOGOUT
// ================================

logoutBtn.addEventListener("click", function () {

    dashboard.classList.add("hidden");

    loginSection.classList.remove("hidden");

    document.getElementById("username").value = "";

    document.getElementById("password").value = "";

});


// ================================
// DOCTOR DATA
// ================================

const doctors = {

    "General Physician": [
        "Dr. Sujit Sonawane"
    ]

};


// ================================
// GET PATIENT RECORDS
// ================================

let currentRecords = [];

async function fetchRecords() {
    try {
        const res = await fetch('/api/patients');
        currentRecords = await res.json();
    } catch(e) {
        console.error(e);
        currentRecords = [];
    }
}

function getRecords() {
    return currentRecords;
}


// ================================
// COUNT DOCTORS
// ================================

function getTotalDoctors() {

    let count = 0;

    Object.values(doctors).forEach(function (doctorList) {

        count += doctorList.length;

    });

    return count;

}


// ================================
// LOAD DASHBOARD
// ================================

async function loadDashboard() {

    await fetchRecords();
    const records = getRecords();


    // Doctor count

    const totalDoctors = getTotalDoctors();

    document.getElementById("doctorCount").textContent =
        totalDoctors;


    // Patient count

    document.getElementById("patientCount").textContent =
        records.length;


    // Waiting count
    const waitingPatients = records.filter(patient => patient.status === "WAITING");
    document.getElementById("waitingCount").textContent = waitingPatients.length;

    // In Progress count
    const inProgressPatients = records.filter(patient => patient.status === "IN_PROGRESS");
    const inProgressEl = document.getElementById("inProgressCount");
    if (inProgressEl) inProgressEl.textContent = inProgressPatients.length;

    // Completed count
    const completedPatients = records.filter(patient => patient.status === "COMPLETED");
    const completedEl = document.getElementById("completedCount");
    if (completedEl) completedEl.textContent = completedPatients.length;

    renderDoctors();
    renderPatients(records);
    fetchPayments();
}

// ================================
// SHOW & VERIFY PAYMENTS
// ================================
let currentPayments = [];
let activePaymentFilter = 'ALL';

async function fetchPayments() {
    try {
        const res = await fetch('/api/payments');
        const data = await res.json();
        if (data.success && data.payments) {
            currentPayments = data.payments;
        } else {
            currentPayments = [];
        }
        updatePaymentCounts();
        renderPaymentTable();
    } catch (err) {
        console.error("Error fetching payments:", err);
        currentPayments = [];
        renderPaymentTable();
    }
}

function updatePaymentCounts() {
    const total = currentPayments.length;
    const pending = currentPayments.filter(p => p.paymentStatus === 'PENDING_VERIFICATION' || p.status === 'PENDING_VERIFICATION').length;
    const verified = currentPayments.filter(p => p.paymentStatus === 'VERIFIED' || p.status === 'VERIFIED').length;
    const rejected = currentPayments.filter(p => p.paymentStatus === 'REJECTED' || p.status === 'REJECTED').length;

    const countAllEl = document.getElementById("countAll");
    if (countAllEl) countAllEl.textContent = total;
    const countPendEl = document.getElementById("countPending");
    if (countPendEl) countPendEl.textContent = pending;
    const countVerEl = document.getElementById("countVerified");
    if (countVerEl) countVerEl.textContent = verified;
    const countRejEl = document.getElementById("countRejected");
    if (countRejEl) countRejEl.textContent = rejected;

    const recordCountEl = document.getElementById("paymentRecordCount");
    if (recordCountEl) recordCountEl.textContent = total + " Payments (" + pending + " Pending)";
}

function filterPayments(filter) {
    activePaymentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderPaymentTable();
}

function renderPaymentTable() {
    const tbody = document.getElementById("paymentTableBody");
    if (!tbody) return;

    let filtered = currentPayments;
    if (activePaymentFilter === 'PENDING_VERIFICATION') {
        filtered = currentPayments.filter(p => (p.paymentStatus === 'PENDING_VERIFICATION' || p.status === 'PENDING_VERIFICATION'));
    } else if (activePaymentFilter === 'VERIFIED') {
        filtered = currentPayments.filter(p => (p.paymentStatus === 'VERIFIED' || p.status === 'VERIFIED'));
    } else if (activePaymentFilter === 'REJECTED') {
        filtered = currentPayments.filter(p => (p.paymentStatus === 'REJECTED' || p.status === 'REJECTED'));
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px; color: var(--muted);">No payments found in this category.</td></tr>';
        return;
    }

    let html = "";
    filtered.forEach(p => {
        const time = p.submittedAt || p.timestamp ? new Date(p.submittedAt || p.timestamp).toLocaleString() : '-';
        const st = p.paymentStatus || p.status || 'PENDING_PAYMENT';

        let badge = '<span class="badge" style="background:#e2e8f0; color:#475569;">AWAITING</span>';
        if (st === 'PENDING_VERIFICATION') {
            badge = '<span class="badge badge-warning" style="background:#fef3c7; color:#b45309; padding:4px 9px; border-radius:999px;">⏳ PENDING VERIFICATION</span>';
        } else if (st === 'VERIFIED') {
            badge = '<span class="badge badge-success" style="background:#d1fae5; color:#047857; padding:4px 9px; border-radius:999px;">✓ VERIFIED</span>';
        } else if (st === 'REJECTED') {
            badge = '<span class="badge badge-danger" style="background:#fee2e2; color:#b91c1c; padding:4px 9px; border-radius:999px;">✕ REJECTED</span>';
        } else if (st === 'DEMO_PAID') {
            badge = '<span class="badge badge-info" style="background:#e0f2fe; color:#0369a1; padding:4px 9px; border-radius:999px;">DEMO PAID</span>';
        }

        let actionBtns = "";
        const idVal = p.paymentId || p.id;
        if (st === 'PENDING_VERIFICATION') {
            actionBtns = '<div style="display:flex; gap:6px; align-items:center;">' +
                '<button class="btn-verify" onclick="handleVerifyClick(' + idVal + '); event.stopPropagation();">✓ Verify</button>' +
                '<button class="btn-reject" onclick="handleRejectClick(' + idVal + '); event.stopPropagation();">✕ Reject</button>' +
                '<button class="btn-view" onclick="viewPaymentDetails(' + idVal + '); event.stopPropagation();">👁 Details</button>' +
                '</div>';
        } else {
            actionBtns = '<button class="btn-view" onclick="viewPaymentDetails(' + idVal + '); event.stopPropagation();">👁 Details</button>';
        }

        html += '<tr onclick="viewPaymentDetails(' + idVal + ')">' +
            '<td><b>#' + idVal + '</b></td>' +
            '<td><b>' + p.patientId + '</b></td>' +
            '<td>' + (p.patientName || '-') + '</td>' +
            '<td>' + (p.doctor || '-') + '</td>' +
            '<td>' + (p.appointmentDate || '-') + ' <small style="display:block; color:var(--muted);">' + (p.appointmentTime || '') + '</small></td>' +
            '<td><b>₹' + p.amount + '</b></td>' +
            '<td><span style="font-family: monospace; font-weight:700; color:var(--primary-deep);">' + (p.transactionId || 'Awaiting') + '</span></td>' +
            '<td><small style="color:var(--muted);">' + time + '</small></td>' +
            '<td>' + badge + '</td>' +
            '<td>' + actionBtns + '</td>' +
            '</tr>';
    });
    tbody.innerHTML = html;
}

function viewPaymentDetails(paymentId) {
    const payment = currentPayments.find(p => (p.paymentId === paymentId || p.id === paymentId));
    if (!payment) return;

    const modal = document.getElementById("paymentDetailsModal");
    const content = document.getElementById("paymentDetailsContent");
    if (!modal || !content) return;

    const st = payment.paymentStatus || payment.status;
    const time = payment.submittedAt || payment.timestamp ? new Date(payment.submittedAt || payment.timestamp).toLocaleString() : '-';

    let screenshotHtml = '<span style="color:var(--muted);">No screenshot uploaded by patient</span>';
    if (payment.screenshotPath) {
        screenshotHtml = '<div>' +
            '<a href="' + payment.screenshotPath + '" target="_blank" title="Click to view full screenshot">' +
            '<img src="' + payment.screenshotPath + '" alt="Payment Screenshot" style="max-height: 140px; border-radius: 8px; border: 1px solid #ccc; display: block; margin-top: 6px;">' +
            '</a>' +
            '<small style="display:block; margin-top:4px;"><a href="' + payment.screenshotPath + '" target="_blank">🔍 Open Full Size Screenshot</a></small>' +
            '</div>';
    }

    let verificationActionSection = "";
    const idVal = payment.paymentId || payment.id;
    if (st === 'PENDING_VERIFICATION') {
        verificationActionSection = '<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:16px; margin-top:16px;">' +
            '<h4 style="margin:0 0 10px 0; color:#92400e;">⚠️ Bank Verification Checklist:</h4>' +
            '<ul style="margin:0 0 14px 0; padding-left:20px; font-size:0.88rem; color:#78350f; line-height:1.5;">' +
            '<li>Open the hospital PhonePe Business app or Sanjivan Hospital bank statement.</li>' +
            '<li>Verify incoming credit of exactly <b>₹200</b>.</li>' +
            '<li>Match UTR / Transaction reference: <b style="font-family:monospace;">' + (payment.transactionId || '') + '</b></li>' +
            '</ul>' +
            '<div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">' +
            '<button class="btn-verify" style="padding:10px 20px; font-size:14px;" onclick="handleVerifyClick(' + idVal + ')">' +
            '✓ Confirm & Mark as VERIFIED' +
            '</button>' +
            '<button class="btn-reject" style="padding:10px 20px; font-size:14px;" onclick="toggleRejectForm()">' +
            '✕ Reject Payment' +
            '</button>' +
            '</div>' +
            '<div id="inlineRejectForm" class="hidden" style="margin-top:14px; background:#fff; padding:12px; border-radius:8px; border:1px solid #fca5a5;">' +
            '<label style="display:block; font-weight:700; font-size:0.88rem; color:#991b1b; margin-bottom:6px;">' +
            'Specify Rejection Reason (Required):' +
            '</label>' +
            '<input type="text" id="modalRejectionReason" placeholder="e.g. UTR reference not found in bank account / Amount mismatch" style="width:100%; padding:8px 12px; border:1px solid #ccc; border-radius:6px; margin-bottom:8px;">' +
            '<button class="btn-reject" style="padding:8px 16px;" onclick="submitReject(' + idVal + ')">Submit Rejection</button>' +
            '<button class="btn-view" style="padding:8px 12px; margin-left:8px;" onclick="document.getElementById(\'inlineRejectForm\').classList.add(\'hidden\')">Cancel</button>' +
            '</div>' +
            '</div>';
    } else if (st === 'VERIFIED') {
        verificationActionSection = '<div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:16px; margin-top:16px; color:#065f46;">' +
            '<strong style="font-size:1rem; display:block; margin-bottom:4px;">✓ Verified by Hospital Admin</strong>' +
            '<p style="margin:0; font-size:0.88rem;">Verified by: <b>' + (payment.verifiedBy || 'admin@gmail.com') + '</b> on ' + (payment.verifiedAt ? new Date(payment.verifiedAt).toLocaleString() : '-') + '</p>' +
            '<p style="margin:4px 0 0 0; font-size:0.88rem;">Associated Appointment Status: <b>CONFIRMED</b></p>' +
            '</div>';
    } else if (st === 'REJECTED') {
        verificationActionSection = '<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:16px; margin-top:16px; color:#991b1b;">' +
            '<strong style="font-size:1rem; display:block; margin-bottom:4px;">✕ Payment Submission Rejected</strong>' +
            '<p style="margin:0; font-size:0.88rem;">Rejection Reason: <b>' + (payment.rejectionReason || 'Transaction not found in bank statement') + '</b></p>' +
            '<p style="margin:4px 0 0 0; font-size:0.88rem;">Rejected by: <b>' + (payment.verifiedBy || 'admin@gmail.com') + '</b> on ' + (payment.verifiedAt ? new Date(payment.verifiedAt).toLocaleString() : '-') + '</p>' +
            '<p style="margin:4px 0 0 0; font-size:0.85rem; color:#7f1d1d;">Patient can resubmit their payment reference through their patient portal.</p>' +
            '</div>';
    }

    const copyBtn = payment.transactionId ? '<button type="button" onclick="navigator.clipboard.writeText(\'' + payment.transactionId + '\'); alert(\'Copied UTR: ' + payment.transactionId + '\');" style="padding:4px 10px; border-radius:4px; border:1px solid #ccc; background:#fff; cursor:pointer; font-size:12px;">Copy UTR</button>' : '';

    content.innerHTML = '<div class="details-grid">' +
        '<div class="detail-item"><small>Payment ID</small><b>#' + idVal + '</b></div>' +
        '<div class="detail-item"><small>Appointment ID (Patient ID)</small><b>' + payment.patientId + '</b></div>' +
        '<div class="detail-item"><small>Patient Name</small><b>' + (payment.patientName || '-') + '</b></div>' +
        '<div class="detail-item"><small>Patient Mobile</small><b>' + (payment.patientPhone || '-') + '</b></div>' +
        '<div class="detail-item"><small>Department & Doctor</small><b>' + (payment.department || '') + ' - ' + (payment.doctor || '') + '</b></div>' +
        '<div class="detail-item"><small>OPD Date & Time Slot</small><b>' + (payment.appointmentDate || '-') + ' (' + (payment.appointmentTime || '-') + ')</b></div>' +
        '<div class="detail-item"><small>Expected Consultation Fee</small><b style="color:var(--primary-deep); font-size:1.1rem;">₹' + payment.amount + '</b></div>' +
        '<div class="detail-item"><small>Payment Method</small><b>' + (payment.paymentMethod || 'UPI') + '</b></div>' +
        '<div class="detail-item" style="grid-column: span 2; background:#f0fbfb; border:1px solid var(--primary);">' +
        '<small style="color:var(--primary-deep); font-weight:700;">Submitted UPI Transaction Reference ID / UTR</small>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">' +
        '<b style="font-family: monospace; font-size:1.1rem; color:var(--ink);">' + (payment.transactionId || 'Awaiting Submission') + '</b>' +
        copyBtn +
        '</div>' +
        '</div>' +
        '<div class="detail-item"><small>Submission Timestamp</small><b>' + time + '</b></div>' +
        '<div class="detail-item"><small>Current Status</small><b>' + st + '</b></div>' +
        '<div class="detail-item" style="grid-column: span 2;"><small>Payment Screenshot Supporting Proof</small>' + screenshotHtml + '</div>' +
        '</div>' +
        verificationActionSection;

    modal.classList.remove("hidden");
    modal.scrollIntoView({ behavior: "smooth" });
}

function closePaymentModal() {
    const modal = document.getElementById("paymentDetailsModal");
    if (modal) modal.classList.add("hidden");
}

function toggleRejectForm() {
    const form = document.getElementById("inlineRejectForm");
    if (form) form.classList.toggle("hidden");
}

async function handleVerifyClick(paymentId) {
    if (!confirm("Are you sure you want to VERIFY this payment?\n\nBefore approving, make sure you have verified the receipt of ₹200 under this UTR in the hospital's bank or PhonePe account.")) {
        return;
    }

    try {
        const res = await fetch('/api/admin/payments/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': 'admin123'
            },
            body: JSON.stringify({ paymentId, adminId: 'admin@gmail.com' })
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
            throw new Error(result.error || "Verification failed");
        }
        alert("Payment verified successfully! The patient's appointment has been confirmed.");
        closePaymentModal();
        loadDashboard();
    } catch (err) {
        alert("Verification Error: " + err.message);
    }
}

async function handleRejectClick(paymentId) {
    const reason = prompt("Please enter the reason for rejecting this payment submission (e.g. Transaction ID not found in bank statement, Incorrect amount):");
    if (!reason || !reason.trim()) {
        if (reason !== null) alert("Rejection cancelled: A valid reason is required.");
        return;
    }
    submitRejectWithReason(paymentId, reason.trim());
}

async function submitReject(paymentId) {
    const input = document.getElementById("modalRejectionReason");
    const reason = input ? input.value.trim() : "";
    if (!reason) {
        alert("Please enter a valid rejection reason.");
        return;
    }
    submitRejectWithReason(paymentId, reason);
}

async function submitRejectWithReason(paymentId, reason) {
    try {
        const res = await fetch('/api/admin/payments/reject', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': 'admin123'
            },
            body: JSON.stringify({ paymentId, rejectionReason: reason, adminId: 'admin@gmail.com' })
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
            throw new Error(result.error || "Rejection failed");
        }
        alert("Payment submission marked as REJECTED.");
        closePaymentModal();
        loadDashboard();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

// ================================
// SHOW DOCTORS
// ================================

function renderDoctors() {

    const doctorTableBody =
        document.getElementById("doctorTableBody");


    let html = "";

    let totalDoctors = 0;


    Object.entries(doctors).forEach(function ([department, doctorList]) {

        doctorList.forEach(function (doctor) {

            totalDoctors++;


            html += `

                <tr>

                    <td>
                        <b>${doctor}</b>
                    </td>

                    <td>
                        ${department}
                    </td>

                    <td>
                        <span class="status-badge available">
                            AVAILABLE
                        </span>
                    </td>

                </tr>

            `;

        });

    });


    doctorTableBody.innerHTML = html;


    document.getElementById("doctorRecordCount").textContent =
        totalDoctors + " Doctors";

}


// ================================
// SHOW PATIENTS
// ================================

function renderPatients(records) {

    const patientTableBody =
        document.getElementById("patientTableBody");


    document.getElementById("patientRecordCount").textContent =
        records.length + " Patients";


    if (records.length === 0) {

        patientTableBody.innerHTML = `

            <tr>

                <td colspan="8">

                    No patient registrations found.

                </td>

            </tr>

        `;

        return;

    }


    patientTableBody.innerHTML = records.map(function (patient, index) {

        return `

            <tr onclick="showPatientDetails(${index})">

                <td>
                    <b>${patient.token}</b>
                </td>

                <td>
                    <small style="color:var(--muted); font-weight:600;">${patient.appointmentTime || '-'}</small>
                </td>

                <td>
                    ${patient.name}
                </td>

                <td>
                    ${patient.patientId}
                </td>

                <td>
                    ${patient.phone}
                </td>

                <td>
                    ${patient.department}
                </td>

                <td>
                    ${patient.doctor}
                </td>

                <td>
                    ${patient.date}
                </td>

                <td>

                    <span class="status-badge ${patient.status === 'WAITING' ? 'badge-warning' : (patient.status === 'IN_PROGRESS' ? 'badge-info' : 'badge-success')}">
                        ${patient.status.replace('_', ' ')}
                    </span>

                </td>

            </tr>

        `;

    }).join("");

}


// ================================
// SEARCH PATIENT
// ================================

const searchPatient =
    document.getElementById("searchPatient");


searchPatient.addEventListener("input", function () {

    const searchValue =
        searchPatient.value.toLowerCase().trim();


    const records = getRecords();


    const filteredRecords = records.filter(function (patient) {

        return (

            patient.name
                .toLowerCase()
                .includes(searchValue)

            ||

            patient.patientId
                .toLowerCase()
                .includes(searchValue)

        );

    });


    renderPatients(filteredRecords);

});


// ================================
// PATIENT DETAILS
// ================================

function showPatientDetails(index) {

    const records = getRecords();

    const patient = records[index];


    if (!patient) {
        return;
    }


    const patientDetails =
        document.getElementById("patientDetails");


    const detailsContent =
        document.getElementById("detailsContent");


    detailsContent.innerHTML = `

        <div class="details-grid">

            <div class="detail-item">
                <small>Patient Name</small>
                <b>${patient.name}</b>
            </div>

            <div class="detail-item">
                <small>Patient ID</small>
                <b>${patient.patientId}</b>
            </div>

            <div class="detail-item">
                <small>Mobile Number</small>
                <b>${patient.phone}</b>
            </div>

            <div class="detail-item">
                <small>Email</small>
                <b>${patient.email || "Not provided"}</b>
            </div>

            <div class="detail-item">
                <small>Date of Birth</small>
                <b>${patient.dob}</b>
            </div>

            <div class="detail-item">
                <small>Gender</small>
                <b>${patient.gender}</b>
            </div>

            <div class="detail-item">
                <small>Address</small>
                <b>${patient.address}</b>
            </div>

            <div class="detail-item">
                <small>City</small>
                <b>${patient.city}</b>
            </div>

            <div class="detail-item">
                <small>Department</small>
                <b>${patient.department}</b>
            </div>

            <div class="detail-item">
                <small>Doctor</small>
                <b>${patient.doctor}</b>
            </div>

            <div class="detail-item">
                <small>OPD Date</small>
                <b>${patient.date}</b>
            </div>

            <div class="detail-item">
                <small>Appointment Time</small>
                <b>${patient.appointmentTime || '-'}</b>
            </div>

            <div class="detail-item">
                <small>Token</small>
                <b>${patient.token}</b>
            </div>

            <div class="detail-item">
                <small>Chief Complaint</small>
                <b>${patient.complaint}</b>
            </div>

            <div class="detail-item">
                <small>Medical Conditions</small>
                <b>${patient.conditions || "None provided"}</b>
            </div>

            <div class="detail-item">
                <small>Current Medications</small>
                <b>${patient.medications || "None provided"}</b>
            </div>

            <div class="detail-item">
                <small>Allergies</small>
                <b>${patient.allergies || "None provided"}</b>
            </div>

            <div class="detail-item">
                <small>Previous Surgeries</small>
                <b>${patient.surgeries || "None provided"}</b>
            </div>

            <div class="detail-item">
                <small>Status</small>
                <b>${patient.status}</b>
            </div>

        </div>

    `;


    patientDetails.classList.remove("hidden");


    patientDetails.scrollIntoView({
        behavior: "smooth"
    });

}


// ================================
// CLOSE PATIENT DETAILS
// ================================

document.getElementById("closeDetails")
    .addEventListener("click", function () {

        document
            .getElementById("patientDetails")
            .classList.add("hidden");

    });


// ================================
// REFRESH
// ================================

document.getElementById("refreshBtn")
    .addEventListener("click", function () {

        const records = getRecords();

        loadDashboard();

        searchPatient.value = "";

    });


// ================================
// LOGOUT BUTTON INITIALLY HIDDEN
// ================================

logoutBtn.classList.add("hidden");