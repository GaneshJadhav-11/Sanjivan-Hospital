const doctors = { "General Physician": ["Dr. Sujit Sonawane"] };
let page = 1;
const form = document.querySelector('#opdForm');

function handleQrError(img) {
    if (img) img.style.display = 'none';
    const fallback = document.getElementById('qrFallbackNotice');
    if (fallback) fallback.classList.remove('hidden');
}

function previewScreenshot(input) {
    const preview = document.getElementById('screenshotPreview');
    const container = document.getElementById('screenshotPreviewContainer');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 5 * 1024 * 1024) {
            alert("Screenshot file must be under 5MB.");
            input.value = "";
            if (container) container.classList.add('hidden');
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            if (preview) preview.src = e.target.result;
            if (container) container.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else {
        if (container) container.classList.add('hidden');
    }
}

if (form) {
    const pages = document.querySelectorAll('.form-page'), steps = document.querySelectorAll('.step');
    const dateInput = form.elements.date;
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dateInput.min = `${year}-${month}-${day}`;

    function showPage(n) {
        page = n;
        pages.forEach(p => p.classList.toggle('active', +p.dataset.page === n));
        steps.forEach((s, i) => s.classList.toggle('active', i < n));
        document.querySelector('#back').style.visibility = n === 1 ? 'hidden' : 'visible';
        document.querySelector('#next').style.display = n === 5 ? 'none' : 'inline-flex';
        document.querySelector('.submit').style.display = n === 5 ? 'inline-flex' : 'none';
        if (n === 4) review();
        if (n === 5) {
            const summaryNameElem = document.getElementById('summaryPatientName');
            if (summaryNameElem) summaryNameElem.innerText = value('name');

            const summaryDocElem = document.getElementById('summaryDoctorInfo');
            if (summaryDocElem) summaryDocElem.innerText = `${value('doctor')} (${value('department')})`;

            const summaryDateElem = document.getElementById('summaryDate');
            if (summaryDateElem) summaryDateElem.innerText = value('date');
        }
    }

    document.querySelector('#next').onclick = () => {
        const fields = pages[page - 1].querySelectorAll('input,select,textarea');
        for (const f of fields) if (!f.checkValidity()) { f.reportValidity(); return; }
        showPage(page + 1);
    };

    document.querySelector('#back').onclick = () => showPage(page - 1);

    document.querySelector('#department').onchange = e => {
        const select = document.querySelector('#doctor');
        select.innerHTML = '<option value="">Select doctor</option>' + (doctors[e.target.value] || []).map(d => `<option>${d}</option>`).join('');
    };

    function value(n) { return form.elements[n].value || 'Not provided'; }
    function review() {
        document.querySelector('#review').innerHTML = `<h4>Personal information</h4><p>${value('name')} · ${value('phone')} · ${value('city')}</p><h4>OPD information</h4><p>${value('department')} · ${value('doctor')} · ${value('date')}</p><h4>Medical information</h4><p>${value('conditions')}</p>`;
    }

    form.onsubmit = async e => {
        e.preventDefault();
        if (!document.querySelector('#confirm').checked) {
            alert('Please confirm the information is correct.'); return;
        }

        const txnInput = document.getElementById('upiTransactionId');
        const transactionId = txnInput ? txnInput.value.trim() : '';
        if (!transactionId) {
            alert('Please enter your UPI Transaction Reference ID / UTR number.');
            if (txnInput) txnInput.focus();
            return;
        }

        const submitBtn = document.querySelector('#submitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting Payment Details...';

        const fd = new FormData(form), data = Object.fromEntries(fd.entries());
        let patientResult = null;

        try {
            // Read optional screenshot file as base64
            let screenshotBase64 = null;
            const fileInput = document.getElementById('upiScreenshot');
            if (fileInput && fileInput.files && fileInput.files[0]) {
                const file = fileInput.files[0];
                screenshotBase64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }

            // 1. Register Patient with initial PENDING_PAYMENT status
            const res = await fetch('/api/patients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Registration failed');
            patientResult = result;

            // 2. Submit UPI Transaction Reference / UTR
            const payRes = await fetch('/api/payments/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientId: patientResult.patientId,
                    phone: data.phone,
                    transactionId: transactionId,
                    screenshotBase64: screenshotBase64
                })
            });
            const payResult = await payRes.json();
            if (!payRes.ok || !payResult.success) {
                throw new Error(payResult.error || "Payment submission failed");
            }

            // 3. Display Success Pending Verification Slip
            document.querySelector('#slip').innerHTML = `
                <div class="slip-grid">
                    <div><small>Patient Name</small><b>${patientResult.name}</b></div>
                    <div><small>Patient ID</small><b>${patientResult.patientId}</b></div>
                    <div><small>OPD Token</small><b>${patientResult.token}</b></div>
                    <div><small>Department / Doctor</small><b>${patientResult.department}<br>${patientResult.doctor}</b></div>
                    <div><small>OPD Date</small><b>${patientResult.date}</b></div>
                    <div><small>Slot Time</small><b>${patientResult.appointmentTime}</b></div>
                    <div><small>Appointment Status</small><b class="badge badge-warning" style="background:#fef3c7; color:#b45309; padding:4px 10px; border-radius:999px;">AWAITING VERIFICATION</b></div>
                    <div><small>Payment Status</small><b class="badge badge-warning" style="background:#fef3c7; color:#b45309; padding:4px 10px; border-radius:999px;">PENDING VERIFICATION</b></div>
                    
                    <div style="grid-column: span 2; border-top: 1px solid var(--line); margin-top: 10px; padding-top: 10px; background: #fafafa; padding: 12px; border-radius: 8px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>Consultation Fee:</span><strong>₹200</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>Payment Method:</span><strong>Official Hospital UPI QR</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span>Submitted UTR / Txn ID:</span><strong style="font-family: monospace; color: var(--primary-deep);">${payResult.transactionId}</strong>
                        </div>
                        <div style="margin-top: 8px; font-size: 0.85rem; color: #856404; background: #fff3cd; padding: 8px 12px; border-radius: 6px; border: 1px solid #ffeeba;">
                            ⏳ <b>Notice:</b> The hospital administrator will verify this transaction against actual bank records. Your appointment will be confirmed once verification is complete.
                        </div>
                    </div>
                </div>
            `;
            document.querySelector('#success').classList.remove('hidden');
            document.querySelector('#success').scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            alert('Error: ' + err.message + (patientResult ? ` (Patient ID: ${patientResult.patientId})` : ''));
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Payment Details (₹200) →';
        }
    };
}

