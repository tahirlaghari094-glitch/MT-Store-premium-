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

// Credentials & Env Variables
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'lagharitahir08@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || 'aiosjqbewpfpoyxu'; 

// In-Memory Orders Store
let storeOrders = {};

// Transporter Configuration with Timeout & Port Settings
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: OWNER_EMAIL,
        pass: GMAIL_APP_PASSWORD,
    },
    connectionTimeout: 10000, // 10 sec timeout
});

// DEBUG: Test Gmail SMTP Connection on Server Startup
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ GMAIL SMTP CONNECTION ERROR:', error.message);
    } else {
        console.log('✅ GMAIL SMTP IS READY TO SEND EMAILS');
    }
});

// Helper for generating styled HTML Email with Buttons
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
    </div>
    `;
}

// ---------------- API ROUTES ----------------

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// DEBUG Endpoint to manually test email sending
app.get('/api/test-email', async (req, res) => {
    try {
        let info = await transporter.sendMail({
            from: `"MT Store Test" <${OWNER_EMAIL}>`,
            to: OWNER_EMAIL,
            subject: 'MT Store Test Email',
            text: 'If you receive this, Nodemailer is working perfectly!'
        });
        res.json({ success: true, response: info.response });
    } catch (err) {
        console.error('❌ TEST EMAIL FAILED:', err);
        res.status(500).json({ success: false, error: err.message, stack: err.stack });
    }
});

app.post('/api/orders/new', async (req, res) => {
    const order = req.body;
    console.log('📦 New Order Request Received:', order ? order.orderId : 'No Order ID');

    if (!order || !order.orderId) {
        return res.status(400).json({ success: false, error: 'Invalid order payload' });
    }

    storeOrders[order.orderId] = { ...order, status: 'Placed', paymentDone: false };

    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    const mailOptions = {
        from: `"MT Store" <${OWNER_EMAIL}>`,
        to: OWNER_EMAIL,
        subject: `New Order #${order.orderId} - ${order.paymentMethod}`,
        html: generateOrderEmailHTML(order, baseUrl)
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ EMAIL SENT SUCCESSFULLY:', info.messageId);
        res.status(200).json({ success: true, message: 'Order created and email sent' });
    } catch (err) {
        console.error('❌ SEND MAIL ERROR:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/orders/approve/:orderId', (req, res) => {
    const { orderId } = req.params;
    if (storeOrders[orderId]) {
        storeOrders[orderId].status = 'Approved';
        storeOrders[orderId].paymentDone = true;
        res.send(`<h1 style="color: green; font-family: sans-serif; text-align: center; margin-top: 50px;">Order ${orderId} has been APPROVED!</h1>`);
    } else {
        res.send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Order not found or state reset.</h1>`);
    }
});

app.get('/api/orders/reject/:orderId', (req, res) => {
    const { orderId } = req.params;
    if (storeOrders[orderId]) {
        storeOrders[orderId].status = 'Rejected';
        res.send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Order ${orderId} has been REJECTED.</h1>`);
    } else {
        res.send(`<h1 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">Order not found or state reset.</h1>`);
    }
});

app.get('/api/orders/status/:orderId', (req, res) => {
    const { orderId } = req.params;
    if (storeOrders[orderId]) {
        res.json({ status: storeOrders[orderId].status, paymentDone: storeOrders[orderId].paymentDone });
    } else {
        res.status(404).json({ error: 'Order not found' });
    }
});

app.post('/api/orders/cancel', (req, res) => {
    const { orderId } = req.body;
    if (storeOrders[orderId]) {
        storeOrders[orderId].status = 'Cancelled';
    }
    res.json({ success: true });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
