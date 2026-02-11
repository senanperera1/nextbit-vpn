import { prisma } from "../config/db.js";
import bcrypt from "bcryptjs";
import { generateToken } from "../utils/genaratetoken.js";
import { sendVerificationEmail } from "../services/emailService.js";
import { randomUUID } from "crypto";

const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    const userexist = await prisma.user.findUnique({ where: { email } });
    if (userexist) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Get default settings
    let defaults = { defaultMaxConfigs: 2, defaultMaxGB: 10, defaultSpeedLimit: 0 };
    try {
      const settings = await prisma.adminSettings.findUnique({ where: { id: 'global' } });
      if (settings) defaults = settings;
    } catch (e) { }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const verificationToken = randomUUID();

    const isDev = process.env.NODE_ENV === 'development';

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        verificationToken: isDev ? null : verificationToken,
        emailVerified: isDev ? true : false,
        maxConfigs: defaults.defaultMaxConfigs,
        allowedmaxgb: defaults.defaultMaxGB,
        speedLimit: defaults.defaultSpeedLimit,
      },
    });

    // Send verification email only in production
    if (!isDev) {
      sendVerificationEmail(email, name, verificationToken).catch(err => {
        console.error('Failed to send verification email:', err);
      });
    }

    res.status(201).json({
      message: isDev
        ? "Account created! You can log in now (dev mode — email verification skipped)."
        : "Account created! Please check your email to verify your account.",
      needsVerification: !isDev,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: "Verification token is required" });
    }

    const user = await prisma.user.findFirst({ where: { verificationToken: token } });
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification token" });
    }

    if (user.emailVerified) {
      return res.json({ message: "Email already verified" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null },
    });

    res.json({ message: "Email verified successfully! You can now log in." });
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.emailVerified) return res.json({ message: "Email already verified" });

    const newToken = randomUUID();
    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken: newToken },
    });

    await sendVerificationEmail(email, user.name, newToken);
    res.json({ message: "Verification email sent" });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const userexist = await prisma.user.findUnique({ where: { email } });
    if (!userexist) {
      return res.status(400).json({ error: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, userexist.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Invalid password" });
    }

    // Check email verification (skip in dev mode)
    if (!userexist.emailVerified && process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        error: "Please verify your email before logging in",
        needsVerification: true,
        email: userexist.email,
      });
    }

    const token = generateToken(userexist, res);

    const { password: _, verificationToken: __, ...safeUser } = userexist;
    res.status(200).json({ message: "User logged in successfully", user: safeUser, token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const logout = async (req, res) => {
  try {
    res.clearCookie("jwt");
    res.status(200).json({ message: "User logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export { signup, signin, logout, verifyEmail, resendVerification };
