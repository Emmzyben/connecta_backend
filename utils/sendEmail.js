const nodemailer = require("nodemailer");

async function sendEmail(toEmail, subject, message) {
  try {
    // SMTP transport config
    const transporter = nodemailer.createTransport({
      host: "mail.connecta.uk",  
      port: 465,
      secure: true, 
      auth: {
        user: "customer@connecta.uk",
        pass: "Admin2025!",
      },
    });

    await transporter.verify();

    // Send email
    const info = await transporter.sendMail({
      from: '"Connecta" <customer@connecta.uk>',
      to: toEmail,
      subject,
      html: message, // send HTML content
    });

    console.log("✅ Email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("❌ Error sending email:", error.message);
    return false;
  }
}

module.exports = sendEmail;
