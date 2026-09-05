require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Static files serve karne ke liye (public/ folder ek level upar hai)
app.use(express.static(path.join(__dirname, '../public')));

// ---------------- CREDENTIALS (from environment variables — NEVER hardcode) ----------------
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// ---------------- REQUIRED ENV VAR CHECK ----------------
// Ye backend Firebase Admin SDK (service account) ke bina bilkul kaam nahi
// karega — is liye missing/garbage config par turant fail hona zaroori hai,
// warna silent errors milte rehte hain jab order place hota hai.
const REQUIRED_ENV_VARS = [
    'OWNER_EMAIL',
    'GMAIL_APP_PASSWORD',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_DATABASE_URL',
];

const missingVars = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
if (missingVars.length > 0) {
    console.error('FATAL: Missing required environment variables:', missingVars.join(', '));
    console.error('Set these in your .env file (local) or your host\'s environment variables dashboard (Render/Railway/etc).');
    process.exit(1);
}

// ---------------- FIREBASE ADMIN SETUP (Realtime Database) ----------------
// IMPORTANT: This is DIFFERENT from the firebaseConfig object used in
// index.html. That one is the public client SDK config (safe to expose in
// browser code). THIS one is a Service Account key — it must stay secret
// and only ever live in server-side environment variables, never in a
// client-facing file or committed to git.
//
// How to get FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY:
//   Firebase Console -> Project Settings -> Service Accounts ->
//   "Generate new private key" -> downloads a JSON file with these 3 fields
//   (called project_id, client_email, private_key in the JSON).
//
// Private key env vars mein \n ki jagah literal "\n" store hota hai, isliye
// replace zaroori hai warna Firebase Admin init fail hoga.
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();
const ordersRef = db.ref('orders');
const usersRef = db.ref('users');

// Transporter Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: OWNER_EMAIL,
        pass: GMAIL_APP_PASSWORD,
    }
});

// Verify email transporter on boot so a bad Gmail App Password is caught
// immediately instead of only failing the first time a customer orders.
transporter.verify((err) => {
    if (err) {
        console.error('WARNING: Nodemailer transporter verification failed. Emails will NOT send until this is fixed:', err.message);
    } else {
        console.log('Nodemailer transporter verified — ready to send emails.');
    }
});

// Basic HTML-escaping so user-supplied order/customer data can't break the
// email markup (defensive; low risk here but cheap to add).
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Helper for Order Items Table (Product Pic, Name, Qty, Price)
function generateItemsTableHTML(cartItems) {
    if (!cartItems || !cartItems.length) return '';
    return cartItems.map(item => `
        <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 10px; text-align: center;">
                <img src="${escapeHTML(item.image || 'https://via.placeholder.com/50')}" alt="${escapeHTML(item.name)}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid #334155;">
            </td>
            <td style="padding: 10px; color: #f8fafc; font-size: 13px;">${escapeHTML(item.name)} (${escapeHTML(item.size || 'N/A')})</td>
            <td style="padding: 10px; color: #94a3b8; font-size: 13px; text-align: center;">${item.qty}</td>
            <td style="padding: 10px; color: #38bdf8; font-size: 13px; text-align: right; font-weight: bold;">Rs. ${(item.price * item.qty).toLocaleString()}</td>
        </tr>
    `).join('');
}

