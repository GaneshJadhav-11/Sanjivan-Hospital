const loginForm = document.getElementById("loginForm");
const loginSection = document.getElementById("loginSection");
const dashboard = document.getElementById("dashboard");
const loginMessage = document.getElementById("loginMessage");
const logoutBtn = document.getElementById("logoutBtn");

const DOCTOR_EMAIL = "doctor@gmail.com";
const DOCTOR_PASSWORD = "doc123";
const DOCTOR_NAME = "Dr. Sujit Sonawane";

loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const email = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (email === DOCTOR_EMAIL && password === DOCTOR_PASSWORD) {
        loginSection.classList.add("hidden");
        dashboard.classList.remove("hidden");
        logoutBtn.classList.remove("hidden");
        loginMessage.textContent = "";
        loadDashboard();
    } else {
        loginMessage.textContent = "Invalid credentials.";
    }
});

logoutBtn.addEventListener("click", function () {
    dashboard.classList.add("hidden");
    loginSection.classList.remove("hidden");
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
});
logoutBtn.classList.add("hidden");

let currentRecords = [];
let upcomingRecords = [];
let rawRecords = [];

async function fetchRecords() {
    try {
        const res = await fetch('/api/patients');
        const allRecords = await res.json();
        
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;
        
        rawRecords = allRecords.filter(p => p.doctor === DOCTOR_NAME);
        
        currentRecords = rawRecords.filter(p => p.date === today)
            .sort((a, b) => a.id - b.id);
        
        upcomingRecords = rawRecords
            .filter(p => p.date > today && p.status !== "COMPLETED")
            .sort((a, b) => {
                const dateCmp = a.date.localeCompare(b.date);
                if (dateCmp !== 0) return dateCmp;
                return a.id - b.id;
            });
            
    } catch(e) {
        console.error(e);
        currentRecords = [];
        upcomingRecords = [];
        rawRecords = [];
    }
}

async function loadDashboard() {
    await fetchRecords();
    
    document.getElementById("totalCount").textContent = currentRecords.length;
    document.getElementById("waitingCount").textContent = currentRecords.filter(p => p.status === "WAITING" || p.status === "CONFIRMED").length;
    document.getElementById("completedCount").textContent = currentRecords.filter(p => p.status === "COMPLETED").length;
    
    renderPatients(currentRecords);
    renderUpcomingPatients(upcomingRecords);
}

function renderPatients(records) {
    const patientTableBody = document.getElementById("patientTableBody");
    document.getElementById("patientRecordCount").textContent = records.length + " Patients";

    if (records.length === 0) {
        patientTableBody.innerHTML = `<tr><td colspan="6">No appointments scheduled for today.</td></tr>`;
        return;
    }

    patientTableBody.innerHTML = records.map(function (patient) {
        let badgeClass = 'badge-success';
        if (patient.status === 'WAITING' || patient.status === 'PENDING_VERIFICATION') badgeClass = 'badge-warning';
        if (patient.status === 'IN_PROGRESS') badgeClass = 'badge-info';
        if (patient.status === 'PAYMENT_REJECTED') badgeClass = 'badge-danger';
        
        let actionHTML = `<span style="color:var(--muted)">Done</span>`;
        if (patient.status === 'WAITING' || patient.status === 'CONFIRMED') {
            actionHTML = `<button onclick="markProgress('${patient.patientId}')" style="background:var(--primary); color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:bold;">Start Consultation</button>`;
        } else if (patient.status === 'IN_PROGRESS') {
            actionHTML = `<button onclick="markCompleted('${patient.patientId}')" style="background:var(--success); color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:bold;">Finish Consultation</button>`;
        } else if (patient.status === 'PENDING_VERIFICATION') {
            actionHTML = `<span style="color:var(--muted); font-size:0.85em; font-weight:600;">Awaiting Payment Verification</span>`;
        } else if (patient.status === 'PAYMENT_REJECTED') {
            actionHTML = `<span style="color:var(--red, #b91c1c); font-size:0.85em; font-weight:600;">Payment Rejected</span>`;
        }

        return `
            <tr>
                <td><b>${patient.token}</b></td>
                <td><small style="color:var(--muted); font-weight:600;">${patient.appointmentTime || '-'}</small></td>
                <td><a href="#" onclick="showPatientDetails('${patient.patientId}'); return false;" style="color:var(--primary); font-weight:bold; text-decoration:none;">${patient.name}</a></td>
                <td>${patient.patientId}</td>
                <td>${patient.complaint}</td>
                <td><span class="status-badge ${badgeClass}">${patient.status.replace('_', ' ')}</span></td>
                <td>${actionHTML}</td>
            </tr>
        `;
    }).join("");
}

