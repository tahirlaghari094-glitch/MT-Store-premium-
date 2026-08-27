const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10000000000000000mb' }));

// Store Owner Credentials
const OWNER_EMAIL = 'lagharitahir08@gmail.com';
const GMAIL_APP_PASSWORD = 'mcfntmzhqnxdghaa'; // App Password Configured

// Configure Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: lagharitahir08@gmail.com,
        pass: mcfntmzhqnxdghaa,
    }
});

// Helper function to build HTML email content
function buildOrderEmailHTML(title, order) {
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
                    <tbody>
                        ${itemsHTML}
                    </tbody>
                </table>

                <div style="margin-top: 20px; text-align: right; font-size: 16px;">
                    <strong>Total Amount: </strong>
                    <span style="color: #2563eb; font-weight: bold; font-size: 18px;">${order.grand_total}</span>
                </div>
            </div>
        </div>
    `;
}

// 1. API Endpoint: New Order Placed
app.post('/api/orders/new', async (req, res) => {
    try {
        const order = req.body;

        const mailOptions = {
            from: `"Qureshi Clothes Store" <${OWNER_EMAIL}>`,
            to: OWNER_EMAIL,
            subject: `🚨 You Have Received A New Order: ${order.orderId}`,
            html: buildOrderEmailHTML('You Have Received A New Order', order)
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'New order email sent.' });
    } catch (error) {
        console.error('Error sending new order email:', error);
        res.status(500).json({ success: false, message: 'Failed to send email.' });
    }
});

// 2. API Endpoint: Order Cancelled
app.post('/api/orders/cancel', async (req, res) => {
    try {
        const order = req.body;

        const mailOptions = {
            from: `"Qureshi Clothes Store" <${OWNER_EMAIL}>`,
            to: OWNER_EMAIL,
            subject: `❌ An Order Is Cancelled: ${order.orderId}`,
            html: buildOrderEmailHTML('An Order Is Cancelled', order)
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'Order cancellation email sent.' });
    } catch (error) {
        console.error('Error sending cancellation email:', error);
        res.status(500).json({ success: false, message: 'Failed to send email.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is active on http://localhost:3000`);
});