// 1. New Order Email Template
function generateOrderEmailHTML(order, baseUrl) {
    const itemsList = generateItemsTableHTML(order.cart_items);
    const easypaisaDetails = order.paymentMethod === 'Easypaisa' ? `
        <div style="background-color: #064e3b; border: 1px solid #059669; padding: 12px; border-radius: 8px; margin-top: 15px;">
            <p style="color: #34d399; margin: 0; font-size: 13px; font-weight: bold;">Easypaisa Payment Details:</p>
            <p style="color: #ecfdf5; margin: 4px 0 0 0; font-size: 12px;"><b>Account Name:</b> ${escapeHTML(order.easypaisaAccountName || 'N/A')}</p>
            <p style="color: #ecfdf5; margin: 2px 0 0 0; font-size: 12px;"><b>Account Number:</b> ${escapeHTML(order.easypaisaAccountNo || 'N/A')}</p>
            <p style="color: #ecfdf5; margin: 2px 0 0 0; font-size: 12px;"><b>TRX ID:</b> ${escapeHTML(order.trxId || 'N/A')}</p>
        </div>
    ` : '';

    const approveUrl = `${baseUrl}/api/orders/approve/${encodeURIComponent(order.orderId)}`;
    const rejectUrl = `${baseUrl}/api/orders/reject/${encodeURIComponent(order.orderId)}`;

    return `
    <div style="background-color: #090d16; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 24px;">
            <h2 style="color: #38bdf8; margin-top: 0; font-size: 20px; border-bottom: 1px solid #1e293b; padding-bottom: 12px;">🛍️ NEW ORDER RECEIVED 📦 [${escapeHTML(order.orderId)}]</h2>

            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Customer Name:</b> ${escapeHTML(order.customer_name)}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Phone Number:</b> ${escapeHTML(order.customer_phone)}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>User Email:</b> ${escapeHTML(order.userEmail)}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Delivery Address:</b> ${escapeHTML(order.customer_address)}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Payment Method:</b> <span style="color: #facc15; font-weight: bold;">${escapeHTML(order.paymentMethod)}</span></p>

            ${easypaisaDetails}

            <h3 style="color: #f8fafc; font-size: 15px; margin-top: 20px;">Order Items:</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <thead>
                    <tr style="background-color: #1e293b; color: #94a3b8; font-size: 12px; text-align: left;">
                        <th style="padding: 8px; text-align: center;">Image</th>
                        <th style="padding: 8px;">Item</th>
                        <th style="padding: 8px; text-align: center;">Qty</th>
                        <th style="padding: 8px; text-align: right;">Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsList}
                </tbody>
            </table>

            <h3 style="text-align: right; color: #38bdf8; font-size: 18px; margin-top: 15px;">Total: ${escapeHTML(order.grand_total)}</h3>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #1e293b; text-align: center;">
                <a href="${approveUrl}" target="_blank" style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; margin-right: 10px;">APPROVE ORDER</a>
                <a href="${rejectUrl}" target="_blank" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">REJECT ORDER</a>
            </div>
        </div>
    </div>
    `;
}

// 2. Order Cancellation Email Template
function generateCancellationEmailHTML(order) {
    const itemsList = generateItemsTableHTML(order.cart_items);
    return `
    <div style="background-color: #090d16; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #ef4444; border-radius: 12px; padding: 24px;">
            <h2 style="color: #ef4444; margin-top: 0; font-size: 20px; border-bottom: 1px solid #1e293b; padding-bottom: 12px;">❌ ORDER CANCELLED ❌ [${escapeHTML(order.orderId)}]</h2>

            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Customer Name:</b> ${escapeHTML(order.customer_name || 'N/A')}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Phone Number:</b> ${escapeHTML(order.customer_phone || 'N/A')}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>User Email:</b> ${escapeHTML(order.userEmail || 'N/A')}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Delivery Address:</b> ${escapeHTML(order.customer_address || 'N/A')}</p>

            <h3 style="color: #f8fafc; font-size: 15px; margin-top: 20px;">Cancelled Items:</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <thead>
                    <tr style="background-color: #1e293b; color: #94a3b8; font-size: 12px; text-align: left;">
                        <th style="padding: 8px; text-align: center;">Image</th>
                        <th style="padding: 8px;">Item</th>
                        <th style="padding: 8px; text-align: center;">Qty</th>
                        <th style="padding: 8px; text-align: right;">Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsList}
                </tbody>
            </table>

            <h3 style="text-align: right; color: #ef4444; font-size: 18px; margin-top: 15px;">Total Amount: ${escapeHTML(order.grand_total || 'N/A')}</h3>
        </div>
    </div>
    `;
}

// 3. New User Registration Email Template
function generateSignupEmailHTML(user) {
    return `
    <div style="background-color: #090d16; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #3b82f6; border-radius: 12px; padding: 24px;">
            <h2 style="color: #60a5fa; margin-top: 0; font-size: 20px; border-bottom: 1px solid #1e293b; padding-bottom: 12px;">🎉 NEW CUSTOMER REGISTERED 👤</h2>

            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Customer Name:</b> ${escapeHTML(user.name || 'N/A')}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Email Address:</b> ${escapeHTML(user.email)}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Phone Number:</b> ${escapeHTML(user.phone || 'N/A')}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Registered On:</b> ${new Date().toLocaleString()}</p>
        </div>
    </div>
    `;
}

// ---------------- API ROUTES ----------------
// NOTE: With Firebase Auth handling signup/login on the frontend now, and
// the frontend writing orders directly to Realtime Database, these routes
// exist PURELY to send email notifications. They are best-effort — if an
// email fails, the underlying data (already saved by the frontend, or saved
// here as a fallback for /api/orders/new) is not lost.

