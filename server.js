const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const cors = require("cors");
const dotenv = require("dotenv");
const User = require("./Models/User");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// 🔹 MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("DB connected"))
  .catch(err => console.log(err));

// 🔹 Email Transporter Setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 🔹 Signup or Resend OTP (Unified Route)
app.post("/signup-or-send-otp", async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    if (user) {
      if (user.isVerified) {
        return res.status(400).json({ message: "User already verified. Please login." });
      }

      // Update password and resend OTP
      user.password = password; // Will be hashed via pre-save hook
      user.otp = otp;
      user.otpExpires = otpExpires;
      await user.save();
    } else {
      // Create new user
      user = new User({
        email,
        password,
        otp,
        otpExpires,
        isVerified: false,
      });
      await user.save();
    }

    // Send OTP to email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      html: `<p>Your OTP is <b>${otp}</b>. It is valid for 5 minutes.</p>`,
    });

    res.status(200).json({ message: "OTP sent successfully. Please verify." });
  } catch (err) {
    res.status(500).json({ error: "Failed to send OTP", details: err });
  }
});

// 🔹 Verify OTP
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });
    if (user.otpExpires < new Date()) return res.status(400).json({ message: "OTP expired" });

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ message: "OTP verified successfully. You can now login." });
  } catch (err) {
    res.status(500).json({ error: "OTP verification failed", details: err });
  }
});

// 🔹 Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.isVerified) return res.status(403).json({ message: "Please verify OTP first." });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

    res.json({ message: "Login successful", userId: user._id });
  } catch (err) {
    res.status(500).json({ error: "Login failed", details: err });
  }
});

// 🔹 Dashboard (Protected)
app.get("/dashboard", async (req, res) => {
  const { email } = req.query;

  try {
    const user = await User.findOne({ email });
    if (!user || !user.isVerified) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    res.json({ message: `Welcome ${email}, you're verified and logged in.` });
  } catch (err) {
    res.status(500).json({ message: "Dashboard access failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
