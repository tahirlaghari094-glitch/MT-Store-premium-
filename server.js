require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

const OWNER_EMAIL = process.env.OWNER_EMAIL;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

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
const adminConfigRef = db ? db.ref('adminConfig') : null;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: OWNER_EMAIL,
        pass: GMAIL_APP_PASSWORD,
    }
});

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function generateItemsTableHTML(cartItems) {
    if (!cartItems || !cartItems.length) return '<tr><td colspan="4" style="padding:10px; color:#94a3b8;">No items listed</td></tr>';
    return cartItems.map(item => `
        <tr style="border-bottom: 1px solid #334155;">
            <td style="padding: 12px; text-align: center;">
                <img src="${escapeHTML(item.image || 'https://via.placeholder.com/60')}" alt="${escapeHTML(item.name)}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid #d4af37;">
            </td>
            <td style="padding: 12px; color: #f8fafc; font-size: 13px; font-weight: 600;">
                ${escapeHTML(item.name)}<br>
                <span style="color: #d4af37; font-size: 11px;">Size/Type: ${escapeHTML(item.size || 'M')}</span>
            </td>
            <td style="padding: 12px; color: #cbd5e1; font-size: 13px; text-align: center; font-weight: bold;">${item.qty}</td>
            <td style="padding: 12px; color: #38bdf8; font-size: 13px; text-align: right; font-weight: bold;">Rs. ${(item.price * item.qty).toLocaleString()}</td>
        </tr>
    `).join('');
}

function generateOrderEmailHTML(order, baseUrl) {
    const itemsList = generateItemsTableHTML(order.cart_items);
    const easypaisaDetails = order.paymentMethod === 'Easypaisa' ? `
        <div style="background-color: #064e3b; border: 1px solid #059669; padding: 14px; border-radius: 10px; margin-top: 15px;">
            <p style="color: #34d399; margin: 0; font-size: 13px; font-weight: bold;">💎 Easypaisa Verified Payment:</p>
            <p style="color: #ecfdf5; margin: 6px 0 0 0; font-size: 12px;"><b>Sender Name:</b> ${escapeHTML(order.easypaisaAccountName || 'N/A')}</p>
            <p style="color: #ecfdf5; margin: 3px 0 0 0; font-size: 12px;"><b>Sender Phone:</b> ${escapeHTML(order.easypaisaAccountNo || 'N/A')}</p>
            <p style="color: #ecfdf5; margin: 3px 0 0 0; font-size: 12px;"><b>Transaction ID (TRX ID):</b> <span style="color: #facc15; font-family: monospace; font-size: 13px;">${escapeHTML(order.trxId || 'N/A')}</span></p>
        </div>
    ` : '';

    const approveUrl = `${baseUrl}/api/orders/approve/${encodeURIComponent(order.orderId)}`;
    const rejectUrl = `${baseUrl}/api/orders/reject/${encodeURIComponent(order.orderId)}`;

    return `
    <div style="background-color: #090d16; font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 25px; color: #f8fafc;">
        <div style="max-width: 650px; margin: 0 auto; background-color: #0f172a; border: 1px solid #d4af37; border-radius: 14px; padding: 28px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px;">
                <h1 style="color: #d4af37; margin: 0; font-size: 22px; letter-spacing: 2px;">A.K TEXTILES</h1>
                <p style="color: #94a3b8; font-size: 11px; margin: 4px 0 0 0; text-transform: uppercase;">Official VIP Order Notification</p>
            </div>

            <h2 style="color: #38bdf8; margin-top: 0; font-size: 18px;">🛍️ NEW ORDER PLACED: [${escapeHTML(order.orderId)}]</h2>

            <div style="background: #1e293b; padding: 12px 16px; border-radius: 8px; margin-bottom: 15px; font-size: 13px;">
                <p style="margin: 4px 0; color: #cbd5e1;"><b>Customer Name:</b> ${escapeHTML(order.customer_name)}</p>
                <p style="margin: 4px 0; color: #cbd5e1;"><b>Mobile Phone:</b> ${escapeHTML(order.customer_phone)}</p>
                <p style="margin: 4px 0; color: #cbd5e1;"><b>User Account Email:</b> ${escapeHTML(order.userEmail)}</p>
                <p style="margin: 4px 0; color: #cbd5e1;"><b>Complete Address:</b> ${escapeHTML(order.customer_address)}</p>
                <p style="margin: 4px 0; color: #cbd5e1;"><b>Payment Method:</b> <span style="color: #facc15; font-weight: bold;">${escapeHTML(order.paymentMethod)}</span></p>
            </div>

            ${easypaisaDetails}

            <h3 style="color: #f8fafc; font-size: 15px; margin-top: 22px; border-bottom: 1px solid #334155; padding-bottom: 6px;">Ordered Items Details:</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
                <thead>
                    <tr style="background-color: #1e293b; color: #d4af37; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">
                        <th style="padding: 10px; text-align: center;">Image</th>
                        <th style="padding: 10px; text-align: left;">Product Info</th>
                        <th style="padding: 10px; text-align: center;">Qty</th>
                        <th style="padding: 10px; text-align: right;">Total Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsList}
                </tbody>
            </table>

            <h3 style="text-align: right; color: #d4af37; font-size: 20px; margin-top: 18px; font-family: monospace;">Grand Total: ${escapeHTML(order.grand_total)}</h3>

            <div style="margin-top: 35px; padding-top: 20px; border-top: 2px solid #1e293b; text-align: center;">
                <a href="${approveUrl}" target="_blank" style="background-color: #16a34a; color: #ffffff; padding: 12px 26px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; display: inline-block; margin-right: 12px; text-transform: uppercase; letter-spacing: 1px;">Approve Order</a>
                <a href="${rejectUrl}" target="_blank" style="background-color: #dc2626; color: #ffffff; padding: 12px 26px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; display: inline-block; text-transform: uppercase; letter-spacing: 1px;">Reject Order</a>
            </div>
        </div>
    </div>
    `;
}

