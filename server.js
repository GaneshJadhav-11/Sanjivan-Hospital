const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Support JSON payloads with base64 screenshots up to 10MB
app.use(express.json({ limit: '10mb' }));

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve static files (HTML, CSS, JS, uploads, QR code) from current directory
app.use(express.static(__dirname));

// Initialize SQLite database
const db = new sqlite3.Database('./hospital.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create patients table if not exists
        db.run(`CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patientId TEXT,
            token TEXT,
            name TEXT,
            phone TEXT,
            city TEXT,
            department TEXT,
            doctor TEXT,
            date TEXT,
            complaint TEXT,
            status TEXT
        )`, (err) => {
            if (!err) {
                db.run("ALTER TABLE patients ADD COLUMN appointmentTime TEXT", () => { });
            }
        });

        // Create status_history table
        db.run(`CREATE TABLE IF NOT EXISTS status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patientId TEXT NOT NULL,
            status TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            UNIQUE(patientId, status)
        )`);

        // Create payments table with all required fields
        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patientId TEXT NOT NULL,
            amount INTEGER NOT NULL,
            paymentMethod TEXT NOT NULL,
            status TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            transactionId TEXT,
            verified_by TEXT,
            verified_at TEXT,
            rejection_reason TEXT,
            screenshot_path TEXT,
            currency TEXT DEFAULT 'INR',
            UNIQUE(patientId)
        )`, (err) => {
            if (!err) {
                // Safely add any columns if they were missing from older table versions
                db.run("ALTER TABLE payments ADD COLUMN transactionId TEXT", () => { });
                db.run("ALTER TABLE payments ADD COLUMN verified_by TEXT", () => { });
                db.run("ALTER TABLE payments ADD COLUMN verified_at TEXT", () => { });
                db.run("ALTER TABLE payments ADD COLUMN rejection_reason TEXT", () => { });
                db.run("ALTER TABLE payments ADD COLUMN screenshot_path TEXT", () => { });
                db.run("ALTER TABLE payments ADD COLUMN currency TEXT DEFAULT 'INR'", () => { });
                db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transactionId ON payments(transactionId) WHERE transactionId IS NOT NULL", () => { });
            }
        });
    }
});

// Helper for admin authorization
function requireAdmin(req, res, next) {
    const adminKey = req.headers['x-admin-key'] || req.body.adminKey || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
    if (adminKey === 'admin123' || (req.body && req.body.adminEmail === 'admin@gmail.com' && req.body.adminPassword === 'admin123')) {
        return next();
    }
    return res.status(401).json({ success: false, error: "Unauthorized. Admin privileges required." });
}

// API endpoint to get all patients
app.get('/api/patients', (req, res) => {
    db.all("SELECT * FROM patients ORDER BY id DESC", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// API endpoint to register a new patient (initial status: PENDING_PAYMENT)
app.post('/api/patients', (req, res) => {
    const { name, phone, city, department, doctor, date, complaint } = req.body;

    if (!name || !phone || !date || !department || !doctor) {
        return res.status(400).json({ error: "Please fill in all required fields." });
    }

    // Check slot availability for the selected date (max 28 slots per date)
    db.get("SELECT COUNT(*) as dateCount FROM patients WHERE date = ? AND status != 'CANCELLED'", [date], (err, dateRow) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const dateCount = dateRow ? dateRow.dateCount : 0;
        if (dateCount >= 28) {
            return res.status(400).json({ error: "No OPD slots are available for this date. Please select another date." });
        }

        // Calculate slot time
        const startMins = 600 + (dateCount * 15);
        const endMins = startMins + 15;
        function formatTime(minutes) {
            let h = Math.floor(minutes / 60);
            let m = minutes % 60;
            let ampm = h >= 12 ? 'PM' : 'AM';
            let h12 = h % 12;
            if (h12 === 0) h12 = 12;
            return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
        }
        const appointmentTime = `${formatTime(startMins)} - ${formatTime(endMins)}`;

        // Calculate new token and patient ID
        db.get("SELECT COUNT(*) as totalCount FROM patients", (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            const num = String((row ? row.totalCount : 0) + 1).padStart(6, '0');
            const patientId = `PAT-2026-${num}`;
            const tokenNum = String((row ? row.totalCount : 0) + 1).padStart(3, '0');
            const token = `OPD-${tokenNum}`;
            const initialStatus = 'PENDING_PAYMENT';
            const timestamp = new Date().toISOString();

            const stmt = db.prepare(`INSERT INTO patients (patientId, token, name, phone, city, department, doctor, date, complaint, status, appointmentTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            stmt.run([patientId, token, name, phone, city, department, doctor, date, complaint, initialStatus, appointmentTime], function (err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                // Initial status history
                db.run("INSERT OR IGNORE INTO status_history (patientId, status, timestamp) VALUES (?, ?, ?)",
                    [patientId, initialStatus, timestamp],
                    function (historyErr) {
                        if (historyErr) console.error('Error inserting history:', historyErr);

                        // Also create initial payment record in PENDING_PAYMENT status
                        const fee = 200; // Strict consultation fee
                        db.run(`INSERT OR IGNORE INTO payments (patientId, amount, paymentMethod, status, timestamp, currency) VALUES (?, ?, 'UPI', 'PENDING_PAYMENT', ?, 'INR')`,
                            [patientId, fee, timestamp],
                            function (payErr) {
                                if (payErr) console.error('Error inserting initial payment:', payErr);

                                res.json({
                                    message: 'Registration initiated. Please proceed to payment.',
                                    patientId,
                                    token,
                                    name,
                                    phone,
                                    department,
                                    doctor,
                                    date,
                                    status: initialStatus,
                                    appointmentTime,
                                    fee
                                });
                            }
                        );
                    }
                );
            });
            stmt.finalize();
        });
    });
});

