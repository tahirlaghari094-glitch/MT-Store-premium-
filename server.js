const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Use Environment Variables — never hardcode credentials in code
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'lagharitahir08@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: OWNER_EMAIL,
        pass: GMAIL_APP_PASSWORD,
    }
});

transporter.verify((err, success) => {
    if (err) {
        console.error('❌ EMAIL CONFIG ERROR:', err.message);
    } else {
        console.log('✅ Email server ready to send messages');
    }
});

let storeOrders = {};

function buildOrderEmailHTML(title, order, baseUrl) {
    const itemsHTML = order.cart_items.map(item => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px;">
                <img src="${item.image}" alt="${item.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;" />
            </td>
            <td style="padding: 10px; font-family: Arial, sans-serif;">
                <strong style="color: #0f172a;">${item.name}</strong><br/>
                <span style="font-size: 12px; color: #64748b;">Size: ${item.size} | Qty: ${item.qty}</span>
            </td>
            <td style="padding: 10px; font-family: Arial, sans-serif; font-weight: bold; color: #1d4ed8; text-align: right;">
                Rs. ${(item.price * item.qty).toLocaleString()}
            </td>
        </tr>
    `).join('');

    const approveRejectHTML = (title === 'You Have Received A New Order') ? `
        <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
            <a href="${baseUrl}/api/orders/approve/${order.orderId}" target="_blank" style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; margin-right: 10px;">APPROVE ORDER</a>
            <a href="${baseUrl}/api/orders/reject/${order.orderId}" target="_blank" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">REJECT ORDER</a>
        </div>
    ` : '';

    return `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 25px; border: 1px solid #e2e8f0;">
                <h2 style="color: #1d4ed8; margin-top: 0; text-transform: uppercase;">${title}</h2>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;"/>
                <h3 style="color: #334155; margin-bottom: 8px;">Customer Information</h3>
                <p style="margin: 4px 0; color: #475569;"><strong>Order ID:</strong> ${order.orderId}</p>
                <p style="margin: 4px 0; color: #475569;"><strong>Customer Name:</strong> ${order.customer_name}</p>
                <p style="margin: 4px 0; color: #475569;"><strong>Phone:</strong> ${order.customer_phone}</p>
                <p style="margin: 4px 0; color: #475569;"><strong>Address:</strong> ${order.customer_address}</p>
                <p style="margin: 4px 0; color: #475569;"><strong>Account Email:</strong> ${order.userEmail || 'Guest'}</p>
                <h3 style="color: #334155; margin-top: 20px; margin-bottom: 8px;">Product Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f1f5f9; text-align: left; font-size: 12px; text-transform: uppercase;">
                            <th style="padding: 8px;">Item</th>
                            <th style="padding: 8px;">Details</th>
                            <th style="padding: 8px; text-align: right;">Price</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHTML}</tbody>
                </table>
                <div style="margin-top: 20px; text-align: right; font-size: 16px;">
                    <strong>Total Amount: </strong>
                    <span style="color: #2563eb; font-weight: bold; font-size: 18px;">${order.grand_total}</span>
                </div>
                ${approveRejectHTML}
            </div>
        </div>
    `;
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/orders/new', async (req, res) => {
    try {
        const order = req.body;
        storeOrders[order.orderId] = { ...order, status: 'Placed', paymentDone: false };

        const host = req.get('host');
        const protocol = req.protocol;
        const baseUrl = `${protocol}://${host}`;

        const mailOptions = {
            from: `"MT Store" <${OWNER_EMAIL}>`,
            to: OWNER_EMAIL,
            subject: `🚨 New Order Received: ${order.orderId}`,
            html: buildOrderEmailHTML('You Have Received A New Order', order, baseUrl)
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Order email sent for ${order.orderId}`);
        res.status(200).json({ success: true, message: 'New order email sent.' });
    } catch (error) {
        console.error('❌ Error sending new order email:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/orders/cancel', async (req, res) => {
    try {
        const order = req.body;
        if (storeOrders[order.orderId]) {
            storeOrders[order.orderId].status = 'Cancelled';
        }

        const mailOptions = {
            from: `"MT Store" <${OWNER_EMAIL}>`,
            to: OWNER_EMAIL,
            subject: `❌ Order Cancelled: ${order.orderId}`,
            html: buildOrderEmailHTML('An Order Is Cancelled', order, '')
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Cancel email sent for ${order.orderId}`);
        res.status(200).json({ success: true, message: 'Order cancellation email sent.' });
    } catch (error) {
        console.error('❌ Error sending cancellation email:', error.message);
        res.status(500).json({ success: false, message: error.message });
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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
