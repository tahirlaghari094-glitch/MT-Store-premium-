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

// Static files serve karne ke liye
app.use(express.static(path.join(__dirname, '../public')));

// ---------------- CREDENTIALS ----------------
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// ---------------- REQUIRED ENV VAR CHECK ----------------
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
}

// ---------------- FIREBASE ADMIN SETUP ----------------
if (!admin.apps.length && missingVars.length === 0) {
    try {
        const formattedPrivateKey = process.env.FIREBASE_PRIVATE_KEY 
            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : undefined;

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: formattedPrivateKey,
            }),
            databaseURL: process.env.FIREBASE_DATABASE_URL,
        });
        console.log('Firebase Admin initialized successfully.');
    } catch (err) {
        console.error('Firebase Admin Initialization Error:', err.message);
    }
}

const db = admin.apps.length ? admin.database() : null;
const ordersRef = db ? db.ref('orders') : null;

// Transporter Configuration (Optimized for Serverless)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: OWNER_EMAIL,
        pass: GMAIL_APP_PASSWORD,
    },
    pool: false // Serverless functions ke liye pooling disable karna zaruri hai
});

// HTML-escaping helper
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Helper for Order Items Table
function generateItemsTableHTML(cartItems) {
    if (!cartItems || !cartItems.length) return '<tr><td colspan="4" style="padding:10px; color:#94a3b8;">No items listed</td></tr>';
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

// ---------------- API ROUTES ----------------

// Route: New Order Notification
app.post('/api/orders/new', async (req, res) => {
    const order = req.body;
    if (!order || !order.orderId) {
        return res.status(400).json({ success: false, error: 'Invalid order payload: orderId is required' });
    }

    try {
        if (ordersRef) {
            await ordersRef.child(order.orderId).update({
                ...order,
                status: order.status || 'Placed',
                paymentDone: order.paymentDone || false
            });
        }
    } catch (err) {
        console.error('Order DB write error:', err.message);
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    const mailOptions = {
        from: `"MT Store" <${OWNER_EMAIL}>`,
        to: OWNER_EMAIL,
        subject: `🛍️ New Order #${order.orderId} - ${order.paymentMethod || 'COD'} 📦`,
        html: generateOrderEmailHTML(order, baseUrl)
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("New Order Email Sent:", info.response);
        return res.status(200).json({ success: true, message: 'Order confirmed and email sent successfully' });
    } catch (err) {
        console.error('Order email failed:', err.message);
        return res.status(500).json({ success: false, error: 'Email send failed: ' + err.message });
    }
});

// Route: Cancel Order Notification
app.post('/api/orders/cancel', async (req, res) => {
    const { orderId } = req.body;
    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    let orderData = req.body;

    try {
        if (ordersRef) {
            const snapshot = await ordersRef.child(orderId).once('value');
            if (snapshot.exists()) {
                orderData = { ...snapshot.val(), ...req.body };
                await ordersRef.child(orderId).update({ status: 'Cancelled' });
            }
        }
    } catch (err) {
        console.error('Cancel order DB error:', err.message);
    }

    const mailOptions = {
        from: `"MT Store Alerts" <${OWNER_EMAIL}>`,
        to: OWNER_EMAIL,
        subject: `❌ Order Cancelled #${orderId}`,
        html: generateCancellationEmailHTML(orderData)
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Cancellation Email Sent:", info.response);
        return res.status(200).json({ success: true, message: 'Cancellation email sent' });
    } catch (err) {
        console.error('Cancellation email failed:', err.message);
        return res.status(500).json({ success: false, error: 'Email send failed: ' + err.message });
    }
});

// Approve & Reject Routes
app.get('/api/orders/approve/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        if (ordersRef) {
            await ordersRef.child(orderId).update({ status: 'Approved', paymentDone: true });
        }
        res.send(`<h1 style="color: green; font-family: sans-serif; text-align: center; margin-top: 50px;">Order ${escapeHTML(orderId)} has been APPROVED!</h1>`);
    } catch (err) {
        res.status(500).send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Database error: ${escapeHTML(err.message)}</h1>`);
    }
});

app.get('/api/orders/reject/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        if (ordersRef) {
            await ordersRef.child(orderId).update({ status: 'Rejected' });
        }
        res.send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Order ${escapeHTML(orderId)} has been REJECTED.</h1>`);
    } catch (err) {
        res.status(500).send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Database error: ${escapeHTML(err.message)}</h1>`);
    }
});

// Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.json({ ok: true, server: 'running', time: new Date().toISOString() });
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