// API endpoint for submitting UPI Payment Transaction ID / UTR
app.post('/api/payments/submit', (req, res) => {
    const { patientId, phone, transactionId, screenshotBase64 } = req.body;

    if (!patientId || !transactionId) {
        return res.status(400).json({ success: false, error: "Patient ID and UPI Transaction ID / UTR are required." });
    }

    const cleanTxnId = String(transactionId).trim();
    // Validate format: alphanumeric, dashes, underscores, between 6 and 50 characters
    if (cleanTxnId.length < 6 || cleanTxnId.length > 50 || !/^[A-Za-z0-9_-]+$/.test(cleanTxnId)) {
        return res.status(400).json({
            success: false,
            error: "Invalid Transaction ID / UTR. Please enter a valid reference number (6-50 alphanumeric characters)."
        });
    }

    // Verify appointment exists and verify ownership if phone is supplied
    db.get("SELECT * FROM patients WHERE LOWER(patientId) = ?", [patientId.toLowerCase()], (err, patient) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        if (!patient) {
            return res.status(404).json({ success: false, error: "Appointment / Patient record not found." });
        }

        if (phone && patient.phone !== String(phone).trim()) {
            return res.status(403).json({ success: false, error: "Unauthorized: Mobile number does not match this appointment." });
        }

        // Check if this payment is already VERIFIED
        db.get("SELECT * FROM payments WHERE LOWER(patientId) = ?", [patientId.toLowerCase()], (payErr, existingPayment) => {
            if (payErr) {
                return res.status(500).json({ success: false, error: payErr.message });
            }

            if (existingPayment && existingPayment.status === 'VERIFIED') {
                return res.status(400).json({ success: false, error: "This payment is already verified and confirmed. No re-submission required." });
            }

            // Check if this transaction ID was already submitted by ANY OTHER patient
            db.get("SELECT patientId FROM payments WHERE transactionId = ? AND LOWER(patientId) != ?",
                [cleanTxnId, patientId.toLowerCase()],
                (dupErr, dupRow) => {
                    if (dupErr) {
                        return res.status(500).json({ success: false, error: dupErr.message });
                    }
                    if (dupRow) {
                        return res.status(400).json({
                            success: false,
                            error: "This UPI Transaction ID / UTR has already been submitted for another payment. Duplicate transaction references are not permitted."
                        });
                    }

                    // Handle optional screenshot upload safely
                    let savedScreenshotPath = null;
                    if (screenshotBase64) {
                        try {
                            const match = screenshotBase64.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
                            if (match) {
                                const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
                                const buffer = Buffer.from(match[2], 'base64');
                                // Max 5MB file size limit
                                if (buffer.length > 5 * 1024 * 1024) {
                                    return res.status(400).json({ success: false, error: "Screenshot file size exceeds 5MB limit." });
                                }
                                const sanitizedId = patientId.replace(/[^A-Za-z0-9_-]/g, '');
                                const fileName = `screenshot-${sanitizedId}-${Date.now()}.${ext}`;
                                const filePath = path.join(UPLOADS_DIR, fileName);
                                fs.writeFileSync(filePath, buffer);
                                savedScreenshotPath = `uploads/${fileName}`;
                            } else {
                                return res.status(400).json({ success: false, error: "Invalid image format for screenshot. Permitted types: PNG, JPG, JPEG, WEBP." });
                            }
                        } catch (uploadErr) {
                            console.error('Screenshot write error:', uploadErr);
                            return res.status(500).json({ success: false, error: "Failed to process screenshot file." });
                        }
                    }

                    const timestamp = new Date().toISOString();
                    const newStatus = 'PENDING_VERIFICATION';
                    const amount = 200; // Strictly enforced server-side

                    // Upsert payment row for this patient
                    db.run(`INSERT INTO payments (patientId, amount, paymentMethod, status, timestamp, transactionId, screenshot_path, currency, rejection_reason)
                            VALUES (?, ?, 'UPI', ?, ?, ?, ?, 'INR', NULL)
                            ON CONFLICT(patientId) DO UPDATE SET
                                transactionId = excluded.transactionId,
                                status = excluded.status,
                                timestamp = excluded.timestamp,
                                screenshot_path = COALESCE(excluded.screenshot_path, payments.screenshot_path),
                                rejection_reason = NULL`,
                        [patient.patientId, amount, newStatus, timestamp, cleanTxnId, savedScreenshotPath],
                        function (upsertErr) {
                            if (upsertErr) {
                                return res.status(500).json({ success: false, error: upsertErr.message });
                            }

                            // Update patient status to PENDING_VERIFICATION
                            db.run("UPDATE patients SET status = 'PENDING_VERIFICATION' WHERE patientId = ?", [patient.patientId], function (pErr) {
                                if (pErr) console.error('Error updating patient status:', pErr);

                                // Add entry in status history
                                db.run("INSERT OR IGNORE INTO status_history (patientId, status, timestamp) VALUES (?, 'PENDING_VERIFICATION', ?)",
                                    [patient.patientId, timestamp],
                                    function (hErr) {
                                        if (hErr) console.error('Error inserting history:', hErr);

                                        res.json({
                                            success: true,
                                            message: "Your payment details have been submitted successfully. Your payment is awaiting verification by the hospital administrator. Your appointment will be confirmed only after successful verification.",
                                            patientId: patient.patientId,
                                            token: patient.token,
                                            transactionId: cleanTxnId,
                                            status: 'PENDING_VERIFICATION',
                                            amount: 200
                                        });
                                    }
                                );
                            });
                        }
                    );
                }
            );
        });
    });
});

