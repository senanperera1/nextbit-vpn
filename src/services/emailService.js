import nodemailer from 'nodemailer';
import 'dotenv/config';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.nextbit.online',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER || 'senan@nextbit.online',
        pass: process.env.SMTP_PASS,
    },
});

export async function sendVerificationEmail(email, name, token) {
    const verifyUrl = `${process.env.APP_URL || 'http://localhost:3000'}/verify?token=${token}`;

    const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0f1221; border-radius: 16px; overflow: hidden; border: 1px solid rgba(139, 92, 246, 0.3);">
        <div style="background: linear-gradient(135deg, #7c3aed, #6366f1); padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">⚡ NextBit VPN</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Verify Your Email</p>
        </div>
        <div style="padding: 32px; color: #c4c9e2;">
            <p style="font-size: 16px;">Hey <strong style="color: #fff;">${name}</strong>,</p>
            <p>Thanks for signing up! Click the button below to verify your email and activate your account.</p>
            <div style="text-align: center; margin: 32px 0;">
                <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #6366f1); color: #fff; text-decoration: none; padding: 14px 40px; border-radius: 10px; font-weight: 600; font-size: 15px;">Verify Email</a>
            </div>
            <p style="font-size: 13px; color: #7a7f9a;">If the button doesn't work, copy this link:<br>
            <a href="${verifyUrl}" style="color: #8b5cf6; word-break: break-all;">${verifyUrl}</a></p>
            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0;">
            <p style="font-size: 12px; color: #5a5f7a; text-align: center;">© ${new Date().getFullYear()} NextBit VPN — nextbit.online</p>
        </div>
    </div>`;

    try {
        await transporter.sendMail({
            from: `"NextBit VPN" <${process.env.SMTP_USER || 'senan@nextbit.online'}>`,
            to: email,
            subject: 'Verify your NextBit VPN account',
            html,
        });
        return true;
    } catch (err) {
        console.error('Email send error:', err.message);
        return false;
    }
}