// ==========================================
// PATIENT STATUS PORTAL INTEGRATION
// ==========================================
const statusForm = document.querySelector('#statusForm');
if (statusForm) {
    statusForm.onsubmit = async e => {
        e.preventDefault();
        loadPatientStatus(document.getElementById('statusId').value.trim(), document.getElementById('statusPhone').value.trim());
    };
}

async function loadPatientStatus(patientId, phone) {
    try {
        const res = await fetch('/api/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId, phone })
        });
        const result = await res.json();
        if (result.success) {
            const r = result.data;
            const payStatus = r.paymentStatus || 'PENDING_PAYMENT';
            const isConfirmed = r.status === 'CONFIRMED' || r.status === 'WAITING' || r.status === 'IN_PROGRESS' || r.status === 'COMPLETED';

            let paymentBadge = '';
            let paymentBanner = '';

            if (payStatus === 'VERIFIED') {
                paymentBadge = `<span class="badge badge-success" style="background:#d1fae5; color:#047857; padding:4px 10px; border-radius:999px;">✓ Payment Verified</span>`;
                paymentBanner = `
                    <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:12px; margin-top:12px; color:#065f46;">
                        <strong style="display:block; font-size:1rem; margin-bottom:4px;">✓ Payment Verified · Appointment Confirmed</strong>
                        <p style="margin:0; font-size:0.88rem;">Your payment of ₹${r.paymentAmount || 200} has been verified by the hospital administrator. Your appointment is confirmed.</p>
                        <small style="display:block; margin-top:6px; color:#047857;">Transaction ID: <span style="font-family:monospace; font-weight:bold;">${r.transactionId || 'N/A'}</span></small>
                    </div>
                `;
            } else if (payStatus === 'PENDING_VERIFICATION') {
                paymentBadge = `<span class="badge badge-warning" style="background:#fef3c7; color:#b45309; padding:4px 10px; border-radius:999px;">⏳ Payment Verification Pending</span>`;
                paymentBanner = `
                    <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:14px; margin-top:12px; color:#92400e;">
                        <strong style="display:block; font-size:1rem; margin-bottom:4px;">⏳ Payment Verification Pending</strong>
                        <p style="margin:0; font-size:0.88rem; line-height:1.4;">
                            Your payment details have been submitted. Please wait while the hospital verifies your transaction. Your appointment will be confirmed only after successful verification.
                        </p>
                        <div style="margin-top:8px; font-size:0.85rem;">
                            Submitted UTR / Transaction ID: <strong style="font-family:monospace;">${r.transactionId || 'N/A'}</strong><br>
                            Amount: <strong>₹${r.paymentAmount || 200}</strong>
                        </div>
                    </div>
                `;
            } else if (payStatus === 'REJECTED') {
                paymentBadge = `<span class="badge badge-danger" style="background:#fee2e2; color:#b91c1c; padding:4px 10px; border-radius:999px;">✕ Payment Verification Rejected</span>`;
                paymentBanner = `
                    <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:14px; margin-top:12px; color:#991b1b;">
                        <strong style="display:block; font-size:1rem; margin-bottom:4px;">✕ Payment Verification Rejected</strong>
                        <p style="margin:0; font-size:0.88rem; line-height:1.4;">
                            <b>Rejection Reason:</b> ${r.rejectionReason || "Transaction could not be verified in the hospital's bank records."}
                        </p>
                        <p style="margin:8px 0 0 0; font-size:0.85rem; color:#7f1d1d;">
                            Your appointment is not confirmed. Please verify your payment details and resubmit a genuine UPI Transaction ID / UTR below.
                        </p>
                    </div>
                    
                    <!-- Resubmission Box -->
                    <div style="background:#ffffff; border:2px solid var(--primary); border-radius:12px; padding:16px; margin-top:16px;">
                        <h4 style="margin:0 0 8px 0; color:var(--secondary);">Resubmit UPI Payment Details</h4>
                        <p style="font-size:0.85rem; color:var(--muted); margin-bottom:12px;">Scan the official hospital QR code below, pay ₹200, and submit your valid transaction reference.</p>
                        
                        <div style="text-align:center; margin-bottom:12px;">
                            <img src="hospital-qr.jpg" alt="Official Hospital QR" style="max-width:180px; border-radius:8px; border:1px solid #ddd;">
                        </div>

                        <form id="resubmitPaymentForm" onsubmit="handleResubmitPayment(event, '${r.patientId}', '${r.phone}')">
                            <label style="display:block; text-align:left; font-weight:600; font-size:0.9rem; margin-bottom:8px;">
                                Valid UPI Transaction ID / UTR *
                                <input type="text" id="resubmitTxnId" required placeholder="e.g. 429182749102" pattern="[A-Za-z0-9_-]{6,50}" style="display:block; width:100%; padding:8px 12px; margin-top:4px; border:1px solid #ccc; border-radius:6px;">
                            </label>
                            <label style="display:block; text-align:left; font-weight:600; font-size:0.9rem; margin-bottom:12px;">
                                New Payment Screenshot (Optional)
                                <input type="file" id="resubmitScreenshot" accept="image/png, image/jpeg, image/jpg, image/webp" style="display:block; margin-top:4px;">
                            </label>
                            <button type="submit" id="resubmitBtn" class="btn primary" style="width:100%;">Resubmit Payment Details (₹200) →</button>
                        </form>
                    </div>
                `;
            } else {
                paymentBadge = `<span class="badge" style="background:#e2e8f0; color:#475569; padding:4px 10px; border-radius:999px;">Awaiting Payment</span>`;
                paymentBanner = `
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-top:12px;">
                        <strong style="display:block; font-size:1rem; margin-bottom:4px; color:var(--secondary);">Payment Required</strong>
                        <p style="margin:0; font-size:0.88rem; color:var(--muted);">Please complete payment of ₹200 using the hospital QR code and submit your UTR to confirm this appointment.</p>
                    </div>
                `;
            }

            const apptBadgeClass = (r.status === 'CONFIRMED' || r.status === 'COMPLETED') ? 'badge-success' : (r.status === 'IN_PROGRESS' ? 'badge-info' : 'badge-warning');
            const waitText = r.status === 'WAITING' ? '&nbsp; Estimated wait: 15 mins' : (r.status === 'IN_PROGRESS' ? '&nbsp; Consultation in progress...' : '');

            let html = `
                <div class="status-result" style="text-align:left;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; border-bottom:1px solid var(--line); padding-bottom:12px; margin-bottom:12px;">
                        <div>
                            <span style="font-size:1.2rem; font-weight:800; color:var(--secondary);">${r.name}</span>
                            <span style="color:var(--muted); font-size:0.9rem; margin-left:8px;">${r.patientId} · Token: <b>${r.token}</b></span>
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;">
                            <span class="badge ${apptBadgeClass}">${r.status.replace('_', ' ')}</span>
                            ${paymentBadge}
                        </div>
                    </div>

                    <div style="font-size:0.92rem; color:var(--ink); line-height:1.6;">
                        <b>Doctor:</b> ${r.doctor} (${r.department})<br>
                        <b>OPD Date:</b> ${r.date} ${r.appointmentTime ? '· <b>Time:</b> ' + r.appointmentTime : ''}
                    </div>

                    ${paymentBanner}
            `;

            try {
                const histRes = await fetch(`/api/patients/${r.patientId}/history`);
                const histResult = await histRes.json();

                html += `<div style="text-align:left; border-top:1px solid var(--line); margin-top:1.5rem; padding-top:1rem;">
                    <div style="font-weight:bold; color:var(--secondary); margin-bottom:1rem; font-size:1.1rem;">OPD & Payment History</div>`;

                if (histResult.success && histResult.history.length > 0) {
                    html += `<div style="display:flex; flex-direction:column; gap:0.75rem;">`;
                    histResult.history.forEach(item => {
                        const time = new Date(item.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                        let label = item.status.replace('_', ' ');
                        let color = 'var(--primary-deep)';
                        if (item.status === 'CONFIRMED' || item.status === 'COMPLETED') color = 'var(--success)';
                        if (item.status === 'PAYMENT_REJECTED') color = 'var(--red, #b91c1c)';
                        html += `<div>
                            <div style="color:${color}; font-weight:bold;">• ${label}</div>
                            <div style="color:var(--muted); font-size:0.85em; margin-left:1.2rem;">${time}</div>
                        </div>`;
                    });
                    html += `</div>`;
                } else {
                    html += `<div style="color:var(--muted); font-size:0.9em;">No status history available.</div>`;
                }
                html += `</div></div>`;
            } catch (e) {
                html += `</div>`;
            }

            document.querySelector('#statusResult').innerHTML = html;
        } else {
            document.querySelector('#statusResult').innerHTML = '<div class="status-result" style="color:#b91c1c;">We could not find a matching registration. Please check your Patient ID and mobile number.</div>';
        }
    } catch (err) {
        console.error(err);
    }
}

async function handleResubmitPayment(e, patientId, phone) {
    e.preventDefault();
    const txnInput = document.getElementById('resubmitTxnId');
    const transactionId = txnInput ? txnInput.value.trim() : '';
    if (!transactionId) {
        alert("Please enter a valid Transaction ID / UTR.");
        return;
    }

    const btn = document.getElementById('resubmitBtn');
    btn.disabled = true;
    btn.textContent = "Submitting...";

    let screenshotBase64 = null;
    const fileInput = document.getElementById('resubmitScreenshot');
    if (fileInput && fileInput.files && fileInput.files[0]) {
        screenshotBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(fileInput.files[0]);
        });
    }

    try {
        const res = await fetch('/api/payments/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId, phone, transactionId, screenshotBase64 })
        });
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.error || "Submission failed");
        alert(result.message);
        loadPatientStatus(patientId, phone);
    } catch (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
        btn.textContent = "Resubmit Payment Details (₹200) →";
    }
}

