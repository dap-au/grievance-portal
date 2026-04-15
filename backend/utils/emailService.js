const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT || 587),
  secure: Number(process.env.EMAIL_PORT || 587) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (to, subject, html) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email credentials are missing. Skipping SMTP send and logging the email preview instead.');
    console.log({ to, subject, html });
    return { mocked: true };
  }

  try {
    return await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.warn(`SMTP send failed (${error.message}). Logging the email preview instead.`);
    console.log({ to, subject, html });
    return { mocked: true, error: error.message };
  }
};

module.exports = { sendEmail };