// API endpoint to get patient status (joined with payment verification info)
app.post('/api/status', (req, res) => {
    const { patientId, phone } = req.body;
    if (!patientId || !phone) {
        return res.status(400).json({ success: false, message: "Please enter Patient ID and Mobile number." });
    }

    const query = `
        SELECT 
            pt.*,
            p.id as paymentId,
            p.amount as paymentAmount,
            p.currency as paymentCurrency,
            p.paymentMethod,
            p.status as paymentStatus,
            p.transactionId,
            p.timestamp as paymentTimestamp,
            p.verified_by as verifiedBy,
            p.verified_at as verifiedAt,
            p.rejection_reason as rejectionReason,
            p.screenshot_path as screenshotPath
        FROM patients pt
        LEFT JOIN payments p ON pt.patientId = p.patientId
        WHERE LOWER(pt.patientId) = ? AND pt.phone = ?
    `;

    db.get(query, [patientId.toLowerCase().trim(), String(phone).trim()], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (row) {
            res.json({ success: true, data: row });
        } else {
            res.json({ success: false, message: 'Patient not found with the provided details. Please check your Patient ID and Mobile number.' });
        }
    });
});

// API endpoint to mark patient as in progress
app.post('/api/patients/progress', (req, res) => {
    const { patientId } = req.body;
    db.run("UPDATE patients SET status = 'IN_PROGRESS' WHERE patientId = ?", [patientId], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        db.run("INSERT OR IGNORE INTO status_history (patientId, status, timestamp) VALUES (?, ?, ?)",
            [patientId, 'IN_PROGRESS', new Date().toISOString()],
            function (historyErr) {
                if (historyErr) console.error('Error inserting history:', historyErr);
                res.json({ success: true, message: 'Patient marked as in progress' });
            }
        );
    });
});

// API endpoint to mark patient as completed
app.post('/api/patients/complete', (req, res) => {
    const { patientId } = req.body;
    db.run("UPDATE patients SET status = 'COMPLETED' WHERE patientId = ?", [patientId], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        db.run("INSERT OR IGNORE INTO status_history (patientId, status, timestamp) VALUES (?, ?, ?)",
            [patientId, 'COMPLETED', new Date().toISOString()],
            function (historyErr) {
                if (historyErr) console.error('Error inserting history:', historyErr);
                res.json({ success: true, message: 'Patient marked as completed' });
            }
        );
    });
});