function generateCancellationEmailHTML(order) {
    const itemsList = generateItemsTableHTML(order.cart_items);
    return `
    <div style="background-color: #090d16; font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 25px; color: #f8fafc;">
        <div style="max-width: 650px; margin: 0 auto; background-color: #0f172a; border: 1px solid #ef4444; border-radius: 14px; padding: 28px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px;">
                <h1 style="color: #d4af37; margin: 0; font-size: 22px; letter-spacing: 2px;">A.K TEXTILES</h1>
                <p style="color: #ef4444; font-size: 11px; margin: 4px 0 0 0; text-transform: uppercase; font-weight: bold;">Order Cancellation Alert</p>
            </div>

            <h2 style="color: #ef4444; margin-top: 0; font-size: 18px;">❌ ORDER CANCELLED: [${escapeHTML(order.orderId)}]</h2>

            <div style="background: #1e293b; padding: 12px 16px; border-radius: 8px; margin-bottom: 15px; font-size: 13px;">
                <p style="margin: 4px 0; color: #cbd5e1;"><b>Customer Name:</b> ${escapeHTML(order.customer_name || 'N/A')}</p>
                <p style="margin: 4px 0; color: #cbd5e1;"><b>Mobile Phone:</b> ${escapeHTML(order.customer_phone || 'N/A')}</p>
                <p style="margin: 4px 0; color: #cbd5e1;"><b>User Email:</b> ${escapeHTML(order.userEmail || 'N/A')}</p>
                <p style="margin: 4px 0; color: #cbd5e1;"><b>Delivery Address:</b> ${escapeHTML(order.customer_address || 'N/A')}</p>
            </div>

            <h3 style="color: #f8fafc; font-size: 15px; margin-top: 22px; border-bottom: 1px solid #334155; padding-bottom: 6px;">Cancelled Items Details:</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
                <thead>
                    <tr style="background-color: #1e293b; color: #ef4444; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">
                        <th style="padding: 10px; text-align: center;">Image</th>
                        <th style="padding: 10px; text-align: left;">Product Info</th>
                        <th style="padding: 10px; text-align: center;">Qty</th>
                        <th style="padding: 10px; text-align: right;">Total Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsList}
                </tbody>
            </table>

            <h3 style="text-align: right; color: #ef4444; font-size: 20px; margin-top: 18px; font-family: monospace;">Total Amount: ${escapeHTML(order.grand_total || 'N/A')}</h3>
        </div>
    </div>
    `;
}

app.post('/api/orders/new', async (req, res) => {
    const order = req.body;
    if (!order || !order.orderId) {
        return res.status(400).json({ success: false, error: 'Invalid order payload' });
    }

    try {
        if (ordersRef) {
            await ordersRef.child(order.orderId).set({
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
        from: `"A.K Textiles VIP Store" <${OWNER_EMAIL}>`,
        to: OWNER_EMAIL,
        subject: `🛍️ New VIP Order #${order.orderId} - ${order.paymentMethod || 'COD'} 📦`,
        html: generateOrderEmailHTML(order, baseUrl)
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("New Order Email Sent:", info.response);
        return res.status(200).json({ success: true, message: 'Order placed & email dispatched' });
    } catch (err) {
        console.error('Order email failed:', err.message);
        return res.status(500).json({ success: false, error: 'Email send failed: ' + err.message });
    }
});

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
            }
            await ordersRef.child(orderId).update({ status: 'Cancelled' });
        }
    } catch (err) {
        console.error('Cancel order DB error:', err.message);
    }

    const mailOptions = {
        from: `"A.K Textiles VIP Store" <${OWNER_EMAIL}>`,
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

app.get('/api/orders/approve/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        if (ordersRef) {
            await ordersRef.child(orderId).update({ status: 'Approved', paymentDone: true });
        }
        res.send(`<h1 style="color: #16a34a; font-family: sans-serif; text-align: center; margin-top: 80px;">✅ Order ${escapeHTML(orderId)} has been successfully APPROVED!</h1>`);
    } catch (err) {
        res.status(500).send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 80px;">Database error: ${escapeHTML(err.message)}</h1>`);
    }
});

app.get('/api/orders/reject/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        if (ordersRef) {
            await ordersRef.child(orderId).update({ status: 'Rejected' });
        }
        res.send(`<h1 style="color: #dc2626; font-family: sans-serif; text-align: center; margin-top: 80px;">❌ Order ${escapeHTML(orderId)} has been REJECTED.</h1>`);
    } catch (err) {
        res.status(500).send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 80px;">Database error: ${escapeHTML(err.message)}</h1>`);
    }
});

app.get('/api/health', (req, res) => {
    res.json({ ok: true, server: 'running', time: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`VIP Server running on http://localhost:${PORT}`);
});

module.exports = app;
