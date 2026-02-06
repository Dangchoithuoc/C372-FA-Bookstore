const axios = require("axios");
const path = require("path");
const Wallet = require("../models/Wallet");
const paypalService = require("../services/paypal");

const NETS_QR_REQUEST_URL =
  "https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request";

const DEFAULT_TXN_ID =
  "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b";

const NETS_REQUEST_TIMEOUT_MS = 12000;

function loadCourseInitId() {
  try {
    const modulePath = path.join(__dirname, "..", "course_init_id.js");
    const module = require(modulePath);
    return module?.courseInitId || "";
  } catch (error) {
    return "";
  }
}

function getNetsHeaders() {
  return {
    "api-key": process.env.API_KEY,
    "project-id": process.env.PROJECT_ID,
  };
}

async function postWithRetry(url, body, headers, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await axios.post(url, body, {
        headers,
        timeout: NETS_REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      const status = error?.response?.status;
      const isRetryable =
        status === 504 ||
        status === 502 ||
        status === 503 ||
        error?.code === "ECONNABORTED";
      if (!isRetryable || attempt === retries) {
        throw error;
      }
    }
  }
  return null;
}

function parseAmount(raw) {
  const amt = Number(raw);
  if (!Number.isFinite(amt) || amt <= 0) return null;
  return Number(amt.toFixed(2));
}

module.exports = {
  walletPage: async (req, res) => {
    try {
      const { wallet, transactions } = await Wallet.getWallet(req.session.user.id);
      res.render("wallet", {
        user: req.session.user,
        balance: wallet.balance || 0,
        transactions,
        error: req.query.error || null,
        paypalClientId: process.env.PAYPAL_CLIENT_ID
      });
    } catch (err) {
      console.error("Wallet page error:", err);
      res.status(500).send("Could not load wallet");
    }
  },

  paypalCreateOrder: async (req, res) => {
    try {
      const amount = parseAmount(req.body.amount);
      if (!amount) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      req.session.walletTopupAmount = amount;
      const returnUrl = `${req.protocol}://${req.get("host")}/wallet`;
      const cancelUrl = `${req.protocol}://${req.get("host")}/wallet`;
      const order = await paypalService.createOrder(amount.toFixed(2), "SGD", {
        returnUrl,
        cancelUrl
      });
      res.json(order);
    } catch (err) {
      console.error("Wallet PayPal create error", err);
      res.status(500).json({ error: err.message || "Unable to create PayPal order" });
    }
  },

  paypalCaptureOrder: async (req, res) => {
    try {
      const { orderId } = req.body || {};
      if (!orderId) {
        return res.status(400).json({ error: "orderId is required" });
      }
      const captureResult = await paypalService.captureOrder(orderId);
      const amount = parseAmount(req.session.walletTopupAmount);
      if (!amount) {
        return res.status(400).json({ error: "Top up amount not found" });
      }
      await Wallet.credit(req.session.user.id, amount, "topup_paypal");
      req.session.walletTopupAmount = null;
      res.json({ success: true, capture: captureResult, redirectUrl: "/wallet" });
    } catch (err) {
      console.error("Wallet PayPal capture error", err);
      res.status(500).json({ error: err.message || "Unable to capture PayPal order" });
    }
  },

  netsQr: async (req, res) => {
    try {
      const amount = parseAmount(req.body.amount);
      if (!amount) {
        return res.redirect("/wallet");
      }

      const courseInitId = loadCourseInitId();
      const txnId = process.env.NETS_TXN_ID || DEFAULT_TXN_ID;

      const requestBody = {
        txn_id: txnId,
        amt_in_dollars: amount.toFixed(2),
        notify_mobile: 0,
      };

      const response = await postWithRetry(
        NETS_QR_REQUEST_URL,
        requestBody,
        getNetsHeaders(),
        1
      );

      const qrData = response?.data?.result?.data || {};
      if (
        qrData.response_code === "00" &&
        Number(qrData.txn_status) === 1 &&
        qrData.qr_code
      ) {
        const txnRetrievalRef = qrData.txn_retrieval_ref;
        const txnNetsQrId = qrData.txn_nets_qr_id;

        req.session.netsPayment = {
          txnRetrievalRef,
          txnId,
          txnNetsQrId,
        };
        req.session.walletTopupAmount = amount;

        const walletData = await Wallet.getWallet(req.session.user.id);
        return res.render("wallet", {
          user: req.session.user,
          amount: amount.toFixed(2),
          title: "Scan to Top Up",
          qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
          txnRetrievalRef,
          courseInitId,
          networkCode: qrData.network_status,
          timer: 300,
          apiKey: process.env.API_KEY,
          projectId: process.env.PROJECT_ID,
          balance: walletData.wallet.balance || 0,
          transactions: walletData.transactions || [],
          error: req.query.error || null,
          paypalClientId: process.env.PAYPAL_CLIENT_ID
        });
      }

      const errorMsg = qrData.error_message || "Unable to generate the NETS QR code.";
      return res.render("netsTxnFailStatus", {
        user: req.session.user,
        message: errorMsg,
      });
    } catch (error) {
      console.error("Wallet NETS QR error:", error.message);
      res.redirect("/wallet");
    }
  },

  netsSuccess: async (req, res) => {
    try {
      const amount = parseAmount(req.session.walletTopupAmount);
      if (!amount) {
        return res.redirect("/wallet");
      }
      await Wallet.credit(req.session.user.id, amount, "topup_nets");
      req.session.walletTopupAmount = null;
      res.redirect("/wallet");
    } catch (err) {
      console.error("Wallet NETS success error:", err);
      res.redirect("/wallet");
    }
  },

  netsFail: async (req, res) => {
    res.render("netsTxnFailStatus", {
      user: req.session.user,
      message: "Top up failed or timed out."
    });
  }
};