// Route: New User Registration Notification (called after Firebase Auth signup succeeds)
app.post('/api/users/signup', async (req, res) => {
    const user = req.body;
    if (!user || !user.email) {
        return res.status(400).json({ success: false, error: 'Invalid user payload: email is required' });
    }

    const mailOptions = {
        from: `"MT Store Alerts" <${OWNER_EMAIL}>`,
        to: OWNER_EMAIL,
        subject: `🎉 New Customer Registered: ${user.name || user.email}`,
        html: generateSignupEmailHTML(user)
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'Signup email sent successfully' });
    } catch (err) {
        console.error('Signup email failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Route: Place New Order notification.
// The frontend ALREADY writes the order to Realtime Database directly
// (source of truth). This route just double-writes as a safety fallback
// (harmless — same orderId, idempotent) and sends the owner an email.
app.post('/api/orders/new', async (req, res) => {
    const order = req.body;
    if (!order || !order.orderId) {
        return res.status(400).json({ success: false, error: 'Invalid order payload: orderId is required' });
    }

    try {
        // Use update() with a merge so we never clobber fields the frontend
        // may have already set (e.g. if this fires slightly out of order).
        await ordersRef.child(order.orderId).update({
            ...order,
            status: order.status || 'Placed',
            paymentDone: order.paymentDone || false
        });
    } catch (err) {
        console.error('Order DB write failed:', err.message);
        return res.status(500).json({ success: false, error: 'Database write failed: ' + err.message });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    const mailOptions = {
        from: `"MT Store" <${OWNER_EMAIL}>`,
        to: OWNER_EMAIL,
        subject: `🛍️ New Order #${order.orderId} - ${order.paymentMethod} 📦`,
        html: generateOrderEmailHTML(order, baseUrl)
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'Order confirmed and email sent' });
    } catch (err) {
        console.error('Order email failed (order still saved):', err.message);
        // Order data is safe either way (frontend + this route both wrote it) — only email failed.
        res.status(200).json({ success: true, message: 'Order saved but email failed: ' + err.message });
    }
});

// Route: Cancel Order Notification (frontend already sets status=Cancelled in DB;
// this route reads the current order back so the email has full details, then emails).
app.post('/api/orders/cancel', async (req, res) => {
    const { orderId } = req.body;
    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    let orderData = req.body;

    try {
        const snapshot = await ordersRef.child(orderId).once('value');
        if (snapshot.exists()) {
            orderData = snapshot.val();
            await ordersRef.child(orderId).update({ status: 'Cancelled' });
        }
    } catch (err) {
        console.error('Cancel order DB error:', err.message);
        return res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    }

    const mailOptions = {
        from: `"MT Store Alerts" <${OWNER_EMAIL}>`,
        to: OWNER_EMAIL,
        subject: `❌ Order Cancelled #${orderId}`,
        html: generateCancellationEmailHTML(orderData)
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'Cancellation email sent' });
    } catch (err) {
        console.error('Cancellation email failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Approve & Reject Routes (clicked from the owner's email)
app.get('/api/orders/approve/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        const snapshot = await ordersRef.child(orderId).once('value');
        if (snapshot.exists()) {
            await ordersRef.child(orderId).update({ status: 'Approved', paymentDone: true });
            res.send(`<h1 style="color: green; font-family: sans-serif; text-align: center; margin-top: 50px;">Order ${escapeHTML(orderId)} has been APPROVED!</h1>`);
        } else {
            res.status(404).send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Order not found.</h1>`);
        }
    } catch (err) {
        console.error('Approve order error:', err.message);
        res.status(500).send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Database error: ${escapeHTML(err.message)}</h1>`);
    }
});

app.get('/api/orders/reject/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        const snapshot = await ordersRef.child(orderId).once('value');
        if (snapshot.exists()) {
            await ordersRef.child(orderId).update({ status: 'Rejected' });
            res.send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Order ${escapeHTML(orderId)} has been REJECTED.</h1>`);
        } else {
            res.status(404).send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Order not found.</h1>`);
        }
    } catch (err) {
        console.error('Reject order error:', err.message);
        res.status(500).send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Database error: ${escapeHTML(err.message)}</h1>`);
    }
});

app.get('/api/orders/status/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        const snapshot = await ordersRef.child(orderId).once('value');
        if (snapshot.exists()) {
            const data = snapshot.val();
            res.json({ status: data.status, paymentDone: data.paymentDone });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

// Simple health check — useful for confirming the backend + Firebase Admin
// connection are both alive after deploying.
app.get('/api/health', async (req, res) => {
    try {
        await db.ref('.info/connected').once('value');
        res.json({ ok: true, firebase: 'connected', time: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
