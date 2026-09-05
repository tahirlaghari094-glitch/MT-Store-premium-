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

// Static Path Configuration
const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));

// Credentials
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'lagharitahir08@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || 'aiosjqbewpfpoyxu';

// Firebase Admin Initialization
let db = null;
try {
    if (!admin.apps.length) {
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;
        if (privateKey) {
            privateKey = privateKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
        }

        if (privateKey && process.env.FIREBASE_CLIENT_EMAIL) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: "mt-store-24open-21915",
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey
                }),
                databaseURL: "https://mt-store-24open-21915-default-rtdb.firebaseio.com"
            });
            db = admin.database();
        }
    } else {
        db = admin.database();
    }
} catch (error) {
    console.error("Firebase Initialization Error:", error.message);
}

// Transporter Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: OWNER_EMAIL,
        pass: GMAIL_APP_PASSWORD,
    }
});

// Helper for Order Items Table
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

// Email HTML Generators
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
    <div style="background-color: #090d16; font-family: sans-serif; padding: 20px; color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 24px;">
            <h2 style="color: #38bdf8; margin-top: 0; font-size: 20px;">🛍️ NEW ORDER RECEIVED [${order.orderId}]</h2>
            <p style="font-size: 14px; color: #cbd5e1;"><b>Customer Name:</b> ${order.customer_name}</p>
            <p style="font-size: 14px; color: #cbd5e1;"><b>Phone:</b> ${order.customer_phone}</p>
            <p style="font-size: 14px; color: #cbd5e1;"><b>Email:</b> ${order.userEmail}</p>
            <p style="font-size: 14px; color: #cbd5e1;"><b>Address:</b> ${order.customer_address}</p>
            <p style="font-size: 14px; color: #cbd5e1;"><b>Payment Method:</b> <span style="color: #facc15;">${order.paymentMethod}</span></p>

            ${easypaisaDetails}

            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <thead>
                    <tr style="background-color: #1e293b; color: #94a3b8; font-size: 12px;">
                        <th style="padding: 8px;">Image</th>
                        <th style="padding: 8px;">Item</th>
                        <th style="padding: 8px;">Qty</th>
                        <th style="padding: 8px; text-align: right;">Price</th>
                    </tr>
                </thead>
                <tbody>${itemsList}</tbody>
            </table>

            <h3 style="text-align: right; color: #38bdf8; margin-top: 15px;">Total: ${order.grand_total}</h3>

            <div style="margin-top: 25px; text-align: center;">
                <a href="${approveUrl}" style="background-color: #16a34a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 10px;">APPROVE ORDER</a>
                <a href="${rejectUrl}" style="background-color: #dc2626; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">REJECT ORDER</a>
            </div>
        </div>
    </div>
    `;
}

// API Routes
app.get('/api', (req, res) => {
    res.json({ message: "API is working!" });
});

app.post('/api/orders/new', async (req, res) => {
    const order = req.body;
    if (!order || !order.orderId) return res.status(400).json({ error: 'Invalid order data' });

    try {
        if (db) await db.ref(`orders/${order.orderId}`).set({ ...order, status: 'Placed' });

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        await transporter.sendMail({
            from: `"MT Store" <${OWNER_EMAIL}>`,
            to: OWNER_EMAIL,
            subject: `🛍️ New Order #${order.orderId}`,
            html: generateOrderEmailHTML(order, baseUrl)
        });

        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/orders/approve/:orderId', async (req, res) => {
    try {
        if (db) await db.ref(`orders/${req.params.orderId}`).update({ status: 'Approved', paymentDone: true });
        res.send("<h1 style='color:green;text-align:center;'>Order Approved Successfully!</h1>");
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/api/orders/reject/:orderId', async (req, res) => {
    try {
        if (db) await db.ref(`orders/${req.params.orderId}`).update({ status: 'Rejected' });
        res.send("<h1 style='color:red;text-align:center;'>Order Rejected!</h1>");
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Fallback Route for Front-end SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

module.exports = app;