// API endpoint to get patient status history
app.get('/api/patients/:patientId/history', (req, res) => {
    const { patientId } = req.params;
    db.get("SELECT COUNT(*) as count FROM patients WHERE LOWER(patientId) = ?", [patientId.toLowerCase()], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row || row.count === 0) {
            res.status(404).json({ success: false, message: 'Patient not found' });
            return;
        }

        db.all("SELECT status, timestamp FROM status_history WHERE LOWER(patientId) = ? ORDER BY id ASC", [patientId.toLowerCase()], (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true, history: rows });
        });
    });
});

// API endpoint to get all payments with patient and appointment details for Admin
app.get('/api/payments', (req, res) => {
    const query = `
        SELECT 
            p.id as paymentId,
            p.patientId,
            p.amount,
            p.currency,
            p.paymentMethod,
            p.status as paymentStatus,
            p.status,
            p.timestamp as submittedAt,
            p.timestamp,
            p.transactionId,
            p.verified_by as verifiedBy,
            p.verified_at as verifiedAt,
            p.rejection_reason as rejectionReason,
            p.screenshot_path as screenshotPath,
            pt.name as patientName,
            pt.phone as patientPhone,
            pt.doctor,
            pt.department,
            pt.date as appointmentDate,
            pt.appointmentTime,
            pt.status as appointmentStatus,
            pt.token
        FROM payments p
        LEFT JOIN patients pt ON p.patientId = pt.patientId
        ORDER BY p.id DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true, payments: rows });
    });
});

// API endpoint for Admin to manually VERIFY a payment
app.post('/api/admin/payments/verify', requireAdmin, (req, res) => {
    const { paymentId, adminId } = req.body;
    if (!paymentId) {
        return res.status(400).json({ success: false, error: "Payment ID is required." });
    }

    const verifiedBy = adminId || "admin@gmail.com";
    const verifiedAt = new Date().toISOString();

    // Fetch payment and associated patient
    db.get("SELECT p.*, pt.date as appointmentDate, pt.status as patientStatus FROM payments p JOIN patients pt ON p.patientId = pt.patientId WHERE p.id = ?",
        [paymentId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            if (!row) {
                return res.status(404).json({ success: false, error: "Payment record not found." });
            }
            if (row.status === 'VERIFIED') {
                return res.status(400).json({ success: false, error: "Payment is already verified." });
            }

            // Recheck slot availability for that date to prevent overbooking
            db.get("SELECT COUNT(*) as confirmedCount FROM patients WHERE date = ? AND status IN ('CONFIRMED', 'WAITING', 'IN_PROGRESS', 'COMPLETED') AND patientId != ?",
                [row.appointmentDate, row.patientId],
                (slotErr, slotRow) => {
                    if (slotErr) {
                        return res.status(500).json({ success: false, error: slotErr.message });
                    }
                    if (slotRow && slotRow.confirmedCount >= 28) {
                        return res.status(409).json({
                            success: false,
                            error: `Cannot confirm appointment. All 28 slots for date ${row.appointmentDate} have already been filled. Please reschedule the appointment.`
                        });
                    }

                    // Execute transactional update
                    db.serialize(() => {
                        db.run("BEGIN TRANSACTION");

                        db.run(
                            "UPDATE payments SET status = 'VERIFIED', verified_by = ?, verified_at = ?, rejection_reason = NULL WHERE id = ?",
                            [verifiedBy, verifiedAt, paymentId],
                            function (payUpdateErr) {
                                if (payUpdateErr) {
                                    db.run("ROLLBACK");
                                    return res.status(500).json({ success: false, error: "Failed to update payment status: " + payUpdateErr.message });
                                }

                                db.run(
                                    "UPDATE patients SET status = 'CONFIRMED' WHERE patientId = ?",
                                    [row.patientId],
                                    function (ptUpdateErr) {
                                        if (ptUpdateErr) {
                                            db.run("ROLLBACK");
                                            return res.status(500).json({ success: false, error: "Failed to update appointment status: " + ptUpdateErr.message });
                                        }

                                        db.run(
                                            "INSERT OR IGNORE INTO status_history (patientId, status, timestamp) VALUES (?, 'CONFIRMED', ?)",
                                            [row.patientId, verifiedAt],
                                            function (histErr) {
                                                if (histErr) console.error('Error inserting history:', histErr);

                                                db.run("COMMIT", (commitErr) => {
                                                    if (commitErr) {
                                                        db.run("ROLLBACK");
                                                        return res.status(500).json({ success: false, error: "Transaction commit failed: " + commitErr.message });
                                                    }

                                                    res.json({
                                                        success: true,
                                                        message: "Payment verified successfully. Appointment is now confirmed.",
                                                        paymentId,
                                                        patientId: row.patientId,
                                                        paymentStatus: 'VERIFIED',
                                                        appointmentStatus: 'CONFIRMED'
                                                    });
                                                });
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    });
                }
            );
        }
    );
});

// API endpoint for Admin to REJECT a payment
app.post('/api/admin/payments/reject', requireAdmin, (req, res) => {
    const { paymentId, rejectionReason, adminId } = req.body;
    if (!paymentId) {
        return res.status(400).json({ success: false, error: "Payment ID is required." });
    }
    if (!rejectionReason || !rejectionReason.trim()) {
        return res.status(400).json({ success: false, error: "A valid rejection reason is required." });
    }

    const verifiedBy = adminId || "admin@gmail.com";
    const verifiedAt = new Date().toISOString();
    const cleanReason = rejectionReason.trim();

    db.get("SELECT p.*, pt.status as patientStatus FROM payments p JOIN patients pt ON p.patientId = pt.patientId WHERE p.id = ?",
        [paymentId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            if (!row) {
                return res.status(404).json({ success: false, error: "Payment record not found." });
            }
            if (row.status === 'VERIFIED') {
                return res.status(400).json({ success: false, error: "Cannot reject an already verified payment." });
            }

            db.serialize(() => {
                db.run("BEGIN TRANSACTION");

                db.run(
                    "UPDATE payments SET status = 'REJECTED', rejection_reason = ?, verified_by = ?, verified_at = ? WHERE id = ?",
                    [cleanReason, verifiedBy, verifiedAt, paymentId],
                    function (payErr) {
                        if (payErr) {
                            db.run("ROLLBACK");
                            return res.status(500).json({ success: false, error: payErr.message });
                        }

                        db.run(
                            "UPDATE patients SET status = 'PAYMENT_REJECTED' WHERE patientId = ?",
                            [row.patientId],
                            function (ptErr) {
                                if (ptErr) {
                                    db.run("ROLLBACK");
                                    return res.status(500).json({ success: false, error: ptErr.message });
                                }

                                db.run(
                                    "INSERT OR IGNORE INTO status_history (patientId, status, timestamp) VALUES (?, 'PAYMENT_REJECTED', ?)",
                                    [row.patientId, verifiedAt],
                                    function (histErr) {
                                        if (histErr) console.error('Error inserting history:', histErr);

                                        db.run("COMMIT", (commitErr) => {
                                            if (commitErr) {
                                                db.run("ROLLBACK");
                                                return res.status(500).json({ success: false, error: commitErr.message });
                                            }

                                            res.json({
                                                success: true,
                                                message: "Payment rejected.",
                                                paymentId,
                                                patientId: row.patientId,
                                                paymentStatus: 'REJECTED',
                                                rejectionReason: cleanReason
                                            });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        }
    );
});

// Legacy API endpoint for backward compatibility
app.post('/api/payments', (req, res) => {
    const { patientId, amount, paymentMethod } = req.body;
    if (amount !== 200) {
        return res.status(400).json({ success: false, error: "Consultation fee is exactly 200." });
    }

    db.get("SELECT COUNT(*) as count FROM payments", (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        const num = String((row ? row.count : 0) + 1).padStart(5, '0');
        const d = new Date();
        const dateStr = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
        const transactionId = `LEGACY-TXN-${dateStr}-${num}`;
        const status = 'PENDING_VERIFICATION';
        const timestamp = new Date().toISOString();

        db.run(`INSERT INTO payments (patientId, amount, paymentMethod, status, timestamp, transactionId, currency)
                VALUES (?, ?, ?, ?, ?, ?, 'INR')
                ON CONFLICT(patientId) DO UPDATE SET transactionId = excluded.transactionId, status = excluded.status, timestamp = excluded.timestamp`,
            [patientId, amount, paymentMethod || 'UPI', status, timestamp, transactionId],
            function (insertErr) {
                if (insertErr) {
                    return res.status(500).json({ success: false, error: insertErr.message });
                }
                res.json({
                    success: true,
                    transactionId,
                    payment: { patientId, amount, paymentMethod, status, timestamp, transactionId }
                });
            }
        );
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