function renderUpcomingPatients(records) {
    const upcomingTableBody = document.getElementById("upcomingTableBody");
    document.getElementById("upcomingRecordCount").textContent = records.length + " Patients";

    if (records.length === 0) {
        upcomingTableBody.innerHTML = `<tr><td colspan="6">No upcoming appointments.</td></tr>`;
        return;
    }

    upcomingTableBody.innerHTML = records.map(function (patient) {
        let badgeClass = 'badge-success';
        if (patient.status === 'WAITING') badgeClass = 'badge-warning';
        if (patient.status === 'IN_PROGRESS') badgeClass = 'badge-info';
        
        return `
            <tr>
                <td><b>${patient.date}</b></td>
                <td><b>${patient.token}</b></td>
                <td><small style="color:var(--muted); font-weight:600;">${patient.appointmentTime || '-'}</small></td>
                <td><a href="#" onclick="showPatientDetails('${patient.patientId}'); return false;" style="color:var(--primary); font-weight:bold; text-decoration:none;">${patient.name}</a></td>
                <td>${patient.patientId}</td>
                <td>${patient.complaint}</td>
                <td><span class="status-badge ${badgeClass}">${patient.status.replace('_', ' ')}</span></td>
            </tr>
        `;
    }).join("");
}

const searchPatient = document.getElementById("searchPatient");
searchPatient.addEventListener("input", function () {
    const searchValue = searchPatient.value.toLowerCase().trim();
    
    const filteredCurrent = currentRecords.filter(function (patient) {
        return patient.name.toLowerCase().includes(searchValue) || patient.patientId.toLowerCase().includes(searchValue);
    });
    renderPatients(filteredCurrent);
    
    const filteredUpcoming = upcomingRecords.filter(function (patient) {
        return patient.name.toLowerCase().includes(searchValue) || patient.patientId.toLowerCase().includes(searchValue);
    });
    renderUpcomingPatients(filteredUpcoming);
});

function showPatientDetails(patientId) {
    const patient = rawRecords.find(p => p.patientId === patientId);
    if (!patient) return;

    const patientDetails = document.getElementById("patientDetails");
    const detailsContent = document.getElementById("detailsContent");

    detailsContent.innerHTML = `
        <div class="details-grid">
            <div class="detail-item"><small>Patient Name</small><b>${patient.name}</b></div>
            <div class="detail-item"><small>Patient ID</small><b>${patient.patientId}</b></div>
            <div class="detail-item"><small>Mobile Number</small><b>${patient.phone}</b></div>
            <div class="detail-item"><small>OPD Date</small><b>${patient.date}</b></div>
            <div class="detail-item"><small>Appointment Time</small><b>${patient.appointmentTime || '-'}</b></div>
            <div class="detail-item"><small>Chief Complaint</small><b>${patient.complaint}</b></div>
            <div class="detail-item" style="grid-column: span 2"><small>Medical Conditions</small><b>${patient.conditions || "None provided"}</b></div>
            <div class="detail-item" style="grid-column: span 2"><small>Current Medications</small><b>${patient.medications || "None provided"}</b></div>
            <div class="detail-item" style="grid-column: span 2"><small>Allergies</small><b>${patient.allergies || "None provided"}</b></div>
        </div>
    `;

    patientDetails.classList.remove("hidden");
    patientDetails.scrollIntoView({ behavior: "smooth" });
}

document.getElementById("closeDetails").addEventListener("click", function () {
    document.getElementById("patientDetails").classList.add("hidden");
});

document.getElementById("refreshBtn").addEventListener("click", function () {
    loadDashboard();
    searchPatient.value = "";
});

async function markProgress(patientId) {
    try {
        await fetch('/api/patients/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId })
        });
        loadDashboard();
    } catch(err) {
        console.error(err);
    }
}

async function markCompleted(patientId) {
    // In a real app, we'd make a PUT/PATCH request to update status.
    // For now, let's just create an endpoint on the server to handle status updates.
    try {
        await fetch('/api/patients/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId })
        });
        loadDashboard();
    } catch(err) {
        console.error(err);
    }
}
