const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Static files serve karne ke liye
app.use(express.static(path.join(__dirname)));

// Secure Credentials (Environment Variable se load hongi)
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'lagharitahir08@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// In-Memory Orders Store (Vercel Serverless par temporary context hold karta hai)
let storeOrders = {};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: OWNER_EMAIL,
        pass: GMAIL_APP_PASSWORD,
    }
});

// Helper: Email HTML Template with Approve & Reject Buttons
function generateOrderEmailHTML(order, baseUrl) {
    const itemsList = order.cart_items ? order.cart_items.map(item => `
        <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 10px; color: #f8fafc; font-size: 13px;">${item.name} (${item.size})</td>
            <td style="padding: 10px; color: #94a3b8; font-size: 13px; text-align: center;">${item.qty}</td>
            <td style="padding: 10px; color: #38bdf8; font-size: 13px; text-align: right; font-weight: bold;">Rs. ${(item.price * item.qty).toLocaleString()}</td>
        </tr>
    `).join('') : '';

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
            <h2 style="color: #38bdf8; margin-top: 0; font-size: 20px; border-bottom: 1px solid #1e293b; padding-bottom: 12px;">NEW ORDER RECEIVED [${order.orderId}]</h2>
            
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

            <!-- Action Buttons -->
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #1e293b; text-align: center;">
                <a href="${approveUrl}" target="_blank" style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; margin-right: 10px;">APPROVE ORDER</a>
                <a href="${rejectUrl}" target="_blank" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">REJECT ORDER</a>
            </div>
        </div>
    </div>`;
}

// 1. API: New Order Creation & Email Notification
app.post('/api/orders/new', async (req, res) => {
    try {
        const orderData = req.body;
        if (!orderData || !orderData.orderId) {
            return res.status(400).json({ success: false, message: 'Invalid order data' });
        }

        orderData.status = 'Placed';
        orderData.paymentDone = false;
        storeOrders[orderData.orderId] = orderData;

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const baseUrl = `${protocol}://${req.get('host')}`;

        if (GMAIL_APP_PASSWORD) {
            const mailOptions = {
                from: `"MT Store Orders" <${OWNER_EMAIL}>`,
                to: OWNER_EMAIL,
                subject: `🛍️ New Order #${orderData.orderId} - ${orderData.customer_name}`,
                html: generateOrderEmailHTML(orderData, baseUrl)
            };

            await transporter.sendMail(mailOptions);
        }

        res.status(200).json({ success: true, message: 'Order submitted and email sent.' });
    } catch (err) {
        console.error('Error creating order:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. API: Approve Order (Triggers on Admin Email Click)
app.get('/api/orders/approve/:orderId', (req, res) => {
    const { orderId } = req.params;
    if (storeOrders[orderId]) {
        storeOrders[orderId].status = 'Approved';
        storeOrders[orderId].paymentDone = true;
    }
    res.send(`
        <div style="background-color: #090d16; color: #4ade80; font-family: sans-serif; text-align: center; padding: 50px; min-height: 100vh;">
            <h1 style="font-size: 28px;">✅ Order #${orderId} Approved</h1>
            <p style="color: #cbd5e1;">Payment status set to Approved/Done. Customer view will update on polling.</p>
        </div>
    `);
});

// 3. API: Reject Order (Triggers on Admin Email Click)
app.get('/api/orders/reject/:orderId', (req, res) => {
    const { orderId } = req.params;
    if (storeOrders[orderId]) {
        storeOrders[orderId].status = 'Rejected';
    }
    res.send(`
        <div style="background-color: #090d16; color: #f87171; font-family: sans-serif; text-align: center; padding: 50px; min-height: 100vh;">
            <h1 style="font-size: 28px;">❌ Order #${orderId} Rejected</h1>
            <p style="color: #cbd5e1;">Order status set to Rejected.</p>
        </div>
    `);
});

// 4. API: Order Status Checking (For Frontend Client Polling)
app.get('/api/orders/status/:orderId', (req, res) => {
    const { orderId } = req.params;
    const order = storeOrders[orderId];
    if (order) {
        res.json({ success: true, status: order.status, paymentDone: order.paymentDone });
    } else {
        res.json({ success: false, message: 'Order state not cached on server runtime.' });
    }
});

// 5. API: Order Cancellation Handler
app.post('/api/orders/cancel', async (req, res) => {
    try {
        const { orderId } = req.body;
        if (storeOrders[orderId]) {
            storeOrders[orderId].status = 'Cancelled';
        }

        if (GMAIL_APP_PASSWORD) {
            const mailOptions = {
                from: `"MT Store Alerts" <${OWNER_EMAIL}>`,
                to: OWNER_EMAIL,
                subject: `⚠️ Order #${orderId} Cancelled by Customer`,
                html: `<p style="font-family: sans-serif;">Customer cancelled Order <b>#${orderId}</b> within 24 hours.</p>`
            };
            await transporter.sendMail(mailOptions);
        }

        res.status(200).json({ success: true, message: 'Cancellation processed.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Serve frontend for all unmatched routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`MT Store server running on port ${PORT}`);
});
