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
app.use(bodyParser.json({ limit: '50mb' }));

// Static files serve karne ke liye
app.use(express.static(path.join(__dirname, '../public')));

// ---------------- CREDENTIALS (from environment variables — NEVER hardcode) ----------------
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// ---------------- FIREBASE ADMIN SETUP (Realtime Database) ----------------
// Private key env vars mein \n ki jagah literal "\n" store hota hai, isliye replace zaroori hai
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY
            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : undefined,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();
const ordersRef = db.ref('orders');

// Basic startup check so missing env vars fail loudly instead of silently
if (!OWNER_EMAIL || !GMAIL_APP_PASSWORD) {
    console.warn('WARNING: OWNER_EMAIL or GMAIL_APP_PASSWORD not set in environment variables.');
}
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_DATABASE_URL) {
    console.warn('WARNING: One or more Firebase environment variables are missing.');
}

// Transporter Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: OWNER_EMAIL,
        pass: GMAIL_APP_PASSWORD,
    }
});

// Helper for Order Items Table (Product Pic, Name, Qty, Price)
function generateItemsTableHTML(cartItems) {
    if (!cartItems || !cartItems.length) return '';
    return cartItems.map(item => `
        <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 10px; text-align: center;">
                <img src="${item.image || 'https://via.placeholder.com/50'}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid #334155;">
            </td>
            <td style="padding: 10px; color: #f8fafc; font-size: 13px;">${item.name} (${item.size || 'N/A'})</td>
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
            <p style="color: #ecfdf5; margin: 4px 0 0 0; font-size: 12px;"><b>Account Name:</b> ${order.easypaisaAccountName || 'N/A'}</p>
            <p style="color: #ecfdf5; margin: 2px 0 0 0; font-size: 12px;"><b>Account Number:</b> ${order.easypaisaAccountNo || 'N/A'}</p>
            <p style="color: #ecfdf5; margin: 2px 0 0 0; font-size: 12px;"><b>TRX ID:</b> ${order.trxId || 'N/A'}</p>
        </div>
    ` : '';

    const approveUrl = `${baseUrl}/api/orders/approve/${order.orderId}`;
    const rejectUrl = `${baseUrl}/api/orders/reject/${order.orderId}`;

    return `
    <div style="background-color: #090d16; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 24px;">
            <h2 style="color: #38bdf8; margin-top: 0; font-size: 20px; border-bottom: 1px solid #1e293b; padding-bottom: 12px;">🛍️ NEW ORDER RECEIVED 📦 [${order.orderId}]</h2>
            
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Customer Name:</b> ${order.customer_name}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Phone Number:</b> ${order.customer_phone}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>User Email:</b> ${order.userEmail}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Delivery Address:</b> ${order.customer_address}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Payment Method:</b> <span style="color: #facc15; font-weight: bold;">${order.paymentMethod}</span></p>

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

            <h3 style="text-align: right; color: #38bdf8; font-size: 18px; margin-top: 15px;">Total: ${order.grand_total}</h3>

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
            <h2 style="color: #ef4444; margin-top: 0; font-size: 20px; border-bottom: 1px solid #1e293b; padding-bottom: 12px;">❌ ORDER CANCELLED ❌ [${order.orderId}]</h2>
            
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Customer Name:</b> ${order.customer_name || 'N/A'}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Phone Number:</b> ${order.customer_phone || 'N/A'}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>User Email:</b> ${order.userEmail || 'N/A'}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Delivery Address:</b> ${order.customer_address || 'N/A'}</p>

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

            <h3 style="text-align: right; color: #ef4444; font-size: 18px; margin-top: 15px;">Total Amount: ${order.grand_total || 'N/A'}</h3>
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
            
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Customer Name:</b> ${user.name || 'N/A'}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Email Address:</b> ${user.email}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Phone Number:</b> ${user.phone || 'N/A'}</p>
            <p style="font-size: 14px; color: #cbd5e1; margin: 5px 0;"><b>Registered On:</b> ${new Date().toLocaleString()}</p>
        </div>
    </div>
    `;
}

// ---------------- API ROUTES ----------------

// Route: New User Registration Notification
app.post('/api/users/signup', async (req, res) => {
    const user = req.body;
    if (!user || !user.email) {
        return res.status(400).json({ success: false, error: 'Invalid user payload' });
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
        res.status(500).json({ success: false, error: err.message });
    }
});

// Route: Place New Order (ab Firebase Realtime Database mein save hota hai)
app.post('/api/orders/new', async (req, res) => {
    const order = req.body;
    if (!order || !order.orderId) {
        return res.status(400).json({ success: false, error: 'Invalid order payload' });
    }

    const orderData = { ...order, status: 'Placed', paymentDone: false };

    try {
        await ordersRef.child(order.orderId).set(orderData);
    } catch (err) {
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
        res.status(200).json({ success: true, message: 'Order created and email sent' });
    } catch (err) {
        // Order Firebase mein save ho chuka hai, sirf email fail hui
        res.status(200).json({ success: true, message: 'Order saved but email failed: ' + err.message });
    }
});

// Route: Cancel Order Notification
app.post('/api/orders/cancel', async (req, res) => {
    const { orderId } = req.body;
    let orderData = req.body;

    try {
        const snapshot = await ordersRef.child(orderId).once('value');
        if (snapshot.exists()) {
            orderData = snapshot.val();
            await ordersRef.child(orderId).update({ status: 'Cancelled' });
        }
    } catch (err) {
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
        res.status(500).json({ success: false, error: err.message });
    }
});

// Approve & Reject Routes
app.get('/api/orders/approve/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        const snapshot = await ordersRef.child(orderId).once('value');
        if (snapshot.exists()) {
            await ordersRef.child(orderId).update({ status: 'Approved', paymentDone: true });
            res.send(`<h1 style="color: green; font-family: sans-serif; text-align: center; margin-top: 50px;">Order ${orderId} has been APPROVED!</h1>`);
        } else {
            res.send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Order not found.</h1>`);
        }
    } catch (err) {
        res.status(500).send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Database error: ${err.message}</h1>`);
    }
});

app.get('/api/orders/reject/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        const snapshot = await ordersRef.child(orderId).once('value');
        if (snapshot.exists()) {
            await ordersRef.child(orderId).update({ status: 'Rejected' });
            res.send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Order ${orderId} has been REJECTED.</h1>`);
        } else {
            res.send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Order not found.</h1>`);
        }
    } catch (err) {
        res.status(500).send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Database error: ${err.message}</h1>`);
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

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
